import http from 'http';
import { WebSocketServer } from 'ws';
import { setupWSConnection, setPersistence, docs } from 'y-websocket/bin/utils';
import express from 'express';
import cors from 'cors';
import path from 'path';
import 'dotenv/config';
import { MongodbPersistence } from 'y-mongodb-provider';
import * as Y from 'yjs';
import { QueueEvents } from 'bullmq';
import { codeQueue, connection, initQueue, isOffline } from './queue.js';
import { executeCode, checkDocker } from './executor.js';
import { startWorker } from './worker.js';
import { explainCode, autoFixCode, assistCode } from './ai.js';
import { addExecutionLog, getExecutionLogs, getAdminStats } from './admin.js';
import dns from 'dns/promises';
import fs from 'fs';

// Initialize Express
const app = express();
app.use(cors());
app.use(express.json());

// Global persistence reference
let mdbInstance: MongodbPersistence | null = null;

// Root HTTP route to verify server status
app.get('/', (req, res) => {
  res.send(`CoEdit Sync Server - WebSocket sync, Docker sandbox, and Gemini AI engine active.\n`);
});

function checkAdminAuth(req: express.Request, res: express.Response): boolean {
  const adminKey = process.env.ADMIN_SECRET_KEY || 'admin123';
  const reqKey = req.headers['x-admin-key'];
  if (!reqKey || reqKey !== adminKey) {
    res.status(401).json({ success: false, error: 'Unauthorized: Invalid or missing Admin Secret Key.' });
    return false;
  }
  return true;
}

// Admin Stats Endpoint
app.get('/api/admin/stats', (req, res) => {
  if (!checkAdminAuth(req, res)) return;
  const stats = getAdminStats(docs.size, isOffline);
  return res.json({ success: true, stats });
});

// Admin Execution Audit Logs Endpoint
app.get('/api/admin/logs', (req, res) => {
  if (!checkAdminAuth(req, res)) return;
  const logs = getExecutionLogs();
  return res.json({ success: true, logs });
});

// AI Explanation endpoint
app.post('/api/ai/explain', async (req, res) => {
  const { code, language = 'cpp' } = req.body;
  if (!code || typeof code !== 'string') {
    return res.status(400).json({ success: false, error: 'Missing code payload.' });
  }
  const result = await explainCode(code, language);
  return res.json(result);
});

// Agentic AI Auto-Fix endpoint
app.post('/api/ai/autofix', async (req, res) => {
  const { code, errorLog, language = 'cpp', stdin = '' } = req.body;
  if (!code || typeof code !== 'string') {
    return res.status(400).json({ success: false, error: 'Missing code payload.' });
  }
  const result = await autoFixCode(code, errorLog || '', language, stdin);
  return res.json(result);
});

// AI Copilot Assist endpoint
app.post('/api/ai/assist', async (req, res) => {
  const { prompt, code, language = 'cpp' } = req.body;
  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ success: false, error: 'Missing prompt payload.' });
  }
  const result = await assistCode(prompt, code || '', language);
  return res.json(result);
});

// Code execution endpoint
app.post('/api/execute', async (req, res) => {
  const { code, stdin = '', language = 'cpp', customFilename, roomId = 'test-room-1', sync = false } = req.body;
  if (typeof code !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid code payload.' });
  }

  if (isOffline) {
    // Run execution locally/in-process
    try {
      console.log(`[Queue] Local execution trigger for room: "${roomId}" (sync=${sync})`);
      const jobId = Math.random().toString(36).substring(7);

      if (sync) {
        // Synchronous mode: execute and return result directly via HTTP
        try {
          const result = await executeCode(code, stdin, language, customFilename);
          console.log(`[Queue] Sync execution job #${jobId} completed for room: "${roomId}"`);

          addExecutionLog({
            roomId,
            language,
            executionTimeMs: result.executionTime ?? 0,
            status: result.compilationError ? 'COMPILATION_ERROR' : (result.stderr ? 'RUNTIME_ERROR' : 'SUCCESS'),
            stdout: result.stdout,
            stderr: result.stderr,
            compilationError: result.compilationError,
          });

          // Also try to update Yjs doc if available
          const yDoc = docs.get(roomId);
          if (yDoc) {
            const yMap = yDoc.getMap('terminal-logs');
            yDoc.transact(() => {
              yMap.set('isRunning', false);
              yMap.set('stdout', result.stdout || '');
              yMap.set('stderr', result.stderr || '');
              yMap.set('compilationError', result.compilationError || '');
              yMap.set('executionTime', result.executionTime ?? 0);
            });
          }

          return res.json({
            success: true,
            jobId,
            done: true,
            stdout: result.stdout || '',
            stderr: result.stderr || '',
            compilationError: result.compilationError || '',
            executionTime: result.executionTime ?? 0,
          });
        } catch (execErr: any) {
          console.error(`[Queue] Sync execution job #${jobId} failed:`, execErr);
          return res.json({
            success: false,
            jobId,
            done: true,
            stdout: '',
            stderr: '',
            compilationError: `Execution failed: ${execErr.message || execErr}`,
            executionTime: 0,
          });
        }
      } else {
        // Async mode: fire-and-forget, results come via Yjs WebSocket
        runLocalExecution(jobId, roomId, code, stdin, language, customFilename);
        return res.json({
          success: true,
          jobId: jobId,
        });
      }
    } catch (err: any) {
      console.error('[Execution Error]', err);
      return res.status(500).json({ error: 'Failed to start local execution.' });
    }
  } else {
    try {
      const job = await codeQueue!.add('execute', {
        code,
        stdin,
        language,
        customFilename,
        roomId
      });

      console.log(`[Queue] Added execution job #${job.id} for room: "${roomId}"`);

      return res.json({
        success: true,
        jobId: job.id,
      });
    } catch (err: any) {
      console.error('[Queue Error]', err);
      return res.status(500).json({ error: 'Failed to queue execution job.' });
    }
  }
});

async function runLocalExecution(
  jobId: string,
  roomId: string,
  code: string,
  stdin: string,
  language: string,
  customFilename?: string
) {
  try {
    const result = await executeCode(code, stdin, language, customFilename);
    console.log(`[Queue] Local execution job #${jobId} completed. Syncing results to room: "${roomId}"`);

    // Log to admin execution audit trail
    addExecutionLog({
      roomId,
      language,
      executionTimeMs: result.executionTime ?? 0,
      status: result.compilationError ? 'COMPILATION_ERROR' : (result.stderr ? 'RUNTIME_ERROR' : 'SUCCESS'),
      stdout: result.stdout,
      stderr: result.stderr,
      compilationError: result.compilationError,
    });

    const yDoc = docs.get(roomId);
    if (yDoc) {
      const yMap = yDoc.getMap('terminal-logs');
      yDoc.transact(() => {
        yMap.set('isRunning', false);
        yMap.set('stdout', result.stdout || '');
        yMap.set('stderr', result.stderr || '');
        yMap.set('compilationError', result.compilationError || '');
        yMap.set('executionTime', result.executionTime ?? 0);
      });
    }
  } catch (err: any) {
    console.error(`[Queue] Local execution job #${jobId} failed:`, err);
    const yDoc = docs.get(roomId);
    if (yDoc) {
      const yMap = yDoc.getMap('terminal-logs');
      yDoc.transact(() => {
        yMap.set('isRunning', false);
        yMap.set('compilationError', `Local execution failed: ${err.message || err}`);
      });
    }
  }
}

// Local storage persistence fallback
function setupLocalPersistence() {
  const dbDir = path.join(process.cwd(), 'temp', 'db');
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  setPersistence({
    bindState: (docName, ydoc) => {
      const filePath = path.join(dbDir, `${docName}.bin`);
      if (fs.existsSync(filePath)) {
        try {
          const persistedState = fs.readFileSync(filePath);
          Y.applyUpdate(ydoc, persistedState);
          console.log(`[Local DB] Restored document state for room: "${docName}"`);
        } catch (err) {
          console.error(`[Local DB] Failed to read state for ${docName}:`, err);
        }
      }

      ydoc.on('update', (update: Uint8Array) => {
        try {
          let merged: Uint8Array;
          if (fs.existsSync(filePath)) {
            const existing = fs.readFileSync(filePath);
            merged = Y.mergeUpdates([existing, update]);
          } else {
            merged = update;
          }
          fs.writeFileSync(filePath, merged);
        } catch (err) {
          console.error(`[Local DB] Failed to store update for ${docName}:`, err);
        }
      });
      return Promise.resolve();
    },
    writeState: (docName, ydoc) => {
      return Promise.resolve();
    }
  });
}

// Start everything inside async start function
async function start() {
  // 0. Check Docker status
  await checkDocker();

  // 1. Init queue (checks DNS internally)
  await initQueue();

  if (!isOffline) {
    await startWorker();
  }

  // 2. Init state persistence
  const mongoUrl = process.env.MONGODB_URI;
  let useMongo = false;
  if (!isOffline && mongoUrl) {
    try {
      const url = new URL(mongoUrl);
      await dns.lookup(url.hostname);
      
      mdbInstance = new MongodbPersistence(mongoUrl, {
        collectionName: 'yjs-updates',
        flushSize: 100,
        multipleCollections: true
      });

      setPersistence({
        bindState: async (docName, ydoc) => {
          if (mdbInstance) {
            const persistedYdoc = await mdbInstance.getYDoc(docName);
            const newUpdates = Y.encodeStateAsUpdate(ydoc);
            mdbInstance.storeUpdate(docName, newUpdates);
            Y.applyUpdate(ydoc, Y.encodeStateAsUpdate(persistedYdoc));
          }
          ydoc.on('update', async (update: Uint8Array) => {
            if (mdbInstance) {
              mdbInstance.storeUpdate(docName, update);
            }
          });
        },
        writeState: async (docName, ydoc) => {
          return Promise.resolve();
        }
      });
      useMongo = true;
      console.log('[Database] MongoDB Atlas state persistence initialized successfully.');
    } catch (err) {
      console.warn('[Database] MongoDB Atlas unreachable. Using local file storage.');
    }
  }

  if (!useMongo) {
    setupLocalPersistence();
    console.log('[Database] Local file-based state persistence initialized (documents will persist in temp/db).');
  }

  // 3. Init QueueEvents if online
  if (!isOffline && connection) {
    const queueEvents = new QueueEvents('code-execution', { connection: connection as any });

    queueEvents.on('completed', async ({ jobId, returnvalue }) => {
      const job = await codeQueue!.getJob(jobId);
      if (!job) return;

      const { roomId } = job.data;
      const result = typeof returnvalue === 'string' ? JSON.parse(returnvalue) : returnvalue;

      console.log(`[Queue] Job #${jobId} completed. Syncing results to room: "${roomId}"`);

      const yDoc = docs.get(roomId);
      if (yDoc) {
        const yMap = yDoc.getMap('terminal-logs');
        yDoc.transact(() => {
          yMap.set('isRunning', false);
          yMap.set('stdout', result.stdout || '');
          yMap.set('stderr', result.stderr || '');
          yMap.set('compilationError', result.compilationError || '');
          yMap.set('executionTime', result.executionTime ?? 0);
        });
      }
    });

    queueEvents.on('failed', async ({ jobId, failedReason }) => {
      const job = await codeQueue!.getJob(jobId);
      if (!job) return;

      const { roomId } = job.data;
      console.error(`[Queue Error] Job #${jobId} failed:`, failedReason);

      const yDoc = docs.get(roomId);
      if (yDoc) {
        const yMap = yDoc.getMap('terminal-logs');
        yDoc.transact(() => {
          yMap.set('isRunning', false);
          yMap.set('compilationError', `Execution engine failed: ${failedReason}`);
        });
      }
    });
  }

  // 4. Start Server
  const port = process.env.PORT || 1234;
  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  });

  wss.on('connection', (ws, req) => {
    const roomName = (req.url || '').slice(1).split('?')[0] || 'default';
    console.log(`[Connection] Client connected to room: "${roomName}"`);
    setupWSConnection(ws, req);
  });

  server.listen(port, () => {
    console.log(`[CoEdit] Combined server is running on http://localhost:${port}`);
    console.log(`[CoEdit] WebSockets available at ws://localhost:${port}/{room_name}`);
  });
}

start().catch((err) => {
  console.error('[CoEdit Server] Failed to start:', err);
});

import http from 'http';
import { WebSocketServer } from 'ws';
import { setupWSConnection, setPersistence } from 'y-websocket/bin/utils';
import express from 'express';
import cors from 'cors';
import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import crypto from 'crypto';
import { promisify } from 'util';
import { LeveldbPersistence } from 'y-leveldb';
import * as Y from 'yjs';

const execPromise = promisify(exec);
const port = process.env.PORT || 1234;

let useDocker = process.env.LITE_MODE !== 'true';

// Detect if Docker is available and running
if (useDocker) {
  exec('docker ps', (err) => {
    if (err) {
      console.warn('[Execution Engine] Docker daemon not found or unreachable. Switching to Host-based Lite Mode execution.');
      useDocker = false;
    } else {
      console.log('[Execution Engine] Docker daemon is running. Running in sandboxed mode.');
    }
  });
} else {
  console.log('[Execution Engine] LITE_MODE environment variable is active. Running in Host-based Lite Mode execution.');
}

// Initialize Express
const app = express();
app.use(cors());
app.use(express.json());

const tempDir = path.join(process.cwd(), 'temp');

// Ensure temp directory exists asynchronously
fs.mkdir(tempDir, { recursive: true }).catch((err) => {
  console.error('Failed to create temp directory:', err);
});

// Root HTTP route to verify server status
app.get('/', (req, res) => {
  res.send('CoEdit Sync Server - WebSocket sync and C++ execution engine are active.\n');
});

// POST Code Execution endpoint (Multi-language Docker Sandboxed)
app.post('/api/execute', async (req, res) => {
  const { code, stdin = '', language = 'cpp', customFilename } = req.body;
  if (typeof code !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid code payload.' });
  }

  // Determine file extension, Docker image, and run command based on language
  let defaultFilename: string;
  let dockerImage: string;
  let runCmdTpl: (fn: string) => string;

  switch (language) {
    case 'python':
      defaultFilename = 'main.py';
      dockerImage = 'python:3.9-slim';
      runCmdTpl = (fn) => `python ${fn} < input.txt`;
      break;
    case 'javascript':
      defaultFilename = 'main.js';
      dockerImage = 'node:18-alpine';
      runCmdTpl = (fn) => `node ${fn} < input.txt`;
      break;
    case 'cpp':
    default:
      defaultFilename = 'main.cpp';
      dockerImage = 'gcc';
      runCmdTpl = (fn) => `g++ -o main ${fn} && ./main < input.txt`;
      break;
  }

  // Strict sanitization: alphanumeric, dashes, underscores, and exactly one dot
  const safeFilename = customFilename && /^[a-zA-Z0-9_-]+\.[a-zA-Z0-9]+$/.test(customFilename) 
    ? customFilename 
    : defaultFilename;

  const runCmd = runCmdTpl(safeFilename);
  const id = crypto.randomUUID();
  const tempFolder = path.join(tempDir, `temp_${id}`);
  const codeFile = path.join(tempFolder, safeFilename);
  const inputFile = path.join(tempFolder, 'input.txt');

  try {
    // Create unique temp directory on the host
    await fs.mkdir(tempFolder, { recursive: true });

    // Write source code and standard input to the temp folder
    await fs.writeFile(codeFile, code, 'utf-8');
    await fs.writeFile(inputFile, stdin, 'utf-8');

    let stdout: string;
    let stderr: string;
    let executionTime: number;

    const startTime = performance.now();

    try {
      if (useDocker) {
        // Get absolute path and resolve it for Docker mount compatibility (forward slashes)
        const hostTempPath = path.resolve(tempFolder).replace(/\\/g, '/');

        // Docker command with strict sandboxing and security flags
        const dockerCmd = `docker run --rm --network none --memory="128m" --cpus="0.5" -v "${hostTempPath}:/app" -w /app ${dockerImage} sh -c "${runCmd}"`;

        const result = await execPromise(dockerCmd, { timeout: 5000 });
        stdout = result.stdout;
        stderr = result.stderr;
      } else {
        // Host execution (Lite Mode) fallback
        let hostCmd: string;
        const isWin = process.platform === 'win32';
        switch (language) {
          case 'python':
            const pythonBin = isWin ? 'python' : 'python3';
            hostCmd = `${pythonBin} ${safeFilename} < input.txt`;
            break;
          case 'javascript':
            hostCmd = `node ${safeFilename} < input.txt`;
            break;
          case 'cpp':
          default:
            const exeName = isWin ? 'main.exe' : './main';
            const compileName = isWin ? 'main.exe' : 'main';
            hostCmd = `g++ -o ${compileName} ${safeFilename} && ${exeName} < input.txt`;
            break;
        }

        // Execute directly on the host in the specific tempFolder
        const result = await execPromise(hostCmd, {
          cwd: tempFolder,
          timeout: 5000
        });
        stdout = result.stdout;
        stderr = result.stderr;
      }
      executionTime = Math.round(performance.now() - startTime);

      return res.json({
        success: true,
        stdout,
        stderr,
        compilationError: '',
        executionTime,
      });
    } catch (execError: any) {
      console.error('[Execution Engine Error Details]', execError);
      // Check if the binary was compiled to verify if error is compile-time or run-time
      let compiled = false;
      if (language !== 'cpp') {
        compiled = true;
      } else {
        try {
          await fs.stat(path.join(tempFolder, 'main'));
          compiled = true;
        } catch {
          try {
            await fs.stat(path.join(tempFolder, 'main.exe'));
            compiled = true;
          } catch {
            compiled = false;
          }
        }
      }

      if (!compiled) {
        // Compilation failed; return standard compiler errors
        return res.json({
          success: false,
          compilationError: execError.stderr || execError.message || 'Compilation failed.',
          stdout: '',
          stderr: '',
          executionTime: 0,
        });
      } else {
        // Compilation succeeded but run crashed or timed out
        const isTimeout = execError.killed || execError.signal === 'SIGTERM';
        return res.json({
          success: false,
          compilationError: '',
          stdout: execError.stdout || '',
          stderr: isTimeout 
            ? 'Execution timed out (5-second limit exceeded).' 
            : (execError.stderr || execError.message || 'Execution failed.'),
          executionTime: 0,
        });
      }
    }
  } catch (err: any) {
    console.error('[Execution Error]', err);
    return res.status(500).json({ error: err.message });
  } finally {
    // Delete files in background after a slight delay to release any Windows file handles
    setTimeout(async () => {
      try {
        await fs.rm(tempFolder, { recursive: true, force: true }).catch(() => {});
      } catch (cleanupError) {
        console.error('Failed to cleanup sandboxed directory:', cleanupError);
      }
    }, 1000);
  }
});

// Setup LevelDB persistence
const storageDir = path.join(process.cwd(), 'storage');
const ldb = new LeveldbPersistence(storageDir);

setPersistence({
  bindState: async (docName, ydoc) => {
    const persistedYdoc = await ldb.getYDoc(docName);
    const newUpdates = Y.encodeStateAsUpdate(ydoc);
    ldb.storeUpdate(docName, newUpdates);
    Y.applyUpdate(ydoc, Y.encodeStateAsUpdate(persistedYdoc));
    ydoc.on('update', (update: Uint8Array) => {
      ldb.storeUpdate(docName, update);
    });
  },
  writeState: async (docName, ydoc) => {
    // This is called when all clients leave the document
    return Promise.resolve();
  }
});

// Create HTTP server wrapping the Express app
const server = http.createServer(app);

// Create WebSocket server attached to HTTP server
const wss = new WebSocketServer({ noServer: true });

// Handle protocol upgrades
server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

// Yjs connection handler
wss.on('connection', (ws, req) => {
  const roomName = (req.url || '').slice(1).split('?')[0] || 'default';
  console.log(`[Connection] Client connected to room: "${roomName}"`);
  setupWSConnection(ws, req);
});

server.listen(port, () => {
  console.log(`[CoEdit] Combined server is running on http://localhost:${port}`);
  console.log(`[CoEdit] WebSockets available at ws://localhost:${port}/{room_name}`);
});

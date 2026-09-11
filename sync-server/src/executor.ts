import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import crypto from 'crypto';
import { promisify } from 'util';

const execPromise = promisify(exec);
const tempDir = path.join(process.cwd(), 'temp');

// Create temp directory
fs.mkdir(tempDir, { recursive: true }).catch((err) => {
  console.error('Failed to create temp directory:', err);
});

let useDocker = process.env.LITE_MODE !== 'true';

export async function checkDocker() {
  if (useDocker) {
    return new Promise<void>((resolve) => {
      exec('docker ps', { timeout: 2000 }, (err) => {
        if (err) {
          console.warn('[Worker Engine] Docker daemon not found or unreachable. Running in Host-based Lite Mode.');
          useDocker = false;
        } else {
          console.log('[Worker Engine] Docker daemon is running. Running in sandboxed mode.');
        }
        resolve();
      });
    });
  }
}

export interface ExecutionResult {
  success: boolean;
  stdout: string;
  stderr: string;
  compilationError: string;
  executionTime: number;
}

export async function executeCode(
  code: string,
  stdin: string,
  language: string,
  customFilename?: string
): Promise<ExecutionResult> {
  // Define language variables for compiler/interpreter settings
  let defaultFilename: string;
  let dockerImage: string;
  let runCmdTpl: (fn: string) => string;

  // Set compile commands and environment parameters based on language selection
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
    case 'java':
      defaultFilename = 'Main.java';
      dockerImage = 'openjdk:17-slim';
      runCmdTpl = (fn) => `javac ${fn} && java ${fn.split('.')[0]} < input.txt`;
      break;
    case 'cpp':
    default:
      defaultFilename = 'main.cpp';
      dockerImage = 'gcc';
      runCmdTpl = (fn) => `g++ -o main ${fn} && ./main < input.txt`;
      break;
  }

  const safeFilename = customFilename && /^[a-zA-Z0-9_-]+\.[a-zA-Z0-9]+$/.test(customFilename) 
    ? customFilename 
    : defaultFilename;

  const runCmd = runCmdTpl(safeFilename);
  const id = crypto.randomUUID();
  const tempFolder = path.join(tempDir, `temp_${id}`);
  const codeFile = path.join(tempFolder, safeFilename);
  const inputFile = path.join(tempFolder, 'input.txt');

  try {
    await fs.mkdir(tempFolder, { recursive: true });
    await fs.writeFile(codeFile, code, 'utf-8');
    await fs.writeFile(inputFile, stdin, 'utf-8');

    let stdout: string;
    let stderr: string;
    let executionTime: number;

    const startTime = performance.now();

    try {
      if (useDocker) {
        const hostTempPath = path.resolve(tempFolder).replace(/\\/g, '/');
        const dockerCmd = `docker run --rm --network none --memory="128m" --cpus="0.5" -v "${hostTempPath}:/app" -w /app ${dockerImage} sh -c "${runCmd}"`;
        const result = await execPromise(dockerCmd, { timeout: 5000 });
        stdout = result.stdout;
        stderr = result.stderr;
      } else {
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
          case 'java':
            const javaClassName = safeFilename.split('.')[0];
            hostCmd = `javac ${safeFilename} && java ${javaClassName} < input.txt`;
            break;
          case 'cpp':
          default:
            const exeName = isWin ? 'main.exe' : './main';
            const compileName = isWin ? 'main.exe' : 'main';
            hostCmd = `g++ -o ${compileName} ${safeFilename} && ${exeName} < input.txt`;
            break;
        }

        const timeoutMs = 15000;
        const result = await execPromise(hostCmd, {
          cwd: tempFolder,
          timeout: timeoutMs
        });
        stdout = result.stdout;
        stderr = result.stderr;
      }
      
      executionTime = Math.round(performance.now() - startTime);

      return {
        success: true,
        stdout,
        stderr,
        compilationError: '',
        executionTime,
      };
    } catch (execError: any) {
      let compiled = false;
      if (language !== 'cpp' && language !== 'java') {
        compiled = true;
      } else {
        try {
          if (language === 'cpp') {
            try {
              await fs.stat(path.join(tempFolder, 'main'));
              compiled = true;
            } catch {
              await fs.stat(path.join(tempFolder, 'main.exe'));
              compiled = true;
            }
          } else {
            const classFile = `${safeFilename.split('.')[0]}.class`;
            await fs.stat(path.join(tempFolder, classFile));
            compiled = true;
          }
        } catch {
          compiled = false;
        }
      }

      const rawErr = execError.stderr || execError.stdout || execError.message || '';
      if (rawErr.includes('not recognized') || rawErr.includes('command not found') || rawErr.includes('Python was not found')) {
        let missingTool = 'compiler/interpreter';
        if (language === 'python') missingTool = 'Python (python/py)';
        else if (language === 'java') missingTool = 'Java Development Kit (javac/java)';
        else if (language === 'cpp') missingTool = 'C++ compiler (g++)';
        
        return {
          success: false,
          compilationError: `Host Environment Error: ${missingTool} is not installed or not in PATH on this server. Please install it or start Docker for sandboxed execution.`,
          stdout: '',
          stderr: '',
          executionTime: 0,
        };
      }

      if (!compiled) {
        return {
          success: false,
          compilationError: execError.stderr || execError.message || 'Compilation failed.',
          stdout: '',
          stderr: '',
          executionTime: 0,
        };
      } else {
        const isTimeout = execError.killed || execError.signal === 'SIGTERM';
        return {
          success: false,
          compilationError: '',
          stdout: execError.stdout || '',
          stderr: isTimeout 
            ? 'Execution timed out (15-second limit exceeded).' 
            : (execError.stderr || execError.message || 'Execution failed.'),
          executionTime: 0,
        };
      }
    }
  } catch (err: any) {
    console.error('[Executor Error]', err);
    throw err;
  } finally {
    setTimeout(async () => {
      try {
        await fs.rm(tempFolder, { recursive: true, force: true }).catch(() => {});
      } catch (cleanupError) {
        console.error('Failed to cleanup sandboxed directory:', cleanupError);
      }
    }, 1000);
  }
}

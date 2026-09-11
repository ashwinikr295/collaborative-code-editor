import 'dotenv/config';
import { Worker } from 'bullmq';
import { connection, initQueue, isOffline } from './queue.js';
import { executeCode, checkDocker } from './executor.js';

let workerInstance: Worker | null = null;

export async function startWorker() {
  if (workerInstance) return workerInstance;

  await initQueue();
  
  if (isOffline) {
    console.log('[Worker Engine] Running in local offline mode. In-process execution will handle jobs. Worker process is idle.');
    return null;
  }

  await checkDocker();

  console.log('[Worker Engine] Active and listening to BullMQ execution queue...');

  /**
   * Instantiate the BullMQ Worker.
   * Listens to the 'code-execution' queue in Redis.
   * Executes compiling and running steps.
   * Concurrency is capped at 2 (it will process at most 2 jobs at the same time to prevent CPU choking).
   */
  workerInstance = new Worker('code-execution', async (job) => {
    const { code, stdin = '', language = 'cpp', customFilename } = job.data;
    console.log(`[Worker] Processing job #${job.id} for language: "${language}"`);
    return await executeCode(code, stdin, language, customFilename);
  }, {
    connection: connection as any,
    concurrency: 2, // Process up to 2 execution jobs at the same time to limit CPU spikes
  });

  workerInstance.on('active', (job) => {
    console.log(`[Worker] Job #${job.id} has started execution.`);
  });

  workerInstance.on('completed', (job, result) => {
    console.log(`[Worker] Job #${job.id} completed successfully.`);
  });

  workerInstance.on('failed', (job, err) => {
    console.error(`[Worker] Job #${job?.id} failed with error:`, err);
  });

  return workerInstance;
}

// Auto-start if executed directly (e.g. via npm run worker)
if (process.argv[1]?.includes('worker')) {
  startWorker().catch(err => {
    console.error('[Worker Engine] Initialization error:', err);
  });
}


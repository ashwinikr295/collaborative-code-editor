import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import dns from 'dns/promises';

// Load connection details from the private environment variable
const redisUrl = process.env.REDIS_URL;

export let connection: Redis | null = null;
export let codeQueue: Queue | null = null;
export let isOffline = false;

export async function initQueue() {
  if (!redisUrl) {
    console.warn('[Queue] REDIS_URL environment variable is missing. Running in local offline mode.');
    isOffline = true;
    return;
  }

  try {
    const url = new URL(redisUrl);
    // Perform a fast lookup to check dns resolution
    await dns.lookup(url.hostname);

    // Establish Redis connection client.
    // Note: maxRetriesPerRequest must be set to null for compatibility with BullMQ.
    connection = new Redis(redisUrl, {
      maxRetriesPerRequest: null,
      lazyConnect: true, // Do not connect immediately
    });

    // Verify connection works
    await connection.connect();
    
    // Instantiate and export the BullMQ Queue under the namespace 'code-execution'
    codeQueue = new Queue('code-execution', {
      connection: connection as any,
    });
    console.log('[Queue] Redis connection established. BullMQ is ready.');
  } catch (err: any) {
    console.warn('[Queue] Failed to resolve Redis hostname or connect. Falling back to local offline mode.');
    connection = null;
    codeQueue = null;
    isOffline = true;
  }
}

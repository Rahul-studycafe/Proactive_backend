import { Queue, Worker, Job } from 'bullmq';
import mongoose from 'mongoose';
import { getRedisConnection } from '../config/redis';
import { scanOverduePhysicalDocumentsService } from '../services/physical-document.service';

export const DOCS_OVERDUE_QUEUE_NAME = 'docs-overdue-scanner';

export interface DocsOverdueJobData {
  tenantId?: string;
  referenceDate?: string;
  runType: 'Cron' | 'Manual';
}

let docsOverdueQueue: Queue<DocsOverdueJobData> | null = null;
let docsOverdueWorker: Worker<DocsOverdueJobData> | null = null;

/**
 * Returns or initializes the BullMQ Docs Overdue Scanner Queue
 */
export const getDocsOverdueQueue = (): Queue<DocsOverdueJobData> => {
  if (!docsOverdueQueue) {
    const connection = getRedisConnection();
    docsOverdueQueue = new Queue<DocsOverdueJobData>(DOCS_OVERDUE_QUEUE_NAME, {
      connection,
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 200,
        attempts: 2,
        backoff: {
          type: 'exponential',
          delay: 1000
        }
      }
    });

    docsOverdueQueue.on('error', (err) => {
      console.warn('[BullMQ Docs Overdue Queue Warning]:', err.message);
    });
  }

  return docsOverdueQueue;
};

/**
 * Starts the BullMQ Worker to process background overdue document scans
 */
export const startDocsOverdueWorker = (): Worker<DocsOverdueJobData> => {
  if (!docsOverdueWorker) {
    const connection = getRedisConnection();

    docsOverdueWorker = new Worker<DocsOverdueJobData, any>(
      DOCS_OVERDUE_QUEUE_NAME,
      async (job: Job<DocsOverdueJobData>) => {
        const { tenantId, referenceDate } = job.data;

        const summary = await scanOverduePhysicalDocumentsService(
          tenantId ? new mongoose.Types.ObjectId(tenantId) : undefined,
          referenceDate ? new Date(referenceDate) : new Date()
        );

        return summary;
      },
      {
        connection,
        concurrency: 1
      }
    );

    docsOverdueWorker.on('completed', (job: Job, result: any) => {
      console.log(
        `[Docs Overdue Worker] Job ${job.id} completed. Documents marked overdue: ${result?.updatedOverdueCount}`
      );
    });

    docsOverdueWorker.on('failed', (job: Job | undefined, err: Error) => {
      console.error(`[Docs Overdue Worker] Job ${job?.id} failed:`, err.message);
    });

    docsOverdueWorker.on('error', (err) => {
      console.warn('[Docs Overdue Worker Warning]:', err.message);
    });
  }

  return docsOverdueWorker;
};

/**
 * Cleanly closes the queue and worker
 */
export const closeDocsOverdueQueue = async (): Promise<void> => {
  if (docsOverdueWorker) {
    await docsOverdueWorker.close();
    docsOverdueWorker = null;
  }
  if (docsOverdueQueue) {
    await docsOverdueQueue.close();
    docsOverdueQueue = null;
  }
};

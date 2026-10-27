import { Queue, Worker, Job } from 'bullmq';
import mongoose from 'mongoose';
import { getRedisConnection } from '../config/redis';
import { scanDscExpiriesService, DscExpiryScanSummary } from '../services/dsc.service';

export const DSC_EXPIRY_QUEUE_NAME = 'dsc-expiry-scanner';

export interface DscExpiryJobData {
  tenantId?: string;
  referenceDate?: string;
  runType: 'Cron' | 'Manual';
}

let dscExpiryQueue: Queue<DscExpiryJobData> | null = null;
let dscExpiryWorker: Worker<DscExpiryJobData> | null = null;

/**
 * Returns or initializes the BullMQ DSC Expiry Scanner Queue
 */
export const getDscExpiryQueue = (): Queue<DscExpiryJobData> => {
  if (!dscExpiryQueue) {
    const connection = getRedisConnection();
    dscExpiryQueue = new Queue<DscExpiryJobData>(DSC_EXPIRY_QUEUE_NAME, {
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

    dscExpiryQueue.on('error', (err) => {
      console.warn('[BullMQ DSC Queue Warning]:', err.message);
    });
  }

  return dscExpiryQueue;
};

/**
 * Starts the BullMQ Worker to process background DSC expiry scans
 */
export const startDscExpiryWorker = (): Worker<DscExpiryJobData> => {
  if (!dscExpiryWorker) {
    const connection = getRedisConnection();

    dscExpiryWorker = new Worker<DscExpiryJobData, DscExpiryScanSummary>(
      DSC_EXPIRY_QUEUE_NAME,
      async (job: Job<DscExpiryJobData>) => {
        const { tenantId, referenceDate } = job.data;

        const summary = await scanDscExpiriesService(
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

    dscExpiryWorker.on('completed', (job: Job, result: any) => {
      console.log(`[DSC Expiry Worker] Job ${job.id} completed. Tasks created: ${result?.tasksCreated}, Alerts: ${result?.emailsDispatched}`);
    });

    dscExpiryWorker.on('failed', (job: Job | undefined, err: Error) => {
      console.error(`[DSC Expiry Worker] Job ${job?.id} failed:`, err.message);
    });

    dscExpiryWorker.on('error', (err) => {
      console.warn('[DSC Expiry Worker Warning]:', err.message);
    });
  }

  return dscExpiryWorker;
};

/**
 * Cleanly closes the queue and worker
 */
export const closeDscExpiryQueue = async (): Promise<void> => {
  if (dscExpiryWorker) {
    await dscExpiryWorker.close();
    dscExpiryWorker = null;
  }
  if (dscExpiryQueue) {
    await dscExpiryQueue.close();
    dscExpiryQueue = null;
  }
};

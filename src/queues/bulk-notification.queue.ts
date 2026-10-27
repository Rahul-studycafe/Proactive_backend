import { Queue, Worker, Job } from 'bullmq';
import { getRedisConnection } from '../config/redis';
import {
  BulkNotificationJobPayload,
  processBulkNotifications
} from '../services/notification.service';

export const BULK_NOTIFICATION_QUEUE_NAME = 'bulk-notifications';

let bulkNotificationQueue: Queue<BulkNotificationJobPayload> | null = null;
let bulkNotificationWorker: Worker<BulkNotificationJobPayload> | null = null;

export const getBulkNotificationQueue = (): Queue<BulkNotificationJobPayload> => {
  if (!bulkNotificationQueue) {
    const connection = getRedisConnection();
    bulkNotificationQueue = new Queue<BulkNotificationJobPayload>(
      BULK_NOTIFICATION_QUEUE_NAME,
      {
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
      }
    );

    bulkNotificationQueue.on('error', (err) => {
      console.warn('[BullMQ Bulk Notification Queue Warning]:', err.message);
    });
  }

  return bulkNotificationQueue;
};

export const startBulkNotificationWorker = (): Worker<BulkNotificationJobPayload> => {
  if (!bulkNotificationWorker) {
    const connection = getRedisConnection();

    bulkNotificationWorker = new Worker<BulkNotificationJobPayload>(
      BULK_NOTIFICATION_QUEUE_NAME,
      async (job: Job<BulkNotificationJobPayload>) => {
        return processBulkNotifications(job.data);
      },
      {
        connection,
        concurrency: 5
      }
    );

    bulkNotificationWorker.on('completed', (job: Job, result: any) => {
      console.log(
        `[Bulk Notification Worker] Job ${job.id} dispatched to ${result?.dispatchedCount} recipients.`
      );
    });

    bulkNotificationWorker.on('failed', (job: Job | undefined, err: Error) => {
      console.error(
        `[Bulk Notification Worker] Job ${job?.id} failed:`,
        err.message
      );
    });
  }

  return bulkNotificationWorker;
};

/**
 * Dispatch job: Attempts to enqueue via BullMQ; if Redis is unreachable, processes in-process
 */
export const dispatchBulkNotificationJob = async (
  payload: BulkNotificationJobPayload
): Promise<{ jobId: string; status: string; totalRecipients: number }> => {
  try {
    const queue = getBulkNotificationQueue();
    const job = await queue.add('send-bulk-notifications', payload);
    return {
      jobId: job.id || `job_${Date.now()}`,
      status: 'Queued',
      totalRecipients: payload.recipientIds.length
    };
  } catch {
    // Non-blocking in-process fallback if local Redis is down (e.g. testing)
    setImmediate(async () => {
      try {
        await processBulkNotifications(payload);
      } catch (err) {
        console.error('[In-Process Fallback Bulk Notification Error]:', err);
      }
    });

    return {
      jobId: `fallback_${Date.now()}`,
      status: 'Queued',
      totalRecipients: payload.recipientIds.length
    };
  }
};

export const closeBulkNotificationQueue = async (): Promise<void> => {
  if (bulkNotificationWorker) {
    await bulkNotificationWorker.close();
    bulkNotificationWorker = null;
  }
  if (bulkNotificationQueue) {
    await bulkNotificationQueue.close();
    bulkNotificationQueue = null;
  }
};

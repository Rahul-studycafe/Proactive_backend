import { Queue, Worker, Job } from 'bullmq';
import mongoose from 'mongoose';
import { getRedisConnection } from '../config/redis';
import {
  scanAndGenerateRecurringTasks,
  AutomationExecutionSummary
} from '../services/task-generation.service';

export const TASK_AUTOMATION_QUEUE_NAME = 'task-automation';

export interface TaskAutomationJobData {
  tenantId?: string;
  clientId?: string;
  serviceId?: string;
  forceAll?: boolean;
  runType: 'Cron' | 'Manual';
  triggeredBy?: string;
  referenceDate?: string;
}

let taskAutomationQueue: Queue<TaskAutomationJobData> | null = null;
let taskAutomationWorker: Worker<TaskAutomationJobData> | null = null;

/**
 * Returns or initializes the BullMQ Task Automation Queue
 */
export const getTaskAutomationQueue = (): Queue<TaskAutomationJobData> => {
  if (!taskAutomationQueue) {
    const connection = getRedisConnection();
    taskAutomationQueue = new Queue<TaskAutomationJobData>(TASK_AUTOMATION_QUEUE_NAME, {
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

    taskAutomationQueue.on('error', (err) => {
      console.warn('[BullMQ Queue Warning]:', err.message);
    });
  }

  return taskAutomationQueue;
};

/**
 * Starts the BullMQ Worker to process background task generation jobs
 */
export const startAutomationWorker = (): Worker<TaskAutomationJobData> => {
  if (!taskAutomationWorker) {
    const connection = getRedisConnection();

    taskAutomationWorker = new Worker<TaskAutomationJobData, AutomationExecutionSummary>(
      TASK_AUTOMATION_QUEUE_NAME,
      async (job: Job<TaskAutomationJobData>) => {
        const { tenantId, clientId, serviceId, forceAll, runType, triggeredBy, referenceDate } =
          job.data;

        const summary = await scanAndGenerateRecurringTasks({
          tenantId: tenantId ? new mongoose.Types.ObjectId(tenantId) : undefined,
          clientId: clientId ? new mongoose.Types.ObjectId(clientId) : undefined,
          serviceId: serviceId ? new mongoose.Types.ObjectId(serviceId) : undefined,
          forceAll: forceAll ?? false,
          runType: runType || 'Cron',
          triggeredBy: triggeredBy ? new mongoose.Types.ObjectId(triggeredBy) : undefined,
          referenceDate: referenceDate ? new Date(referenceDate) : new Date()
        });

        return summary;
      },
      {
        connection,
        concurrency: 2
      }
    );

    taskAutomationWorker.on('completed', (job: Job, result: any) => {
      console.log(`[BullMQ Worker] Job ${job.id} completed. Tasks created: ${result?.tasksCreated}`);
    });

    taskAutomationWorker.on('failed', (job: Job | undefined, err: Error) => {
      console.error(`[BullMQ Worker] Job ${job?.id} failed with error:`, err.message);
    });

    taskAutomationWorker.on('error', (err) => {
      console.warn('[BullMQ Worker Warning]:', err.message);
    });
  }

  return taskAutomationWorker;
};

/**
 * Closes connections cleanly for tests and graceful shutdown
 */
export const closeAutomationQueue = async (): Promise<void> => {
  if (taskAutomationWorker) {
    await taskAutomationWorker.close();
    taskAutomationWorker = null;
  }
  if (taskAutomationQueue) {
    await taskAutomationQueue.close();
    taskAutomationQueue = null;
  }
};

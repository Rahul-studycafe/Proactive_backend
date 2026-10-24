import app from './app';
import dotenv from 'dotenv';
import connectDB from './config/db';
import dns from 'node:dns';

// Force Node.js to prioritize IPv4 over IPv6. 
// Fixes ENETUNREACH errors on servers that have IPv6 disabled/unreachable (like many Docker/VPS environments).
dns.setDefaultResultOrder('ipv4first');

dotenv.config();

const PORT = process.env.PORT || 5000;

import { getTaskAutomationQueue, startAutomationWorker } from './queues/task-automation.queue';

const startServer = async () => {
  // Connect to Database
  await connectDB();

  // Initialize BullMQ Recurring Task Automation Worker in non-test mode
  if (process.env.NODE_ENV !== 'test') {
    try {
      const queue = getTaskAutomationQueue();
      startAutomationWorker();
      await queue.add(
        'daily-task-recurrence',
        { runType: 'Cron' },
        {
          jobId: 'daily-task-recurrence',
          repeat: { pattern: '0 0 * * *' },
          removeOnComplete: 50,
          removeOnFail: 200
        }
      );
      console.log('[BullMQ] Daily recurring task cron worker registered (0 0 * * *).');
    } catch (err: any) {
      console.warn('[BullMQ] Could not initialize daily recurrence cron:', err.message);
    }
  }

  // Start Express Server
  const server = app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });

  return server;
};

const serverPromise = startServer();

export default serverPromise;

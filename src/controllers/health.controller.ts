import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { sendSuccess } from '../utils/ApiResponse';
import os from 'os';

export const getHealthMetrics = (req: Request, res: Response) => {
    const memoryUsage = process.memoryUsage();
    
    const dbStatusMap: Record<number, string> = {
        0: 'disconnected',
        1: 'connected',
        2: 'connecting',
        3: 'disconnecting',
        99: 'uninitialized',
    };

    const formatMemory = (bytes: number) => {
        return `${Math.round(bytes / 1024 / 1024 * 100) / 100} MB`;
    };

    const metrics = {
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: {
            server: Math.round(process.uptime()) + ' seconds',
            system: Math.round(os.uptime()) + ' seconds'
        },
        database: {
            state: dbStatusMap[mongoose.connection.readyState] || 'unknown',
            host: mongoose.connection.host || 'unknown',
            name: mongoose.connection.name || 'unknown'
        },
        memory: {
            rss: formatMemory(memoryUsage.rss),
            heapTotal: formatMemory(memoryUsage.heapTotal),
            heapUsed: formatMemory(memoryUsage.heapUsed),
            external: formatMemory(memoryUsage.external),
            systemFree: formatMemory(os.freemem()),
            systemTotal: formatMemory(os.totalmem())
        },
        system: {
            pid: process.pid,
            nodeVersion: process.version,
            platform: process.platform,
            cpuCores: os.cpus().length,
            loadAverage: os.loadavg()
        }
    };

    // If DB is disconnected, return 503 instead of 200
    if (mongoose.connection.readyState !== 1) {
        metrics.status = 'DEGRADED';
        return sendSuccess(res, 503, 'System health degraded (Database disconnected)', metrics);
    }

    return sendSuccess(res, 200, 'System is healthy', metrics);
};

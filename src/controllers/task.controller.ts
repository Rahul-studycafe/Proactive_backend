import { Request, Response } from 'express';
import { asyncHandler } from '../utils/async-handler';
import { sendSuccess } from '../utils/ApiResponse';
import { ApiError } from '../utils/ApiError';
import { Task, TASK_STATUSES } from '../models/Task';
import { Service } from '../modules/services/schemas';
import { z } from 'zod';
import mongoose from 'mongoose';

const createTaskSchema = z.object({
  clientId: z.string(),
  serviceId: z.string().optional(),
  assignedUserId: z.string().optional(),
  title: z.string().min(1),
  description: z.string().optional(),
  priority: z.enum(['Low', 'Medium', 'High', 'Urgent']).optional(),
  period: z.object({
    month: z.number().min(1).max(12).optional(),
    year: z.number().optional(),
    label: z.string().optional()
  }).optional(),
  dueDate: z.string().optional(),
  customFieldValues: z.record(z.string(), z.any()).optional()
});

const updateTaskSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  status: z.enum(['Pending', 'In Progress', 'Under Review', 'On Hold', 'Completed', 'Cancelled'] as any).optional(),
  priority: z.enum(['Low', 'Medium', 'High', 'Urgent']).optional(),
  assignedUserId: z.string().optional(),
  dueDate: z.string().optional(),
  customFieldValues: z.record(z.string(), z.any()).optional()
});

export const createTask = asyncHandler(async (req: Request, res: Response) => {
  const data = createTaskSchema.parse(req.body);
  
  let checklist: any[] = [];
  if (data.serviceId) {
    const service = await Service.findOne({ _id: data.serviceId, tenantId: req.tenantId });
    if (service && service.checklist) {
      checklist = service.checklist.map((step: any) => ({
        stepName: step.stepName,
        isCompleted: false
      }));
    }
  }

  const task = await Task.create({
    tenantId: req.tenantId,
    ...data,
    creationType: 'manual',
    checklist
  });

  sendSuccess(res, 201, 'Task created successfully', task);
});

export const getTasks = asyncHandler(async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;
  const skip = (page - 1) * limit;

  // Build query
  const query: any = { tenantId: req.tenantId };
  
  if (req.query.status) query.status = req.query.status;
  if (req.query.clientId) query.clientId = req.query.clientId;
  if (req.query.serviceId) query.serviceId = req.query.serviceId;
  
  // Phase 36: Enforce ScopeFilter (e.g. assignedUserId = req.user._id)
  const scopeFilter = (req as any).scopeFilter;
  if (scopeFilter) {
    Object.assign(query, scopeFilter);
  }

  const [tasks, total] = await Promise.all([
    Task.find(query)
      .populate('clientId', 'name fileNo')
      .populate('serviceId', 'name')
      .populate('assignedUserId', 'name photoUrl')
      .sort({ dueDate: 1, createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Task.countDocuments(query)
  ]);

  sendSuccess(res, 200, 'Success', {
    tasks,
    pagination: {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit)
    }
  });
});

export const getTaskById = asyncHandler(async (req: Request, res: Response) => {
  const scopeFilter = (req as any).scopeFilter || {};
  const task = await Task.findOne({ _id: req.params.id, tenantId: req.tenantId, ...scopeFilter })
    .populate('clientId', 'name fileNo')
    .populate('serviceId', 'name')
    .populate('assignedUserId', 'name photoUrl')
    .populate('checklist.completedBy', 'name photoUrl')
    .populate('notes.createdBy', 'name photoUrl');

  if (!task) throw new ApiError(404, 'Task not found or access denied by scope');

  sendSuccess(res, 200, 'Success', task);
});

export const updateTask = asyncHandler(async (req: Request, res: Response) => {
  const data = updateTaskSchema.parse(req.body);
  const scopeFilter = (req as any).scopeFilter || {};
  
  const task = await Task.findOne({ _id: req.params.id, tenantId: req.tenantId, ...scopeFilter });
  if (!task) throw new ApiError(404, 'Task not found or access denied by scope');

  // Phase 37: Validate Status Transition
  if (data.status === 'Completed' && task.status !== 'Completed') {
    const incompleteStep = task.checklist.find(c => !c.isCompleted);
    if (incompleteStep) {
      throw new ApiError(400, 'Cannot complete task. Checklist is incomplete.');
    }
    task.completedAt = new Date();
  } else if (data.status && data.status !== 'Completed') {
    task.completedAt = undefined;
  }

  Object.assign(task, data);
  await task.save();

  sendSuccess(res, 200, 'Task updated successfully', task);
});

export const toggleChecklistStep = asyncHandler(async (req: Request, res: Response) => {
  const { stepIndex } = req.params;
  const { isCompleted } = req.body; // Boolean
  const scopeFilter = (req as any).scopeFilter || {};

  const task = await Task.findOne({ _id: req.params.id, tenantId: req.tenantId, ...scopeFilter });
  if (!task) throw new ApiError(404, 'Task not found');

  const idx = parseInt(stepIndex as string, 10);
  if (isNaN(idx) || idx < 0 || idx >= task.checklist.length) {
    throw new ApiError(400, 'Invalid checklist index');
  }

  if (isCompleted) {
    task.checklist[idx].isCompleted = true;
    task.checklist[idx].completedAt = new Date();
    task.checklist[idx].completedBy = (req as any).user._id;
  } else {
    task.checklist[idx].isCompleted = false;
    task.checklist[idx].completedAt = undefined;
    task.checklist[idx].completedBy = undefined;
  }

  await task.save();

  sendSuccess(res, 200, 'Checklist updated', task.checklist[idx]);
});

export const addTaskNote = asyncHandler(async (req: Request, res: Response) => {
  const { content } = req.body;
  if (!content) throw new ApiError(400, 'Note content is required');

  const scopeFilter = (req as any).scopeFilter || {};
  const task = await Task.findOne({ _id: req.params.id, tenantId: req.tenantId, ...scopeFilter });
  if (!task) throw new ApiError(404, 'Task not found');

  const note = {
    content,
    createdBy: (req as any).user._id,
    createdAt: new Date()
  };

  task.notes.push(note);
  await task.save();

  // Populate createdBy manually to return complete object
  const user = (req as any).user;
  const savedNote = { ...note, _id: (task.notes[task.notes.length - 1] as any)._id, createdBy: { _id: user._id, name: user.name, photoUrl: user.photoUrl } };

  sendSuccess(res, 201, 'Note added', savedNote);
});

export const deleteTaskNote = asyncHandler(async (req: Request, res: Response) => {
  const { noteId } = req.params;
  const scopeFilter = (req as any).scopeFilter || {};
  const task = await Task.findOne({ _id: req.params.id, tenantId: req.tenantId, ...scopeFilter });
  if (!task) throw new ApiError(404, 'Task not found');

  task.notes = task.notes.filter(n => (n as any)._id.toString() !== noteId);
  await task.save();

  sendSuccess(res, 200, 'Note deleted');
});

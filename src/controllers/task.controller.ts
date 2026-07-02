import { Request, Response } from 'express';
import { asyncHandler } from '../utils/async-handler';
import { sendSuccess } from '../utils/ApiResponse';
import { ApiError } from '../utils/ApiError';
import { Task, TASK_STATUSES } from '../models/Task';
import { Service } from '../modules/services/schemas';
import { TaskHistory } from '../models/TaskHistory';
import { z } from 'zod';
import mongoose from 'mongoose';

const createTaskSchema = z.object({
  clientId: z.string(),
  serviceId: z.string(),
  assigneeIds: z.array(z.string()).min(1),
  description: z.string().optional(),
  priority: z.enum(['Low', 'Medium', 'High', 'Urgent']).optional(),
  period: z.object({
    month: z.number().min(1).max(12).optional(),
    year: z.number().optional(),
    label: z.string().optional()
  }).optional(),
  dueDate: z.string().optional(),
  targetDate: z.string().optional(),
  isBillable: z.boolean().optional(),
  billableAmount: z.number().optional(),
  tags: z.array(z.string()).optional(),
  docCollectionRequest: z.boolean().optional(),
  docCollectionMessage: z.string().optional(),
  customFieldValues: z.record(z.string(), z.any()).optional()
});

const updateTaskSchema = z.object({
  description: z.string().optional(),
  status: z.enum(['Pending', 'In Progress', 'Under Review', 'On Hold', 'Completed', 'Cancelled'] as any).optional(),
  priority: z.enum(['Low', 'Medium', 'High', 'Urgent']).optional(),
  assigneeIds: z.array(z.string()).min(1).optional(),
  dueDate: z.string().optional(),
  targetDate: z.string().optional(),
  isBillable: z.boolean().optional(),
  billableAmount: z.number().optional(),
  tags: z.array(z.string()).optional(),
  docCollectionRequest: z.boolean().optional(),
  docCollectionMessage: z.string().optional(),
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

export const getTags = asyncHandler(async (req: Request, res: Response) => {
  const tags = await Task.distinct('tags', { tenantId: req.tenantId });
  sendSuccess(res, 200, 'Tags fetched', tags);
});

export const getTasks = asyncHandler(async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string) || 1;
  const limit = parseInt(req.query.limit as string) || 10;
  const skip = (page - 1) * limit;

  // Build query
  const query: any = { tenantId: req.tenantId };
  
  if (req.query.status) query.status = req.query.status;
  if (req.query.priority) query.priority = req.query.priority;
  if (req.query.clientId) {
    if (typeof req.query.clientId === 'string' && req.query.clientId.includes(',')) {
      query.clientId = { $in: req.query.clientId.split(',') };
    } else {
      query.clientId = req.query.clientId;
    }
  }
  if (req.query.serviceId) query.serviceId = req.query.serviceId;
  
  if (req.query.dueStatus) {
    const now = new Date();
    if (req.query.dueStatus === 'overdue') {
      query.dueDate = { $lt: now };
      query.status = { $ne: 'Completed' };
    } else if (req.query.dueStatus === 'today') {
      const startOfDay = new Date(now.setHours(0, 0, 0, 0));
      const endOfDay = new Date(now.setHours(23, 59, 59, 999));
      query.dueDate = { $gte: startOfDay, $lte: endOfDay };
      query.status = { $ne: 'Completed' };
    }
  }
  
  // Phase 36: Enforce ScopeFilter (e.g. assignedUserId = req.user._id)
  const scopeFilter = (req as any).scopeFilter;
  if (scopeFilter) {
    Object.assign(query, scopeFilter);
  }

  // Search filtering
  if (req.query.search) {
    const searchRegex = { $regex: req.query.search, $options: 'i' };
    // Searching just description for now, as title is removed
    // In the future, this could use an aggregate to search on populated serviceId.name
    query.description = searchRegex;
  }

  // Sorting
  let sortParams: any = { dueDate: 1, createdAt: -1 };
  if (req.query.sortBy) {
    const order = req.query.sortOrder === 'desc' ? -1 : 1;
    sortParams = { [req.query.sortBy as string]: order };
  }

  const [tasks, total] = await Promise.all([
    Task.find(query)
      .populate('clientId', 'name fileNo')
      .populate('serviceId', 'name')
      .populate('assigneeIds', 'name photoUrl')
      .sort(sortParams)
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
  const task = await Task.findOne({ _id: req.params.id, tenantId: req.tenantId })
    .populate('clientId', 'name fileNo')
    .populate('serviceId', 'name')
    .populate('assigneeIds', 'name photoUrl')
    .populate('checklist.completedBy', 'name photoUrl')
    .populate('subtasks.assignedUserId', 'name photoUrl')
    .populate('timeLogs.userId', 'name photoUrl');

  if (!task) throw new ApiError(404, 'Task not found');

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

export const getTaskHistory = asyncHandler(async (req: Request, res: Response) => {
  const scopeFilter = (req as any).scopeFilter || {};
  const task = await Task.findOne({ _id: req.params.id, tenantId: req.tenantId, ...scopeFilter });
  if (!task) throw new ApiError(404, 'Task not found');

  const history = await TaskHistory.find({ taskId: req.params.id, tenantId: req.tenantId })
    .populate('createdBy', 'name photoUrl')
    .sort({ createdAt: -1 });

  sendSuccess(res, 200, 'Task history fetched', history);
});

export const addTaskNote = asyncHandler(async (req: Request, res: Response) => {
  const { content } = req.body;
  if (!content) throw new ApiError(400, 'Note content is required');

  const scopeFilter = (req as any).scopeFilter || {};
  const task = await Task.findOne({ _id: req.params.id, tenantId: req.tenantId, ...scopeFilter });
  if (!task) throw new ApiError(404, 'Task not found');

  const history = await TaskHistory.create({
    tenantId: req.tenantId,
    taskId: task._id,
    action: 'Note Added',
    details: content,
    createdBy: (req as any).user._id
  });

  const populatedHistory = await TaskHistory.findById(history._id).populate('createdBy', 'name photoUrl');

  sendSuccess(res, 201, 'Note added', populatedHistory);
});

export const deleteTaskNote = asyncHandler(async (req: Request, res: Response) => {
  const { noteId } = req.params;
  const scopeFilter = (req as any).scopeFilter || {};
  const task = await Task.findOne({ _id: req.params.id, tenantId: req.tenantId, ...scopeFilter });
  if (!task) throw new ApiError(404, 'Task not found');

  await TaskHistory.findOneAndDelete({
    _id: noteId,
    taskId: req.params.id,
    tenantId: req.tenantId
  });

  sendSuccess(res, 200, 'Note deleted');
});

export const updateTaskStatus = asyncHandler(async (req: Request, res: Response) => {
  const { status } = z.object({ 
    status: z.enum(['Pending', 'In Progress', 'Under Review', 'On Hold', 'Completed', 'Cancelled'] as any) 
  }).parse(req.body);
  const scopeFilter = (req as any).scopeFilter || {};
  const updateData: any = { status };
  
  if (status === 'Completed') {
    updateData.completedAt = new Date();
  }

  const task = await Task.findOneAndUpdate(
    { _id: req.params.id, tenantId: req.tenantId, ...scopeFilter },
    { $set: updateData },
    { new: false } // return old document to check status change
  );

  if (!task) throw new ApiError(404, 'Task not found');

  if (task.status !== status) {
    await TaskHistory.create({
      tenantId: req.tenantId,
      taskId: task._id,
      action: 'Status Changed',
      details: `Status changed from ${task.status} to ${status}`,
      createdBy: (req as any).user._id
    });
  }

  const updatedTask = await Task.findById(task._id);

  sendSuccess(res, 200, 'Task status updated', updatedTask);
});

export const deleteTask = asyncHandler(async (req: Request, res: Response) => {
  const scopeFilter = (req as any).scopeFilter || {};
  const task = await Task.findOneAndDelete({ _id: req.params.id, tenantId: req.tenantId, ...scopeFilter });
  
  if (!task) throw new ApiError(404, 'Task not found');
  sendSuccess(res, 200, 'Task deleted successfully');
});

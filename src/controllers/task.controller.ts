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
  assigneeIds: z.array(z.string()).optional(),
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
  let calculatedSubtasks: any[] = [];
  let assigneeIds = data.assigneeIds || [];

  if (data.serviceId) {
    const service = await Service.findOne({ _id: data.serviceId, tenantId: req.tenantId });
    if (service) {
      if (service.checklist) {
        checklist = service.checklist.map((step: any) => ({
          stepName: step.stepName,
          isCompleted: false
        }));
      }

      // Calculate Subtasks based on Service blueprint
      const now = new Date();
      if (service.subtasks) {
        calculatedSubtasks = service.subtasks.map((st: any) => {
          let stDueDate = undefined;
          let stTargetDate = undefined;

          if (st.relativeDueDays !== undefined && st.relativeDueDays !== null) {
            const d = new Date(now);
            d.setDate(d.getDate() + st.relativeDueDays);
            stDueDate = d;
          }

          if (st.relativeTargetDays !== undefined && st.relativeTargetDays !== null) {
            const d = new Date(now);
            d.setDate(d.getDate() + st.relativeTargetDays);
            stTargetDate = d;
          }

          return {
            title: st.title,
            description: st.description,
            assignedUserId: st.assignedUserIds && st.assignedUserIds.length > 0 ? st.assignedUserIds[0] : undefined,
            dueDate: stDueDate,
            targetDate: stTargetDate,
            status: 'Pending'
          };
        });
      }

      // Setup Custom Fields
      const customFieldValues: Record<string, any> = {};
      if (service.customFieldsDef) {
        service.customFieldsDef.forEach((cf: any) => {
          customFieldValues[cf.label] = "";
        });
      }
      (data as any).customFieldValues = customFieldValues;

      // Document Collection
      if (service.autoDocCollection?.isEnabled && !data.docCollectionRequest) {
        data.docCollectionRequest = true;
        data.docCollectionMessage = service.autoDocCollection.defaultMessage || "Please provide the required documents.";
      }

      // Auto-assign logic
      if (assigneeIds.length === 0) {
        if (service.assignedUsers && service.assignedUsers.length > 0) {
          assigneeIds = service.assignedUsers.map(id => id.toString());
        } else {
          // Fallback to client default users if no specific users set for the service
          const { Client } = require('../modules/clients/schemas/client.schema');
          const client = await Client.findOne({ _id: data.clientId, tenantId: req.tenantId });
          if (client && client.assignedUsers && client.assignedUsers.length > 0) {
            assigneeIds = client.assignedUsers.map((id: any) => id.toString());
          }
        }
      }
    }
  }

  const task = await Task.create({
    tenantId: req.tenantId,
    ...data,
    assigneeIds,
    creationType: 'manual',
    checklist,
    subtasks: calculatedSubtasks,
    customFieldValues: (data as any).customFieldValues || {}
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
      .populate('clientId', 'name fileNo pan')
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
    .populate('clientId', 'name fileNo pan')
    .populate('serviceId', 'name customFieldsDef')
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
    const incompleteChecklist = task.checklist.some(c => !c.isCompleted);
    const incompleteSubtask = task.subtasks.some(s => s.status !== 'Completed' && s.status !== 'Cancelled');
    
    if (incompleteChecklist || incompleteSubtask) {
      throw new ApiError(400, 'Cannot complete task. All to-dos and subtasks must be resolved first.');
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

export const addTaskChecklistStep = asyncHandler(async (req: Request, res: Response) => {
  const { stepName } = req.body;
  if (!stepName) throw new ApiError(400, 'Step name is required');

  const scopeFilter = (req as any).scopeFilter || {};
  const task = await Task.findOne({ _id: req.params.id, tenantId: req.tenantId, ...scopeFilter });
  if (!task) throw new ApiError(404, 'Task not found');

  task.checklist.push({
    stepName,
    isCompleted: false
  });
  
  await task.save();

  sendSuccess(res, 201, 'Checklist step added', task.checklist[task.checklist.length - 1]);
});

export const deleteTaskChecklistStep = asyncHandler(async (req: Request, res: Response) => {
  const { stepIndex } = req.params;
  const scopeFilter = (req as any).scopeFilter || {};

  const task = await Task.findOne({ _id: req.params.id, tenantId: req.tenantId, ...scopeFilter });
  if (!task) throw new ApiError(404, 'Task not found');

  const idx = parseInt(stepIndex as string, 10);
  if (isNaN(idx) || idx < 0 || idx >= task.checklist.length) {
    throw new ApiError(400, 'Invalid checklist index');
  }

  task.checklist.splice(idx, 1);
  await task.save();

  sendSuccess(res, 200, 'Checklist step deleted');
});

export const addSubtask = asyncHandler(async (req: Request, res: Response) => {
  const { title, description, assignedUserId, dueDate } = req.body;
  if (!title) throw new ApiError(400, 'Subtask title is required');

  const scopeFilter = (req as any).scopeFilter || {};
  const task = await Task.findOne({ _id: req.params.id, tenantId: req.tenantId, ...scopeFilter });
  if (!task) throw new ApiError(404, 'Task not found');

  task.subtasks.push({
    title,
    description,
    assignedUserId,
    dueDate,
    status: 'Pending'
  });
  
  await task.save();

  // Populate assignee for the newly added subtask if possible, or we can let frontend refetch
  sendSuccess(res, 201, 'Subtask added', task.subtasks[task.subtasks.length - 1]);
});

export const updateSubtask = asyncHandler(async (req: Request, res: Response) => {
  const { subtaskId } = req.params;
  const { status, title, description, assignedUserId, dueDate } = req.body;
  const scopeFilter = (req as any).scopeFilter || {};

  const task = await Task.findOne({ _id: req.params.id, tenantId: req.tenantId, ...scopeFilter });
  if (!task) throw new ApiError(404, 'Task not found');

  const subtask = (task.subtasks as any).id(subtaskId);
  if (!subtask) throw new ApiError(404, 'Subtask not found');

  if (status !== undefined) subtask.status = status;
  if (title !== undefined) subtask.title = title;
  if (description !== undefined) subtask.description = description;
  if (assignedUserId !== undefined) subtask.assignedUserId = assignedUserId;
  if (dueDate !== undefined) subtask.dueDate = dueDate;

  await task.save();

  sendSuccess(res, 200, 'Subtask updated', subtask);
});

export const deleteSubtask = asyncHandler(async (req: Request, res: Response) => {
  const { subtaskId } = req.params;
  const scopeFilter = (req as any).scopeFilter || {};

  const task = await Task.findOne({ _id: req.params.id, tenantId: req.tenantId, ...scopeFilter });
  if (!task) throw new ApiError(404, 'Task not found');

  const subtask = (task.subtasks as any).id(subtaskId);
  if (!subtask) throw new ApiError(404, 'Subtask not found');

  (task.subtasks as any).pull(subtaskId);
  await task.save();

  sendSuccess(res, 200, 'Subtask deleted');
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
  
  const task = await Task.findOne({ _id: req.params.id, tenantId: req.tenantId, ...scopeFilter });
  if (!task) throw new ApiError(404, 'Task not found');

  if (status === 'Completed' && task.status !== 'Completed') {
    const incompleteChecklist = task.checklist.some(c => !c.isCompleted);
    const incompleteSubtask = task.subtasks.some(s => s.status !== 'Completed' && s.status !== 'Cancelled');
    
    if (incompleteChecklist || incompleteSubtask) {
      throw new ApiError(400, 'Cannot complete task. All to-dos and subtasks must be resolved first.');
    }
    updateData.completedAt = new Date();
  } else if (status !== 'Completed') {
    updateData.completedAt = null; // Or use $unset if preferred
  }

  const updatedDoc = await Task.findOneAndUpdate(
    { _id: task._id },
    { $set: updateData },
    { new: true } // return new document
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

  sendSuccess(res, 200, 'Task status updated', updatedDoc);
});

export const deleteTask = asyncHandler(async (req: Request, res: Response) => {
  const scopeFilter = (req as any).scopeFilter || {};
  const task = await Task.findOneAndDelete({ _id: req.params.id, tenantId: req.tenantId, ...scopeFilter });
  
  if (!task) throw new ApiError(404, 'Task not found');
  sendSuccess(res, 200, 'Task deleted successfully');
});

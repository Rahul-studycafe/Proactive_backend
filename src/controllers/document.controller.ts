import { Request, Response } from 'express';
import { asyncHandler } from '../utils/async-handler';
import { sendSuccess } from '../utils/ApiResponse';
import { ApiError } from '../utils/ApiError';
import { DocumentModel } from '../models/Document';
import { Task } from '../models/Task';
import { TaskHistory } from '../models/TaskHistory';
import { z } from 'zod';

const uploadDocumentSchema = z.object({
  category: z.enum(['document', 'supporting_file']),
  clientId: z.string().optional()
});

export const getTaskDocuments = asyncHandler(async (req: Request, res: Response) => {
  const { taskId } = req.params;
  const { category } = req.query;

  const query: any = { taskId, tenantId: req.tenantId };
  if (category) {
    query.category = category;
  }

  const documents = await DocumentModel.find(query)
    .populate('uploadedBy', 'name photoUrl')
    .sort({ createdAt: -1 });

  sendSuccess(res, 200, 'Documents fetched successfully', documents);
});

export const uploadDocument = asyncHandler(async (req: Request, res: Response) => {
  const data = uploadDocumentSchema.parse(req.body);
  const taskId = req.params.taskId;
  
  if (!req.file) {
    throw new ApiError(400, 'No file uploaded');
  }

  const task = await Task.findOne({ _id: taskId, tenantId: req.tenantId });
  if (!task) throw new ApiError(404, 'Task not found');

  if (task.status === 'Completed' || task.status === 'Cancelled') {
    throw new ApiError(
      400,
      `Cannot upload files to a ${task.status.toLowerCase()} task. Please change its status to 'In Progress' or 'Under Review' first.`
    );
  }

  // Construct public URL from the local file path (assuming /public is mapped to /public)
  // For example: /public/uploads/clients/6a4b.../tasks/6a4b.../document/filename-1234.pdf
  // We need to strip the absolute path up to 'public'
  const fileUrl = `${process.env.BACKEND_URL || 'http://localhost:5000'}/public/uploads/clients/${data.clientId || 'unknown-client'}/tasks/${taskId}/${data.category}/${req.file.filename}`;

  const document = await DocumentModel.create({
    tenantId: req.tenantId,
    taskId: task._id,
    clientId: task.clientId,
    category: data.category,
    fileName: req.file.originalname,
    fileUrl: fileUrl,
    uploadedBy: (req as any).user._id
  });

  const populatedDoc = await DocumentModel.findById(document._id).populate('uploadedBy', 'name photoUrl');

  // Log in task history
  await TaskHistory.create({
    tenantId: req.tenantId,
    taskId: task._id,
    action: `Uploaded ${data.category === 'document' ? 'Document' : 'Supporting File'}`,
    details: `Uploaded file: ${req.file.originalname}`,
    createdBy: (req as any).user._id
  });

  sendSuccess(res, 201, 'Document uploaded successfully', populatedDoc);
});

export const getClientDocuments = asyncHandler(async (req: Request, res: Response) => {
  const { clientId } = req.params;
  const { category } = req.query;

  const query: any = { clientId, tenantId: req.tenantId, taskId: { $exists: false } };
  if (category) {
    query.category = category;
  }

  const documents = await DocumentModel.find(query)
    .populate('uploadedBy', 'name photoUrl')
    .sort({ createdAt: -1 });

  sendSuccess(res, 200, 'Documents fetched successfully', documents);
});

export const uploadClientDocument = asyncHandler(async (req: Request, res: Response) => {
  const data = uploadDocumentSchema.parse(req.body);
  const clientId = req.params.clientId;
  
  if (!req.file) {
    throw new ApiError(400, 'No file uploaded');
  }

  const fileUrl = `${process.env.BACKEND_URL || 'http://localhost:5000'}/public/uploads/clients/${clientId}/documents/${data.category}/${req.file.filename}`;

  const document: any = await DocumentModel.create({
    tenantId: req.tenantId,
    clientId: clientId as string,
    category: data.category,
    fileName: req.file.originalname,
    fileUrl: fileUrl,
    uploadedBy: (req as any).user._id
  });

  const populatedDoc = await DocumentModel.findById(document._id).populate('uploadedBy', 'name photoUrl');

  sendSuccess(res, 201, 'Document uploaded successfully', populatedDoc);
});

import fs from 'fs';
import path from 'path';

export const deleteDocument = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const existingDoc = await DocumentModel.findOne({
    _id: id,
    tenantId: req.tenantId
  });

  if (!existingDoc) throw new ApiError(404, 'Document not found');

  if (existingDoc.taskId) {
    const task = await Task.findOne({ _id: existingDoc.taskId, tenantId: req.tenantId });
    if (task && (task.status === 'Completed' || task.status === 'Cancelled')) {
      throw new ApiError(400, `Cannot delete files from a ${task.status.toLowerCase()} task.`);
    }
  }

  const document = await DocumentModel.findOneAndDelete({
    _id: id,
    tenantId: req.tenantId
  });

  if (!document) throw new ApiError(404, 'Document not found');
  
  // Try to delete the physical file from the server
  try {
    if (document.fileUrl) {
      // fileUrl looks like: http://localhost:5000/public/uploads/clients/...
      // Extract the path after the domain
      const urlObj = new URL(document.fileUrl);
      const urlPath = urlObj.pathname; // e.g. /public/uploads/clients/...
      
      // Map it to the local file system
      // urlPath starts with '/public', so we can strip the first '/' and join with cwd
      if (urlPath.startsWith('/public/uploads')) {
        const localFilePath = path.join(process.cwd(), urlPath.replace(/^\//, ''));
        if (fs.existsSync(localFilePath)) {
          fs.unlinkSync(localFilePath);
        }
      }
    }
  } catch (error) {
    console.error('Failed to delete physical file:', error);
    // Continue anyway since the DB record is deleted
  }

  // Log in task history only if it belongs to a task
  if (document.taskId) {
    await TaskHistory.create({
      tenantId: req.tenantId,
      taskId: document.taskId,
      action: `Deleted ${document.category === 'document' ? 'Document' : 'Supporting File'}`,
      details: `Deleted file: ${document.fileName}`,
      createdBy: (req as any).user._id
    });
  }

  sendSuccess(res, 200, 'Document deleted successfully');
});

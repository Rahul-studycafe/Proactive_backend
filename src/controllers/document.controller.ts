import { Request, Response } from 'express';
import { asyncHandler } from '../utils/async-handler';
import { sendSuccess } from '../utils/ApiResponse';
import { ApiError } from '../utils/ApiError';
import { DocumentModel } from '../models/Document';
import { Task } from '../models/Task';
import { z } from 'zod';

const uploadDocumentSchema = z.object({
  taskId: z.string(),
  category: z.enum(['document', 'supporting_file']),
  fileName: z.string(),
  fileUrl: z.string() // For now, we simulate uploads by just receiving the URL
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

  const task = await Task.findOne({ _id: data.taskId, tenantId: req.tenantId });
  if (!task) throw new ApiError(404, 'Task not found');

  const document = await DocumentModel.create({
    tenantId: req.tenantId,
    taskId: task._id,
    clientId: task.clientId,
    category: data.category,
    fileName: data.fileName,
    fileUrl: data.fileUrl,
    uploadedBy: (req as any).user._id
  });

  const populatedDoc = await DocumentModel.findById(document._id).populate('uploadedBy', 'name photoUrl');

  sendSuccess(res, 201, 'Document uploaded successfully', populatedDoc);
});

export const deleteDocument = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;

  const document = await DocumentModel.findOneAndDelete({
    _id: id,
    tenantId: req.tenantId
  });

  if (!document) throw new ApiError(404, 'Document not found');

  sendSuccess(res, 200, 'Document deleted successfully');
});

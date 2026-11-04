import { Request, Response } from 'express';
import mongoose from 'mongoose';
import path from 'path';
import fs from 'fs';
import { asyncHandler } from '../utils/async-handler';
import { sendSuccess } from '../common/responses/api-response';
import { ApiError } from '../common/errors/api-error';
import { Task } from '../models/Task';
import { DocumentModel } from '../models/Document';
import { DocumentRequest } from '../models/DocumentRequest';
import { Invoice } from '../models/Invoice';
import { Receipt } from '../models/Receipt';
import { Expense } from '../models/Expense';
import { calculateClientLedger } from '../services/ledger.service';
import { ClientQueryTicket } from '../models/ClientQueryTicket';
import { Client } from '../modules/clients/schemas/client.schema';
import { applyAdvanceToInvoiceService } from '../services/receipt.service';

// ─── Phase 126: Compliance Calendar & Milestones ──────────────────
export const getComplianceCalendar = asyncHandler(
  async (req: Request, res: Response) => {
    const { year, month, status } = req.query;
    const now = new Date();

    const query: any = {
      tenantId: req.tenantId,
      clientId: req.clientId
    };

    if (status === 'pending') {
      query.status = { $in: ['Pending', 'In Progress', 'Under Review'] };
    } else if (status === 'completed') {
      query.status = 'Completed';
    }

    if (year) {
      const y = Number(year);
      if (month) {
        const m = Number(month);
        const start = new Date(Date.UTC(y, m - 1, 1));
        const end = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));
        query.$or = [
          { 'period.year': y, 'period.month': m },
          { dueDate: { $gte: start, $lte: end } }
        ];
      } else {
        const start = new Date(Date.UTC(y, 0, 1));
        const end = new Date(Date.UTC(y, 11, 31, 23, 59, 59, 999));
        query.$or = [
          { 'period.year': y },
          { dueDate: { $gte: start, $lte: end } }
        ];
      }
    }

    const tasks = await Task.find(query)
      .populate('serviceId', 'name category')
      .sort({ dueDate: 1 });

    const timeline = tasks.map((t: any) => {
      const svcName = t.serviceId?.name || t.description || 'Compliance Filing';
      const periodLabel = t.period?.label ? ` (${t.period.label})` : '';
      const complianceName = `${svcName}${periodLabel}`;

      // Resolve category
      let serviceCategory = t.serviceId?.category || 'Compliance';
      const lower = complianceName.toLowerCase();
      if (lower.includes('gst')) serviceCategory = 'GST';
      else if (lower.includes('tds')) serviceCategory = 'TDS';
      else if (lower.includes('income tax') || lower.includes('itr')) serviceCategory = 'Income Tax';
      else if (lower.includes('roc') || lower.includes('mca')) serviceCategory = 'ROC';
      else if (lower.includes('audit')) serviceCategory = 'Audit';

      // Compute status (flag Overdue if past due date and not completed)
      let computedStatus = t.status;
      if (t.status !== 'Completed' && t.dueDate && new Date(t.dueDate) < now) {
        computedStatus = 'Overdue';
      }

      return {
        taskId: t._id,
        complianceName,
        serviceCategory,
        dueDate: t.dueDate,
        targetDate: t.targetDate,
        status: computedStatus,
        completedAt: t.completedAt,
        period: t.period?.label
      };
    });

    sendSuccess(res, 200, 'Compliance calendar retrieved successfully', timeline);
  }
);

// ─── Phase 127: Client Documents Repository & Return Vault ─────────
export const getPortalDocuments = asyncHandler(
  async (req: Request, res: Response) => {
    const { folder, search, from, to } = req.query;

    const query: any = {
      tenantId: req.tenantId,
      clientId: req.clientId
    };

    if (folder) {
      query.category = folder;
    }

    if (search) {
      query.fileName = { $regex: String(search), $options: 'i' };
    }

    if (from || to) {
      query.createdAt = {};
      if (from) query.createdAt.$gte = new Date(String(from));
      if (to) query.createdAt.$lte = new Date(String(to));
    }

    const documents = await DocumentModel.find(query).sort({ createdAt: -1 });
    sendSuccess(res, 200, 'Documents retrieved successfully', documents);
  }
);

export const downloadPortalDocument = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;

    const document = await DocumentModel.findOne({
      _id: id,
      tenantId: req.tenantId,
      clientId: req.clientId
    });

    if (!document) {
      throw new ApiError(404, 'Document not found or access denied');
    }

    const filePath = path.join(process.cwd(), document.fileUrl.replace(/^\//, ''));
    if (fs.existsSync(filePath)) {
      return res.download(filePath, document.fileName);
    }

    // If file is stored via external URL or static path
    sendSuccess(res, 200, 'Document download reference', {
      fileName: document.fileName,
      fileUrl: document.fileUrl
    });
  }
);

// ─── Phase 128: Client Invoices, Receipts & Ledger Statement ───────
export const getPortalInvoices = asyncHandler(
  async (req: Request, res: Response) => {
    const invoices = await Invoice.find({
      tenantId: req.tenantId,
      clientId: req.clientId,
      status: { $nin: ['Draft', 'Cancelled'] }
    }).sort({ date: -1 });

    const formatted = invoices.map((inv: any) => ({
      _id: inv._id,
      invoiceNo: inv.invoiceNo,
      date: inv.date,
      dueDate: inv.dueDate,
      itemsSummary: (inv.items || [])
        .map((it: any) => it.particulars || it.description)
        .filter(Boolean)
        .join(', '),
      grandTotal: inv.totals?.grandTotal || 0,
      amountPaid: inv.totals?.amountPaid || 0,
      amountDue: inv.totals?.amountDue || 0,
      status: inv.status
    }));

    sendSuccess(res, 200, 'Invoices retrieved successfully', formatted);
  }
);

export const getPortalReceipts = asyncHandler(
  async (req: Request, res: Response) => {
    const receipts = await Receipt.find({
      tenantId: req.tenantId,
      clientId: req.clientId
    }).sort({ date: -1 });

    const formatted = receipts.map((rct: any) => ({
      _id: rct._id,
      receiptNo: rct.receiptNo,
      date: rct.date,
      paymentMode: rct.paymentMode,
      referenceNumber: rct.referenceNumber,
      totalAmount: rct.totalAmount,
      settlements: rct.settlements,
      unallocatedAmount: rct.unallocatedAmount
    }));

    sendSuccess(res, 200, 'Receipts retrieved successfully', formatted);
  }
);

export const getPortalLedger = asyncHandler(
  async (req: Request, res: Response) => {
    const ledger = await calculateClientLedger(
      req.tenantId!,
      req.clientId!.toString(),
      {
        from: req.query.from as string,
        to: req.query.to as string
      }
    );

    sendSuccess(res, 200, 'Client ledger retrieved successfully', {
      ...ledger,
      runningBalance: ledger.closingBalance
    });
  }
);

export const getPortalInvoicePdf = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;

    const invoice = await Invoice.findOne({
      _id: id,
      tenantId: req.tenantId,
      clientId: req.clientId,
      status: { $nin: ['Draft', 'Cancelled'] }
    }).populate('clientId', 'name gstin email address');

    if (!invoice) {
      throw new ApiError(404, 'Invoice not found or access denied');
    }

    sendSuccess(res, 200, 'Invoice details retrieved successfully', invoice);
  }
);

export const applyAdvanceToPortalInvoice = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { amount } = req.body || {};

    const result = await applyAdvanceToInvoiceService(
      req.tenantId!,
      id as string,
      req.clientId,
      undefined,
      amount
    );

    sendSuccess(res, 200, 'Advance applied and invoice settled successfully', result);
  }
);

export const getPortalOutlays = asyncHandler(
  async (req: Request, res: Response) => {
    const expenses = await Expense.find({
      tenantId: req.tenantId,
      clientId: req.clientId
    })
      .populate('invoiceId', 'invoiceNo totals status')
      .sort({ date: -1, createdAt: -1 });

    const formatted = expenses.map((exp: any) => ({
      _id: exp._id,
      expenseNo: exp.expenseNo,
      date: exp.date,
      categoryName: exp.categoryName,
      amount: exp.amount,
      paymentMode: exp.paymentMode,
      isBilled: exp.isBilled,
      billedInvoiceNo: exp.invoiceId?.invoiceNo || null,
      invoiceId: exp.invoiceId?._id || null,
      notes: exp.notes || (exp as any).particulars,
      receiptUrl: exp.receiptUrl,
      receiptOriginalName: exp.receiptOriginalName
    }));

    sendSuccess(res, 200, 'Reimbursable outlays retrieved successfully', formatted);
  }
);

// ─── Phase 129: Document Request Fulfillment ───────────────────────
export const getPortalDocumentRequests = asyncHandler(
  async (req: Request, res: Response) => {
    const requests = await DocumentRequest.find({
      tenantId: req.tenantId,
      clientId: req.clientId,
      status: { $in: ['Pending', 'Partially Uploaded'] }
    }).sort({ createdAt: -1 });

    sendSuccess(res, 200, 'Pending document requests retrieved successfully', requests);
  }
);

export const fulfillPortalDocumentRequest = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;
    const { itemId } = req.body;

    if (!req.file) {
      throw new ApiError(400, 'File attachment is required');
    }

    const docRequest = await DocumentRequest.findOne({
      _id: id,
      tenantId: req.tenantId,
      clientId: req.clientId
    });

    if (!docRequest) {
      throw new ApiError(404, 'Document request not found or access denied');
    }

    if (docRequest.status === 'Cancelled' || docRequest.status === 'Expired') {
      throw new ApiError(400, `Cannot fulfill request in '${docRequest.status}' status`);
    }

    // Save document record in client vault
    const document = await DocumentModel.create({
      tenantId: req.tenantId,
      clientId: req.clientId,
      taskId: docRequest.taskId,
      category: 'document',
      fileName: req.file.originalname,
      fileUrl: `/uploads/documents/${req.file.filename || req.file.originalname}`,
      uploadedBy: req.clientUser!._id
    });

    // Update specific checklist item if provided, otherwise mark first pending
    let targetItem = itemId
      ? docRequest.items.find((it) => it._id?.toString() === itemId)
      : docRequest.items.find((it) => it.status !== 'Uploaded');

    if (targetItem) {
      targetItem.status = 'Uploaded';
      targetItem.uploadedAt = new Date();
      targetItem.uploadedDocumentId = document._id as mongoose.Types.ObjectId;
    }

    // Check completion status
    const allUploaded = docRequest.items.every(
      (it) => it.status === 'Uploaded' || !it.isRequired
    );
    docRequest.status = allUploaded ? 'Completed' : 'Partially Uploaded';
    await docRequest.save();

    sendSuccess(res, 200, 'Document request fulfilled successfully', {
      request: docRequest,
      document
    });
  }
);

// ─── Phase 130: Client Service Requests & Support Queries ──────────
export const createPortalQueryTicket = asyncHandler(
  async (req: Request, res: Response) => {
    const { type, subject, message, attachments } = req.body;

    if (!subject || !message) {
      throw new ApiError(400, 'Subject and message are required');
    }

    // Look up client to check assigned accountants for auto-routing
    const client = await Client.findOne({
      _id: req.clientId,
      tenantId: req.tenantId
    });

    const assignedToUserId =
      client?.assignedUsers && client.assignedUsers.length > 0
        ? client.assignedUsers[0]
        : undefined;

    const ticketNo = `TKT-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

    const ticket = await ClientQueryTicket.create({
      tenantId: req.tenantId,
      clientId: req.clientId,
      clientUserId: req.clientUser!._id,
      ticketNo,
      type: type || 'Query',
      subject: subject.trim(),
      message: message.trim(),
      attachments: attachments || [],
      status: 'Open',
      assignedToUserId
    });

    sendSuccess(res, 201, 'Support query ticket created successfully', ticket);
  }
);

export const getPortalQueryTickets = asyncHandler(
  async (req: Request, res: Response) => {
    const tickets = await ClientQueryTicket.find({
      tenantId: req.tenantId,
      clientId: req.clientId
    }).sort({ createdAt: -1 });

    sendSuccess(res, 200, 'Support query tickets retrieved successfully', tickets);
  }
);

export const getPortalQueryTicketById = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = req.params;

    const ticket = await ClientQueryTicket.findOne({
      _id: id,
      tenantId: req.tenantId,
      clientId: req.clientId
    }).populate('assignedToUserId', 'name email');

    if (!ticket) {
      throw new ApiError(404, 'Support query ticket not found');
    }

    sendSuccess(res, 200, 'Support query ticket details retrieved successfully', ticket);
  }
);

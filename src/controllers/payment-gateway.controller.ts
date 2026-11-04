import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { asyncHandler } from '../utils/async-handler';
import { sendSuccess } from '../common/responses/api-response';
import { ApiError } from '../common/errors/api-error';
import { PaymentGatewayService } from '../services/payment-gateway.service';
import { PaymentGatewayConfig } from '../models/PaymentGatewayConfig';
import { Invoice } from '../models/Invoice';

// ─── Phase 131: Gateway Config Management ────────────────────────
export const getGatewayConfigs = asyncHandler(async (req: Request, res: Response) => {
  const configs = await PaymentGatewayService.getConfigs(req.tenantId!);

  // Mask sensitive secrets before returning
  const sanitized = configs.map((c) => ({
    _id: c._id,
    provider: c.provider,
    billingEntityId: c.billingEntityId,
    isEnabled: c.isEnabled,
    keyId: c.keyId,
    hasSecret: !!c.encryptedKeySecret,
    hasWebhookSecret: !!c.webhookSecret,
    upiVpa: c.upiVpa,
    merchantName: c.merchantName,
    acceptedModes: c.acceptedModes,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt
  }));

  sendSuccess(res, 200, 'Payment gateway configurations retrieved', sanitized);
});

export const upsertGatewayConfig = asyncHandler(async (req: Request, res: Response) => {
  const {
    billingEntityId,
    provider,
    isEnabled,
    keyId,
    keySecret,
    webhookSecret,
    upiVpa,
    merchantName,
    acceptedModes
  } = req.body;

  if (!provider) {
    throw new ApiError(400, 'Provider is required (Razorpay, Cashfree, or UPI_Direct)');
  }

  const config = await PaymentGatewayService.upsertConfig(req.tenantId!, {
    billingEntityId,
    provider,
    isEnabled,
    keyId,
    keySecret,
    webhookSecret,
    upiVpa,
    merchantName,
    acceptedModes
  });

  sendSuccess(res, 200, 'Payment gateway configured successfully', {
    _id: config._id,
    provider: config.provider,
    isEnabled: config.isEnabled,
    keyId: config.keyId,
    upiVpa: config.upiVpa,
    merchantName: config.merchantName,
    acceptedModes: config.acceptedModes
  });
});

// ─── Phase 132: Dynamic UPI QR Code & Payment Link ───────────────
export const getInvoiceUpiQr = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const tenantId = req.tenantId!;
  const clientId = req.clientId; // Present if invoked by client portal

  const result = await PaymentGatewayService.generateInvoiceUpiQr(tenantId, id as string, clientId);
  sendSuccess(res, 200, 'UPI QR code generated successfully', result);
});

export const createInvoicePaymentLink = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const tenantId = req.tenantId!;
  const clientId = req.clientId;

  const result = await PaymentGatewayService.createInvoicePaymentLink(tenantId, id as string, clientId);
  sendSuccess(res, 200, 'Payment link generated successfully', result);
});

export const confirmPortalPayment = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const tenantId = req.tenantId!;
  const clientId = req.clientId;
  const { utrNumber } = req.body || {};

  const result = await PaymentGatewayService.confirmDirectPayment(tenantId, id as string, clientId, utrNumber);
  sendSuccess(res, 200, 'Direct payment confirmed and receipt issued successfully', result);
});

export const getOutlayUpiQr = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const tenantId = req.tenantId!;
  const clientId = req.clientId;

  const result = await PaymentGatewayService.generateOutlayUpiQr(tenantId, id as string, clientId);
  sendSuccess(res, 200, 'Outlay UPI QR code generated successfully', result);
});

export const confirmOutlayPayment = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const tenantId = req.tenantId!;
  const clientId = req.clientId;
  const { utrNumber } = req.body || {};

  const result = await PaymentGatewayService.confirmOutlayPayment(tenantId, id as string, clientId, utrNumber);
  sendSuccess(res, 200, 'Outlay direct reimbursement confirmed and receipt issued successfully', result);
});

// ─── Phase 133 & 134: Gateway Webhook & ACID Reconciliation ──────
export const handleClientPaymentWebhook = asyncHandler(async (req: Request, res: Response) => {
  const signature = (req.headers['x-razorpay-signature'] ||
    req.headers['x-webhook-signature'] ||
    req.body?.signature) as string;

  const rawBody = (req as any).rawBody || JSON.stringify(req.body);
  const payload = req.body || {};

  // Extract payment details either from standard Razorpay webhook structure or normalized payload
  let paymentId: string | undefined;
  let orderId: string | undefined;
  let amountInRupees: number | undefined;
  let invoiceId: string | undefined;
  let tenantIdStr: string | undefined;
  let paymentMethod = 'UPI';

  if (payload.event && payload.payload?.payment?.entity) {
    // Razorpay standard webhook event
    const entity = payload.payload.payment.entity;
    paymentId = entity.id;
    orderId = entity.order_id;
    amountInRupees = entity.amount ? entity.amount / 100 : 0;
    invoiceId = entity.notes?.invoiceId;
    tenantIdStr = entity.notes?.tenantId;
    paymentMethod = entity.method?.toUpperCase() || 'UPI';
  } else {
    // Direct / Generic webhook payload
    paymentId = payload.paymentId || payload.transactionId || payload.referenceId;
    orderId = payload.orderId;
    amountInRupees = payload.amount;
    invoiceId = payload.invoiceId;
    tenantIdStr = payload.tenantId;
    paymentMethod = payload.paymentMethod || 'UPI';
  }

  if (!paymentId || !amountInRupees) {
    throw new ApiError(400, 'Invalid webhook payload: paymentId and amount are required');
  }

  // If invoiceId is provided, resolve tenantId from invoice if not directly given
  if (!tenantIdStr && invoiceId) {
    const inv = await Invoice.findById(invoiceId).select('tenantId');
    if (inv) {
      tenantIdStr = inv.tenantId.toString();
    }
  }

  if (!tenantIdStr || !invoiceId) {
    throw new ApiError(400, 'Unable to associate webhook event with invoice and tenant');
  }

  const tenantId = new mongoose.Types.ObjectId(tenantIdStr);

  // Phase 133: Cryptographic Signature Verification
  const config = await PaymentGatewayConfig.findOne({
    tenantId,
    webhookSecret: { $exists: true, $ne: '' }
  });

  const secretToVerify = config?.webhookSecret || process.env.RAZORPAY_WEBHOOK_SECRET;

  if (secretToVerify) {
    if (!signature) {
      throw new ApiError(400, 'Missing webhook signature header');
    }
    const isValid = PaymentGatewayService.verifyWebhookSignature(rawBody, signature, secretToVerify);
    if (!isValid) {
      throw new ApiError(400, 'Invalid webhook signature');
    }
  }

  // Phase 134: ACID Auto-Reconciliation
  const reconciliation = await PaymentGatewayService.reconcilePayment({
    tenantId,
    invoiceId,
    gatewayTransactionId: paymentId,
    gatewayOrderId: orderId,
    amount: amountInRupees,
    gatewayProvider: config?.provider || 'Razorpay',
    paymentMethod,
    rawPayload: payload
  });

  sendSuccess(res, 200, 'Payment webhook processed and ledger reconciled', reconciliation);
});

// ─── Phase 135: Payment Transactions Ledger ──────────────────────
export const getPaymentTransactions = asyncHandler(async (req: Request, res: Response) => {
  const { clientId, invoiceId, status, startDate, endDate, limit, skip } = req.query;

  const result = await PaymentGatewayService.getTransactions(req.tenantId!, {
    clientId: clientId as string,
    invoiceId: invoiceId as string,
    status: status as string,
    startDate: startDate as string,
    endDate: endDate as string,
    limit: limit ? Number(limit) : undefined,
    skip: skip ? Number(skip) : undefined
  });

  sendSuccess(res, 200, 'Payment transactions retrieved successfully', result);
});

import mongoose from 'mongoose';
import QRCode from 'qrcode';
import crypto from 'crypto';
import { PaymentGatewayConfig, IPaymentGatewayConfig, PaymentProvider } from '../models/PaymentGatewayConfig';
import { PaymentTransaction, IPaymentTransaction } from '../models/PaymentTransaction';
import { Invoice } from '../models/Invoice';
import { Receipt } from '../models/Receipt';
import { CreditNote } from '../models/CreditNote';
import { BillingEntity } from '../models/BillingEntity';
import { Expense } from '../models/Expense';
import { Client } from '../modules/clients/schemas/client.schema';
import { Organization } from '../modules/auth/schemas';
import { encryptPassword, decryptPassword } from '../utils/crypto-vault';
import { getNextReceiptNumber } from './sequence.service';
import { ApiError } from '../common/errors/api-error';

export interface UpsertGatewayConfigInput {
  billingEntityId?: string;
  provider: PaymentProvider;
  isEnabled?: boolean;
  keyId?: string;
  keySecret?: string;
  webhookSecret?: string;
  upiVpa?: string;
  merchantName?: string;
  acceptedModes?: ('UPI' | 'CreditCard' | 'DebitCard' | 'NetBanking')[];
}

export class PaymentGatewayService {
  /**
   * Saves or updates gateway credentials, encrypting secret keys via AES-256-CBC.
   */
  static async upsertConfig(
    tenantId: mongoose.Types.ObjectId,
    data: UpsertGatewayConfigInput
  ): Promise<IPaymentGatewayConfig> {
    let encryptedKeySecret: string | undefined;
    let iv: string | undefined;

    if (data.keySecret) {
      const encrypted = encryptPassword(data.keySecret);
      encryptedKeySecret = encrypted.encryptedPassword;
      iv = encrypted.iv;
    }

    const filter: any = {
      tenantId,
      provider: data.provider
    };
    if (data.billingEntityId) {
      filter.billingEntityId = new mongoose.Types.ObjectId(data.billingEntityId);
    }

    const updateDoc: any = {
      ...data,
      tenantId
    };

    if (data.billingEntityId) {
      updateDoc.billingEntityId = new mongoose.Types.ObjectId(data.billingEntityId);
    }
    delete updateDoc.keySecret;

    if (encryptedKeySecret && iv) {
      updateDoc.encryptedKeySecret = encryptedKeySecret;
      updateDoc.iv = iv;
    }

    const config = await PaymentGatewayConfig.findOneAndUpdate(
      filter,
      { $set: updateDoc },
      { new: true, upsert: true, runValidators: true }
    );

    return config;
  }

  /**
   * Retrieves active gateway configs for a tenant.
   */
  static async getConfigs(tenantId: mongoose.Types.ObjectId): Promise<IPaymentGatewayConfig[]> {
    return PaymentGatewayConfig.find({ tenantId }).sort({ createdAt: -1 });
  }

  /**
   * Resolves the primary active payment gateway configuration for a tenant.
   */
  static async resolveActiveConfig(
    tenantId: mongoose.Types.ObjectId,
    billingEntityId?: mongoose.Types.ObjectId
  ): Promise<IPaymentGatewayConfig | null> {
    const query: any = { tenantId, isEnabled: true };
    if (billingEntityId) {
      query.billingEntityId = billingEntityId;
    }
    let config = await PaymentGatewayConfig.findOne(query);
    if (!config && billingEntityId) {
      config = await PaymentGatewayConfig.findOne({ tenantId, isEnabled: true });
    }
    return config;
  }

  /**
   * Phase 132: Generates an NPCI-compliant UPI URI and base64 QR code image.
   * URI spec: upi://pay?pa={vpa}&pn={name}&am={amount}&tr={invNo}&tn=Invoice_{invNo}&cu=INR
   */
  static async generateInvoiceUpiQr(
    tenantId: mongoose.Types.ObjectId,
    invoiceId: string,
    clientId?: mongoose.Types.ObjectId
  ) {
    const query: any = { _id: invoiceId, tenantId };
    if (clientId) {
      query.clientId = clientId;
    }

    const invoice = await Invoice.findOne(query);
    if (!invoice) {
      throw new ApiError(404, 'Invoice not found or access denied');
    }

    if (invoice.status === 'Cancelled' || invoice.status === 'Draft') {
      throw new ApiError(400, `Cannot generate payment QR for invoice in '${invoice.status}' status`);
    }

    const amountDue = invoice.totals?.amountDue ?? 0;
    if (amountDue <= 0) {
      throw new ApiError(400, 'Invoice has zero balance due and cannot be paid');
    }

    // Resolve VPA & Merchant Name
    const config = await this.resolveActiveConfig(tenantId, invoice.billingEntityId);
    let upiVpa = config?.upiVpa;
    let merchantName = config?.merchantName;
    let bankDetails: any = null;

    if (invoice.billingEntityId) {
      const billingEntity = await BillingEntity.findOne({ _id: invoice.billingEntityId, tenantId });
      if (billingEntity) {
        upiVpa = upiVpa || (billingEntity as any).upiId || (billingEntity as any).bankDetails?.upiId;
        merchantName = merchantName || (billingEntity as any).legalEntityName || (billingEntity as any).entityName || (billingEntity as any).name;
        if ((billingEntity as any).bankDetails) {
          bankDetails = {
            bankName: (billingEntity as any).bankDetails.bankName,
            accountNumber: (billingEntity as any).bankDetails.accountNumber,
            ifsc: (billingEntity as any).bankDetails.ifsc,
            branch: (billingEntity as any).bankDetails.branch,
            upiId: (billingEntity as any).bankDetails.upiId || (billingEntity as any).upiId
          };
        }
      }
    }

    if (!upiVpa || !merchantName) {
      const org = await Organization.findById(tenantId).select('name');
      merchantName = merchantName || org?.name || 'Proactive Practice';
      upiVpa = upiVpa || 'payment@proactive';
    }

    const formattedAmount = amountDue.toFixed(2);
    const invoiceNo = invoice.invoiceNo;
    const upiUri = `upi://pay?pa=${encodeURIComponent(upiVpa)}&pn=${encodeURIComponent(merchantName)}&am=${formattedAmount}&tr=${encodeURIComponent(invoiceNo)}&tn=${encodeURIComponent(`Invoice_${invoiceNo}`)}&cu=INR`;

    const qrBase64 = await QRCode.toDataURL(upiUri, {
      errorCorrectionLevel: 'M',
      margin: 2,
      scale: 6
    });

    return {
      invoiceId: invoice._id,
      invoiceNo,
      amountDue,
      amount: amountDue,
      merchantName,
      upiVpa,
      upiId: upiVpa,
      upiUri,
      npciUri: upiUri,
      qrBase64,
      qrDataUrl: qrBase64,
      bankDetails
    };
  }

  /**
   * Phase 132: Generates direct UPI payment link / reference without third-party gateways.
   */
  static async createInvoicePaymentLink(
    tenantId: mongoose.Types.ObjectId,
    invoiceId: string,
    clientId?: mongoose.Types.ObjectId
  ) {
    const query: any = { _id: invoiceId, tenantId };
    if (clientId) {
      query.clientId = clientId;
    }

    const invoice = await Invoice.findOne(query);
    if (!invoice) {
      throw new ApiError(404, 'Invoice not found or access denied');
    }

    const amountDue = invoice.totals?.amountDue ?? 0;
    if (amountDue <= 0) {
      throw new ApiError(400, 'Invoice is already settled');
    }

    const paymentLinkId = `upi_${invoice._id}_${Date.now()}`;
    const qrData = await this.generateInvoiceUpiQr(tenantId, invoiceId, clientId);
    const shortUrl = qrData.upiUri;

    invoice.paymentLinkId = paymentLinkId;
    invoice.paymentShortUrl = shortUrl;
    await Invoice.updateOne(
      { _id: invoice._id },
      { $set: { paymentLinkId, paymentShortUrl: shortUrl } }
    );

    return {
      paymentLinkId,
      shortUrl,
      upiUri: qrData.upiUri,
      amountDue
    };
  }

  /**
   * Direct UPI & Bank Settlement: Confirms client payment and issues official receipt.
   */
  static async confirmDirectPayment(
    tenantId: mongoose.Types.ObjectId,
    invoiceId: string,
    clientId?: mongoose.Types.ObjectId,
    utrOrRef?: string
  ) {
    const query: any = { _id: invoiceId, tenantId };
    if (clientId) {
      query.clientId = clientId;
    }

    const invoice = await Invoice.findOne(query);
    if (!invoice) {
      throw new ApiError(404, 'Invoice not found or access denied');
    }

    if (invoice.totals.amountDue <= 0) {
      throw new ApiError(400, 'Invoice is already settled');
    }

    const refId = utrOrRef?.trim() || `UPI_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`;

    const result = await this.reconcilePayment({
      tenantId,
      invoiceId: invoice._id.toString(),
      gatewayTransactionId: refId,
      gatewayOrderId: invoice.invoiceNo,
      amount: invoice.totals.amountDue,
      gatewayProvider: 'UPI_Direct',
      paymentMethod: 'UPI',
      rawPayload: { confirmedBy: 'ClientPortal', invoiceNo: invoice.invoiceNo, utr: refId }
    });

    return result;
  }

  /**
   * Generates dynamic UPI QR Code for settling client-reimbursable outlays.
   */
  static async generateOutlayUpiQr(
    tenantId: mongoose.Types.ObjectId,
    outlayId: string,
    clientId?: mongoose.Types.ObjectId
  ) {
    const query: any = { _id: outlayId, tenantId };
    if (clientId) {
      query.clientId = clientId;
    }

    const outlay = await Expense.findOne(query);
    if (!outlay) {
      throw new ApiError(404, 'Outlay expense not found or access denied');
    }

    if (outlay.isBilled) {
      throw new ApiError(400, 'This outlay has already been billed or settled');
    }

    const amountDue = outlay.amount || 0;
    if (amountDue <= 0) {
      throw new ApiError(400, 'Outlay has zero amount due and cannot be paid');
    }

    const config = await this.resolveActiveConfig(tenantId);
    let upiVpa = config?.upiVpa;
    let merchantName = config?.merchantName;
    let bankDetails: any = null;

    const billingEntity = await BillingEntity.findOne({ tenantId, isDefault: true }) || await BillingEntity.findOne({ tenantId });
    if (billingEntity) {
      upiVpa = upiVpa || (billingEntity as any).upiId || (billingEntity as any).bankDetails?.upiId;
      merchantName = merchantName || (billingEntity as any).legalEntityName || (billingEntity as any).entityName || (billingEntity as any).name;
      if ((billingEntity as any).bankDetails) {
        bankDetails = {
          bankName: (billingEntity as any).bankDetails.bankName,
          accountNumber: (billingEntity as any).bankDetails.accountNumber,
          ifsc: (billingEntity as any).bankDetails.ifsc,
          branch: (billingEntity as any).bankDetails.branch,
          upiId: (billingEntity as any).bankDetails.upiId || (billingEntity as any).upiId
        };
      }
    }

    if (!upiVpa || !merchantName) {
      const org = await Organization.findById(tenantId).select('name');
      merchantName = merchantName || org?.name || 'Proactive Practice';
      upiVpa = upiVpa || 'payment@proactive';
    }

    const formattedAmount = amountDue.toFixed(2);
    const expenseNo = outlay.expenseNo;
    const upiUri = `upi://pay?pa=${encodeURIComponent(upiVpa)}&pn=${encodeURIComponent(merchantName)}&am=${formattedAmount}&tr=${encodeURIComponent(expenseNo)}&tn=${encodeURIComponent(`Outlay_${expenseNo}`)}&cu=INR`;

    const qrBase64 = await QRCode.toDataURL(upiUri, {
      errorCorrectionLevel: 'M',
      margin: 2,
      scale: 6
    });

    return {
      outlayId: outlay._id,
      expenseNo,
      amountDue,
      amount: amountDue,
      merchantName,
      upiVpa,
      upiId: upiVpa,
      upiUri,
      npciUri: upiUri,
      qrBase64,
      qrDataUrl: qrBase64,
      bankDetails
    };
  }

  /**
   * Confirms client direct reimbursement payment for an outlay and issues official receipt.
   */
  static async confirmOutlayPayment(
    tenantId: mongoose.Types.ObjectId,
    outlayId: string,
    clientId?: mongoose.Types.ObjectId,
    utrOrRef?: string
  ) {
    const query: any = { _id: outlayId, tenantId };
    if (clientId) {
      query.clientId = clientId;
    }

    const outlay = await Expense.findOne(query);
    if (!outlay) {
      throw new ApiError(404, 'Outlay expense not found or access denied');
    }

    if (outlay.isBilled) {
      throw new ApiError(400, 'This outlay has already been settled');
    }

    const refId = utrOrRef?.trim() || `UPI_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`;
    const receiptNo = await getNextReceiptNumber(tenantId);

    const receipt = await Receipt.create({
      tenantId,
      clientId: outlay.clientId,
      receiptNo,
      date: new Date(),
      paymentMode: 'UPI',
      referenceNumber: refId,
      totalAmount: outlay.amount,
      unallocatedAmount: 0,
      settlements: [],
      notes: `Direct reimbursement for outlay ${outlay.expenseNo} (${outlay.categoryName || 'Practice Outlay'})`
    });

    outlay.isBilled = true;
    outlay.billedAt = new Date();
    outlay.notes = outlay.notes
      ? `${outlay.notes} | Reimbursed via ${receiptNo} (Ref: ${refId})`
      : `Reimbursed via ${receiptNo} (Ref: ${refId})`;
    await outlay.save();

    await PaymentTransaction.create({
      tenantId,
      clientId: outlay.clientId,
      amount: outlay.amount,
      currency: 'INR',
      gatewayProvider: 'UPI_Direct',
      gatewayTransactionId: refId,
      status: 'Captured',
      paymentMethod: 'UPI',
      rawWebhookPayload: { outlayNo: outlay.expenseNo, receiptNo }
    });

    return {
      receipt: {
        _id: receipt._id,
        receiptNo: receipt.receiptNo,
        date: receipt.date,
        totalAmount: receipt.totalAmount,
        paymentMode: receipt.paymentMode,
        referenceNumber: receipt.referenceNumber
      },
      outlay
    };
  }

  /**
   * Phase 133: Cryptographically verifies HMAC-SHA256 signature from gateway webhook.
   */
  static verifyWebhookSignature(rawBody: string, signature: string, secret: string): boolean {
    if (!rawBody || !signature || !secret) {
      return false;
    }

    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');

    try {
      return crypto.timingSafeEqual(
        Buffer.from(signature, 'utf8'),
        Buffer.from(expectedSignature, 'utf8')
      );
    } catch {
      return false;
    }
  }

  /**
   * Phase 134: ACID Auto-Reconciliation Engine.
   * Atomically settles invoice, creates Receipt, and records PaymentTransaction.
   */
  static async reconcilePayment(params: {
    tenantId: mongoose.Types.ObjectId;
    invoiceId: string;
    gatewayTransactionId: string;
    gatewayOrderId?: string;
    amount: number;
    gatewayProvider?: string;
    paymentMethod?: string;
    rawPayload?: any;
  }) {
    const {
      tenantId,
      invoiceId,
      gatewayTransactionId,
      gatewayOrderId,
      amount,
      gatewayProvider = 'UPI_Direct',
      paymentMethod = 'UPI',
      rawPayload
    } = params;

    // Idempotency Check (Phase 133/134)
    const existingTx = await PaymentTransaction.findOne({
      tenantId,
      gatewayTransactionId
    });

    if (existingTx && existingTx.status === 'Captured') {
      return {
        alreadyProcessed: true,
        transaction: existingTx
      };
    }

    // Start transaction session with fallback for standalone test runners
    let session: mongoose.ClientSession | null = null;
    let useTransaction = false;
    try {
      session = await mongoose.startSession();
      session.startTransaction();
      useTransaction = true;
    } catch {
      session = null;
      useTransaction = false;
    }

    try {
      const invoiceQuery = Invoice.findOne({ _id: invoiceId, tenantId });
      const invoice = useTransaction && session
        ? await invoiceQuery.session(session)
        : await invoiceQuery;

      if (!invoice) {
        throw new ApiError(404, `Invoice ${invoiceId} not found for auto-reconciliation`);
      }

      if (invoice.totals.amountDue <= 0) {
        if (useTransaction && session) await session.abortTransaction();
        return {
          alreadyProcessed: true,
          message: 'Invoice is already settled'
        };
      }

      // Generate next receipt number atomically
      const receiptNo = await getNextReceiptNumber(
        tenantId,
        'RCT-',
        useTransaction && session ? session : undefined
      );

      // Fetch credit notes applied to this invoice
      const creditNotes = await CreditNote.find({
        tenantId,
        invoiceId: invoice._id,
        status: { $ne: 'Cancelled' }
      });
      const totalCreditApplied = creditNotes.reduce(
        (sum, cn) => sum + (cn.creditAppliedToInvoice || cn.totals?.grandTotal || 0),
        0
      );

      // Settle invoice amounts
      const settledAmount = Math.min(amount, invoice.totals.amountDue);
      invoice.totals.amountPaid = Math.round((invoice.totals.amountPaid + settledAmount) * 100) / 100;
      invoice.totals.amountDue = Math.max(
        0,
        Math.round((invoice.totals.grandTotal - invoice.totals.amountPaid - totalCreditApplied) * 100) / 100
      );
      invoice.status = invoice.totals.amountDue <= 0 ? 'Paid' : 'Partially Paid';

      if (useTransaction && session) {
        await invoice.save({ session });
      } else {
        await invoice.save();
      }

      // Create Receipt document
      const receiptData = {
        tenantId,
        clientId: invoice.clientId,
        receiptNo,
        date: new Date(),
        paymentMode: (paymentMethod === 'UPI' ? 'UPI' : 'Bank Transfer') as any,
        referenceNumber: gatewayTransactionId,
        totalAmount: settledAmount,
        settlements: [
          {
            invoiceId: invoice._id,
            settledAmount
          }
        ],
        notes: `Automated online reconciliation via ${gatewayProvider} (${gatewayTransactionId})`,
        unallocatedAmount: Math.max(0, Math.round((amount - settledAmount) * 100) / 100)
      };

      let receipt: any;
      if (useTransaction && session) {
        const [created] = await Receipt.create([receiptData], { session });
        receipt = created;
      } else {
        receipt = await Receipt.create(receiptData);
      }

      // Record PaymentTransaction audit log (Phase 135)
      const txData = {
        tenantId,
        clientId: invoice.clientId,
        invoiceId: invoice._id,
        receiptId: receipt._id,
        gatewayProvider,
        gatewayTransactionId,
        gatewayOrderId,
        amount,
        currency: 'INR',
        paymentMethod,
        status: 'Captured' as const,
        rawWebhookPayload: rawPayload
      };

      let transaction: any;
      if (useTransaction && session) {
        const [createdTx] = await PaymentTransaction.create([txData], { session });
        transaction = createdTx;
      } else {
        transaction = await PaymentTransaction.create(txData);
      }

      if (useTransaction && session) {
        await session.commitTransaction();
      }

      return {
        alreadyProcessed: false,
        reconciled: true,
        invoice,
        receipt,
        transaction
      };
    } catch (error) {
      if (useTransaction && session) {
        await session.abortTransaction();
      }
      throw error;
    } finally {
      if (session) {
        session.endSession();
      }
    }
  }

  /**
   * Phase 135: Query filterable payment transactions audit ledger.
   */
  static async getTransactions(
    tenantId: mongoose.Types.ObjectId,
    filters: {
      clientId?: string;
      invoiceId?: string;
      status?: string;
      startDate?: string;
      endDate?: string;
      limit?: number;
      skip?: number;
    }
  ) {
    const query: any = { tenantId };

    if (filters.clientId) {
      query.clientId = new mongoose.Types.ObjectId(filters.clientId);
    }
    if (filters.invoiceId) {
      query.invoiceId = new mongoose.Types.ObjectId(filters.invoiceId);
    }
    if (filters.status) {
      query.status = filters.status;
    }
    if (filters.startDate || filters.endDate) {
      query.createdAt = {};
      if (filters.startDate) query.createdAt.$gte = new Date(filters.startDate);
      if (filters.endDate) query.createdAt.$lte = new Date(filters.endDate);
    }

    const limit = Number(filters.limit) || 50;
    const skip = Number(filters.skip) || 0;

    const [transactions, total] = await Promise.all([
      PaymentTransaction.find(query)
        .populate('clientId', 'name fileNo gstin')
        .populate('invoiceId', 'invoiceNo totals')
        .populate('receiptId', 'receiptNo totalAmount')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      PaymentTransaction.countDocuments(query)
    ]);

    return {
      transactions,
      total,
      limit,
      skip
    };
  }
}

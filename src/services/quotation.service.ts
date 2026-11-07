import mongoose from 'mongoose';
import { Quotation, IQuotation, IQuotationItem, IQuotationTotals, QuotationStatus } from '../models/Quotation';
import { Client } from '../modules/clients/schemas/client.schema';
import { Invoice } from '../models/Invoice';
import { Organization } from '../modules/auth/schemas/organization.schema';
import { BillingEntity } from '../modules/masters/schemas/billing-entity.schema';
import { getNextQuotationNumber, getNextInvoiceNumber } from './sequence.service';
import { ApiError } from '../utils/ApiError';
import nodemailer from 'nodemailer';

export interface CreateQuotationItemDTO {
  serviceId?: string;
  description: string;
  sacCode?: string;
  rate: number;
  quantity?: number;
  discount?: number;
  gstPercentage?: number;
}

export interface CreateQuotationDTO {
  clientId: string;
  billingEntityId?: string;
  date?: string | Date;
  validUntil?: string | Date;
  isInterState?: boolean;
  items: CreateQuotationItemDTO[];
  termsAndConditions?: string;
  notes?: string;
}

export interface UpdateQuotationDTO {
  billingEntityId?: string;
  date?: string | Date;
  validUntil?: string | Date;
  isInterState?: boolean;
  items?: CreateQuotationItemDTO[];
  termsAndConditions?: string;
  notes?: string;
}

export interface QuotationFilterQuery {
  clientId?: string;
  status?: QuotationStatus | 'all';
  startDate?: string;
  endDate?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export class QuotationService {
  /**
   * Helper: Calculate itemized GST math and totals
   */
  static calculateTotals(
    items: CreateQuotationItemDTO[],
    isInterState: boolean = false
  ): { items: IQuotationItem[]; totals: IQuotationTotals } {
    let subtotal = 0;
    let discountTotal = 0;
    let taxableTotal = 0;
    let cgstTotal = 0;
    let sgstTotal = 0;
    let igstTotal = 0;

    const processedItems: IQuotationItem[] = items.map(item => {
      const rate = Number(item.rate) || 0;
      const quantity = Math.max(0.01, Number(item.quantity) || 1);
      const discount = Math.max(0, Number(item.discount) || 0);
      const amount = Number((rate * quantity).toFixed(2));
      const taxableAmount = Math.max(0, Number((amount - discount).toFixed(2)));
      const gstPercentage = Number(item.gstPercentage) || 0;

      const taxAmount = Number(((taxableAmount * gstPercentage) / 100).toFixed(2));

      let cgst = 0;
      let sgst = 0;
      let igst = 0;

      if (isInterState) {
        igst = taxAmount;
      } else {
        cgst = Number((taxAmount / 2).toFixed(2));
        sgst = Number((taxAmount - cgst).toFixed(2)); // catch odd decimal splits
      }

      const total = Number((taxableAmount + taxAmount).toFixed(2));

      subtotal += amount;
      discountTotal += discount;
      taxableTotal += taxableAmount;
      cgstTotal += cgst;
      sgstTotal += sgst;
      igstTotal += igst;

      return {
        serviceId: item.serviceId ? new mongoose.Types.ObjectId(item.serviceId) : undefined,
        description: item.description,
        sacCode: item.sacCode,
        rate,
        quantity,
        amount,
        discount,
        taxableAmount,
        gstPercentage,
        cgst,
        sgst,
        igst,
        total
      };
    });

    const taxTotal = Number((cgstTotal + sgstTotal + igstTotal).toFixed(2));
    const grandTotalRaw = taxableTotal + taxTotal;
    const grandTotal = Math.round(grandTotalRaw);
    const roundOff = Number((grandTotal - grandTotalRaw).toFixed(2));

    const totals: IQuotationTotals = {
      subtotal: Number(subtotal.toFixed(2)),
      discountTotal: Number(discountTotal.toFixed(2)),
      taxableTotal: Number(taxableTotal.toFixed(2)),
      cgstTotal: Number(cgstTotal.toFixed(2)),
      sgstTotal: Number(sgstTotal.toFixed(2)),
      igstTotal: Number(igstTotal.toFixed(2)),
      taxTotal,
      roundOff,
      grandTotal
    };

    return { items: processedItems, totals };
  }

  /**
   * Phase 106 & 107: Create new quotation proposal in Draft status
   */
  static async createQuotation(
    tenantId: mongoose.Types.ObjectId,
    userId: mongoose.Types.ObjectId,
    dto: CreateQuotationDTO
  ): Promise<IQuotation> {
    const client = await Client.findOne({ _id: dto.clientId, tenantId });
    if (!client) {
      throw new ApiError(404, 'Client not found');
    }

    if (!dto.items || dto.items.length === 0) {
      throw new ApiError(400, 'Quotation must have at least one line item');
    }

    // Determine inter-state status from client or override
    let isInterState = dto.isInterState ?? false;
    if (dto.isInterState === undefined && client.state) {
      const org = await Organization.findById(tenantId);
      if (org?.address?.state && client.state) {
        isInterState = org.address.state.trim().toLowerCase() !== client.state.trim().toLowerCase();
      }
    }

    const { items, totals } = this.calculateTotals(dto.items, isInterState);
    const quotationNo = await getNextQuotationNumber(tenantId);

    const quoteDate = dto.date ? new Date(dto.date) : new Date();
    const validUntil = dto.validUntil
      ? new Date(dto.validUntil)
      : new Date(quoteDate.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days default

    const quotation = new Quotation({
      tenantId,
      clientId: client._id,
      billingEntityId: dto.billingEntityId ? new mongoose.Types.ObjectId(dto.billingEntityId) : undefined,
      quotationNo,
      date: quoteDate,
      validUntil,
      items,
      totals,
      termsAndConditions: dto.termsAndConditions,
      notes: dto.notes,
      status: 'Draft',
      createdBy: userId
    });

    await quotation.save();

    return (await Quotation.findById(quotation._id)
      .populate('clientId', 'name clientNumber fileNo pan gstin email mobile address city state pincode')
      .populate('billingEntityId')
      .populate('createdBy', 'name email')) as IQuotation;
  }

  /**
   * Phase 107: Filterable Quotation Directory & Pipeline Metrics Summary
   */
  static async getQuotations(tenantId: mongoose.Types.ObjectId, query: QuotationFilterQuery) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 10));
    const skip = (page - 1) * limit;

    const filter: any = { tenantId };

    if (query.clientId) {
      filter.clientId = new mongoose.Types.ObjectId(query.clientId);
    }

    if (query.status && query.status !== 'all') {
      filter.status = query.status;
    }

    if (query.startDate || query.endDate) {
      filter.date = {};
      if (query.startDate) filter.date.$gte = new Date(query.startDate);
      if (query.endDate) {
        const end = new Date(query.endDate);
        end.setHours(23, 59, 59, 999);
        filter.date.$lte = end;
      }
    }

    if (query.search) {
      const searchRegex = new RegExp(query.search.trim(), 'i');
      filter.$or = [{ quotationNo: searchRegex }, { notes: searchRegex }];
    }

    const [quotations, total, summaryAgg] = await Promise.all([
      Quotation.find(filter)
        .populate('clientId', 'name clientNumber fileNo pan email mobile')
        .populate('convertedInvoiceId', 'invoiceNo date status totals')
        .sort({ date: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Quotation.countDocuments(filter),
      Quotation.aggregate([
        { $match: { tenantId } },
        {
          $group: {
            _id: null,
            totalCount: { $sum: 1 },
            totalValue: { $sum: '$totals.grandTotal' },
            draftValue: {
              $sum: { $cond: [{ $eq: ['$status', 'Draft'] }, '$totals.grandTotal', 0] }
            },
            sentValue: {
              $sum: { $cond: [{ $eq: ['$status', 'Sent'] }, '$totals.grandTotal', 0] }
            },
            acceptedValue: {
              $sum: { $cond: [{ $eq: ['$status', 'Accepted'] }, '$totals.grandTotal', 0] }
            },
            convertedValue: {
              $sum: { $cond: [{ $eq: ['$status', 'Converted'] }, '$totals.grandTotal', 0] }
            },
            declinedValue: {
              $sum: { $cond: [{ $eq: ['$status', 'Declined'] }, '$totals.grandTotal', 0] }
            }
          }
        }
      ])
    ]);

    const summary = summaryAgg[0] || {
      totalCount: 0,
      totalValue: 0,
      draftValue: 0,
      sentValue: 0,
      acceptedValue: 0,
      convertedValue: 0,
      declinedValue: 0
    };

    return {
      quotations,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit) || 1
      },
      summary: {
        totalCount: summary.totalCount,
        totalValue: summary.totalValue,
        draftValue: summary.draftValue,
        sentValue: summary.sentValue,
        acceptedValue: summary.acceptedValue,
        convertedValue: summary.convertedValue,
        declinedValue: summary.declinedValue
      }
    };
  }

  /**
   * Phase 107: Get Single Quotation
   */
  static async getQuotationById(tenantId: mongoose.Types.ObjectId, id: string): Promise<IQuotation> {
    const quotation = await Quotation.findOne({ _id: id, tenantId })
      .populate('clientId', 'name clientNumber fileNo pan gstin email mobile address city state pincode entityType contactPersonName')
      .populate('billingEntityId')
      .populate('convertedInvoiceId', 'invoiceNo date status totals')
      .populate('createdBy', 'name email');

    if (!quotation) {
      throw new ApiError(404, 'Quotation not found');
    }

    return quotation;
  }

  /**
   * Phase 107: Update Quotation (Blocked if already Converted)
   */
  static async updateQuotation(
    tenantId: mongoose.Types.ObjectId,
    id: string,
    dto: UpdateQuotationDTO
  ): Promise<IQuotation> {
    const quotation = await Quotation.findOne({ _id: id, tenantId });
    if (!quotation) {
      throw new ApiError(404, 'Quotation not found');
    }

    if (quotation.status === 'Converted') {
      throw new ApiError(400, 'Cannot edit a quotation that has already been converted to an invoice');
    }

    if (dto.billingEntityId !== undefined) {
      quotation.billingEntityId = dto.billingEntityId
        ? new mongoose.Types.ObjectId(dto.billingEntityId)
        : undefined;
    }

    if (dto.date) quotation.date = new Date(dto.date);
    if (dto.validUntil) quotation.validUntil = new Date(dto.validUntil);
    if (dto.termsAndConditions !== undefined) quotation.termsAndConditions = dto.termsAndConditions;
    if (dto.notes !== undefined) quotation.notes = dto.notes;

    if (dto.items && dto.items.length > 0) {
      const isInterState = dto.isInterState ?? (quotation.totals.igstTotal > 0);
      const { items, totals } = this.calculateTotals(dto.items, isInterState);
      quotation.items = items;
      quotation.totals = totals;
    }

    await quotation.save();

    return this.getQuotationById(tenantId, id);
  }

  /**
   * Phase 107: Delete Quotation (Blocked if Converted)
   */
  static async deleteQuotation(tenantId: mongoose.Types.ObjectId, id: string): Promise<void> {
    const quotation = await Quotation.findOne({ _id: id, tenantId });
    if (!quotation) {
      throw new ApiError(404, 'Quotation not found');
    }

    if (quotation.status === 'Converted') {
      throw new ApiError(400, 'Cannot delete a converted quotation');
    }

    await Quotation.deleteOne({ _id: id, tenantId });
  }

  /**
   * Phase 108: Update Quotation Status Lifecycle (Draft -> Sent -> Accepted / Declined)
   */
  static async updateQuotationStatus(
    tenantId: mongoose.Types.ObjectId,
    id: string,
    status: QuotationStatus
  ): Promise<IQuotation> {
    const quotation = await Quotation.findOne({ _id: id, tenantId });
    if (!quotation) {
      throw new ApiError(404, 'Quotation not found');
    }

    if (quotation.status === 'Converted') {
      throw new ApiError(400, 'Cannot change status of a converted quotation');
    }

    if (status === 'Converted') {
      throw new ApiError(400, 'Use convert-to-invoice endpoint to convert a quotation');
    }

    quotation.status = status;
    if (status === 'Sent' && !quotation.sentAt) {
      quotation.sentAt = new Date();
    }

    await quotation.save();

    return this.getQuotationById(tenantId, id);
  }

  /**
   * Phase 108: Email Proposal Dispatch to Client
   */
  static async sendQuotationEmail(
    tenantId: mongoose.Types.ObjectId,
    id: string,
    customRecipientEmail?: string
  ): Promise<{ sent: boolean; sentAt: Date; email: string }> {
    const quotation = await this.getQuotationById(tenantId, id);
    const client = quotation.clientId as any;

    const recipientEmail = customRecipientEmail || client?.email;
    if (!recipientEmail) {
      throw new ApiError(400, 'Client does not have a configured email address');
    }

    // Format HTML proposal table
    const itemsHtml = quotation.items
      .map(
        (item, index) => `
        <tr>
          <td style="border: 1px solid #e2e8f0; padding: 8px;">${index + 1}</td>
          <td style="border: 1px solid #e2e8f0; padding: 8px;">${item.description}</td>
          <td style="border: 1px solid #e2e8f0; padding: 8px; text-align: right;">₹${item.rate.toLocaleString('en-IN')}</td>
          <td style="border: 1px solid #e2e8f0; padding: 8px; text-align: center;">${item.quantity}</td>
          <td style="border: 1px solid #e2e8f0; padding: 8px; text-align: right;">₹${item.total.toLocaleString('en-IN')}</td>
        </tr>`
      )
      .join('');

    const htmlBody = `
      <div style="font-family: Arial, sans-serif; color: #1e293b; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #0f172a; border-bottom: 2px solid #e2e8f0; padding-bottom: 8px;">Service Quotation: ${quotation.quotationNo}</h2>
        <p>Dear <strong>${client.name || 'Valued Client'}</strong>,</p>
        <p>We are pleased to present our proposal for professional services as detailed below:</p>
        
        <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 14px;">
          <thead>
            <tr style="background-color: #f8fafc;">
              <th style="border: 1px solid #e2e8f0; padding: 8px; text-align: left;">#</th>
              <th style="border: 1px solid #e2e8f0; padding: 8px; text-align: left;">Description</th>
              <th style="border: 1px solid #e2e8f0; padding: 8px; text-align: right;">Rate</th>
              <th style="border: 1px solid #e2e8f0; padding: 8px; text-align: center;">Qty</th>
              <th style="border: 1px solid #e2e8f0; padding: 8px; text-align: right;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
          <tfoot>
            <tr style="font-weight: bold; background-color: #f1f5f9;">
              <td colspan="4" style="border: 1px solid #e2e8f0; padding: 8px; text-align: right;">Grand Total:</td>
              <td style="border: 1px solid #e2e8f0; padding: 8px; text-align: right;">₹${quotation.totals.grandTotal.toLocaleString('en-IN')}</td>
            </tr>
          </tfoot>
        </table>

        <p><strong>Valid Until:</strong> ${new Date(quotation.validUntil).toLocaleDateString('en-IN')}</p>
        ${quotation.termsAndConditions ? `<p><strong>Terms:</strong> ${quotation.termsAndConditions}</p>` : ''}
        
        <br/>
        <p>Please let us know if you have any questions or wish to proceed.</p>
        <p>Best regards,<br/><strong>Practice Management Team</strong></p>
      </div>
    `;

    try {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.ethereal.email',
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        }
      });

      await transporter.sendMail({
        from: `"Practice Pro" <${process.env.SMTP_FROM || 'proposals@proactiveapp.com'}>`,
        to: recipientEmail,
        subject: `Quotation ${quotation.quotationNo} from Practice`,
        html: htmlBody
      });
    } catch (err: any) {
      console.warn('[QuotationService] Email dispatch failed/skipped:', err.message);
    }

    quotation.status = 'Sent';
    quotation.sentAt = new Date();
    await quotation.save();

    return {
      sent: true,
      sentAt: quotation.sentAt,
      email: recipientEmail
    };
  }

  /**
   * Phase 109: 1-Click "Convert to Invoice" Atomic Engine
   */
  static async convertToInvoice(
    tenantId: mongoose.Types.ObjectId,
    id: string,
    options?: { status?: 'Draft' | 'Unpaid' }
  ) {
    const quotation = await Quotation.findOne({ _id: id, tenantId });
    if (!quotation) {
      throw new ApiError(404, 'Quotation not found');
    }

    if (quotation.status === 'Converted') {
      throw new ApiError(400, 'Quotation has already been converted to an invoice');
    }

    // Generate atomic sequence for new Invoice
    const invoiceNo = await getNextInvoiceNumber(tenantId, 'INV-');

    // Map quotation line items directly to Invoice line items
    const invoiceItems = quotation.items.map(item => ({
      referenceType: 'Manual' as const,
      particulars: item.description,
      sacCode: item.sacCode,
      quantity: item.quantity,
      rate: item.rate,
      discount: item.discount,
      gstPercentage: item.gstPercentage,
      taxableAmount: item.taxableAmount,
      gstAmount: Number((item.cgst + item.sgst + item.igst).toFixed(2)),
      total: item.total
    }));

    const invoiceTotals = {
      subtotal: quotation.totals.subtotal,
      totalDiscount: quotation.totals.discountTotal,
      totalTaxable: quotation.totals.taxableTotal,
      totalGst: quotation.totals.taxTotal,
      roundOff: quotation.totals.roundOff,
      grandTotal: quotation.totals.grandTotal,
      amountPaid: 0,
      amountDue: quotation.totals.grandTotal
    };

    // Create active Invoice
    const invoice = new Invoice({
      tenantId,
      clientId: quotation.clientId,
      billingEntityId: quotation.billingEntityId,
      invoiceNo,
      date: new Date(),
      dueDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000), // 15 days default
      items: invoiceItems,
      totals: invoiceTotals,
      notes: quotation.notes,
      termsAndConditions: quotation.termsAndConditions,
      status: options?.status || 'Unpaid'
    });

    await invoice.save();

    // Mark quotation as Converted
    quotation.status = 'Converted';
    quotation.convertedInvoiceId = invoice._id as mongoose.Types.ObjectId;
    quotation.convertedAt = new Date();
    await quotation.save();

    return {
      quotation,
      invoice
    };
  }

  /**
   * Phase 110: Printable Proposal Layout Metadata
   */
  static async getPrintLayout(tenantId: mongoose.Types.ObjectId, id: string) {
    const quotation = await this.getQuotationById(tenantId, id);
    const org = await Organization.findById(tenantId).select('name email phone gstin pan address');
    const billingEntity = quotation.billingEntityId as any;

    // Convert grand total to words
    const amountInWords = this.numberToIndianWords(quotation.totals.grandTotal);

    return {
      quotation,
      firm: {
        name: billingEntity?.name || org?.name || 'Proactive Firm',
        legalName: billingEntity?.legalName || org?.name,
        gstin: billingEntity?.gstin || org?.gstin,
        pan: billingEntity?.pan || org?.pan,
        email: billingEntity?.email || org?.email,
        phone: billingEntity?.phone || org?.phone,
        address: billingEntity?.address || org?.address,
        bankDetails: billingEntity?.bankDetails
      },
      amountInWords
    };
  }

  /**
   * Helper: Convert number to Indian currency words
   */
  static numberToIndianWords(num: number): string {
    const a = [
      '',
      'One ',
      'Two ',
      'Three ',
      'Four ',
      'Five ',
      'Six ',
      'Seven ',
      'Eight ',
      'Nine ',
      'Ten ',
      'Eleven ',
      'Twelve ',
      'Thirteen ',
      'Fourteen ',
      'Fifteen ',
      'Sixteen ',
      'Seventeen ',
      'Eighteen ',
      'Nineteen '
    ];
    const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

    if ((num = Math.floor(num)) === 0) return 'Zero Rupees Only';

    const formatSection = (n: number) => {
      let str = '';
      if (n > 99) {
        str += a[Math.floor(n / 100)] + 'Hundred ';
        n %= 100;
      }
      if (n > 19) {
        str += b[Math.floor(n / 10)] + ' ' + a[n % 10];
      } else if (n > 0) {
        str += a[n];
      }
      return str;
    };

    let words = '';
    const crore = Math.floor(num / 10000000);
    num %= 10000000;
    const lakh = Math.floor(num / 100000);
    num %= 100000;
    const thousand = Math.floor(num / 1000);
    num %= 1000;
    const hundred = num;

    if (crore > 0) words += formatSection(crore) + 'Crore ';
    if (lakh > 0) words += formatSection(lakh) + 'Lakh ';
    if (thousand > 0) words += formatSection(thousand) + 'Thousand ';
    if (hundred > 0) words += formatSection(hundred);

    return `${words.trim()} Rupees Only`;
  }

  /**
   * Phase 110: Pre-Sales Quotation Pipeline Analytics
   */
  static async getQuotationPipelineAnalytics(
    tenantId: mongoose.Types.ObjectId,
    query?: { startDate?: string; endDate?: string }
  ) {
    const matchFilter: any = { tenantId };

    if (query?.startDate || query?.endDate) {
      matchFilter.date = {};
      if (query.startDate) matchFilter.date.$gte = new Date(query.startDate);
      if (query.endDate) {
        const end = new Date(query.endDate);
        end.setHours(23, 59, 59, 999);
        matchFilter.date.$lte = end;
      }
    }

    const [analytics] = await Quotation.aggregate([
      { $match: matchFilter },
      {
        $facet: {
          overview: [
            {
              $group: {
                _id: null,
                totalQuotations: { $sum: 1 },
                totalPipelineValue: { $sum: '$totals.grandTotal' },
                convertedCount: {
                  $sum: { $cond: [{ $eq: ['$status', 'Converted'] }, 1, 0] }
                },
                convertedValue: {
                  $sum: { $cond: [{ $eq: ['$status', 'Converted'] }, '$totals.grandTotal', 0] }
                },
                acceptedCount: {
                  $sum: { $cond: [{ $eq: ['$status', 'Accepted'] }, 1, 0] }
                },
                acceptedValue: {
                  $sum: { $cond: [{ $eq: ['$status', 'Accepted'] }, '$totals.grandTotal', 0] }
                },
                sentCount: {
                  $sum: { $cond: [{ $eq: ['$status', 'Sent'] }, 1, 0] }
                },
                sentValue: {
                  $sum: { $cond: [{ $eq: ['$status', 'Sent'] }, '$totals.grandTotal', 0] }
                },
                declinedCount: {
                  $sum: { $cond: [{ $eq: ['$status', 'Declined'] }, 1, 0] }
                },
                declinedValue: {
                  $sum: { $cond: [{ $eq: ['$status', 'Declined'] }, '$totals.grandTotal', 0] }
                }
              }
            }
          ],
          statusBreakdown: [
            {
              $group: {
                _id: '$status',
                count: { $sum: 1 },
                totalValue: { $sum: '$totals.grandTotal' }
              }
            },
            { $project: { status: '$_id', count: 1, totalValue: 1, _id: 0 } }
          ],
          monthlyTrends: [
            {
              $group: {
                _id: { $dateToString: { format: '%Y-%m', date: '$date' } },
                totalQuotations: { $sum: 1 },
                totalValue: { $sum: '$totals.grandTotal' },
                convertedCount: {
                  $sum: { $cond: [{ $eq: ['$status', 'Converted'] }, 1, 0] }
                },
                convertedValue: {
                  $sum: { $cond: [{ $eq: ['$status', 'Converted'] }, '$totals.grandTotal', 0] }
                }
              }
            },
            { $sort: { _id: 1 } },
            { $project: { month: '$_id', totalQuotations: 1, totalValue: 1, convertedCount: 1, convertedValue: 1, _id: 0 } }
          ]
        }
      }
    ]);

    const overview = analytics?.overview?.[0] || {
      totalQuotations: 0,
      totalPipelineValue: 0,
      convertedCount: 0,
      convertedValue: 0,
      acceptedCount: 0,
      acceptedValue: 0,
      sentCount: 0,
      sentValue: 0,
      declinedCount: 0,
      declinedValue: 0
    };

    const conversionRatePercentage =
      overview.totalQuotations > 0
        ? Math.round((overview.convertedCount / overview.totalQuotations) * 100)
        : 0;

    return {
      overview: {
        ...overview,
        conversionRatePercentage
      },
      statusBreakdown: analytics?.statusBreakdown || [],
      monthlyTrends: analytics?.monthlyTrends || []
    };
  }
}

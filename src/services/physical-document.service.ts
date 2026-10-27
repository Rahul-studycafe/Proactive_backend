import mongoose from 'mongoose';
import {
  PhysicalDocumentModel,
  IPhysicalDocument,
  DocumentCategory,
  PhysicalDocumentType,
  PhysicalDocumentStatus
} from '../models/PhysicalDocument';
import { Client } from '../modules/clients/schemas/client.schema';
import { User } from '../modules/auth/schemas/user.schema';
import { Organization } from '../modules/auth/schemas/organization.schema';
import { ApiError } from '../common/errors/api-error';

export interface CreatePhysicalDocumentInput {
  clientId: string;
  date?: string | Date;
  category: DocumentCategory;
  documentType: PhysicalDocumentType;
  documentName: string;
  isReturnable?: boolean;
  returnDate?: string | Date;
  location: string;
  custodianUserId?: string;
  receivedByPersonName?: string;
  receivedByPhone?: string;
  notes?: string;
}

export interface UpdatePhysicalDocumentInput {
  clientId?: string;
  date?: string | Date;
  category?: DocumentCategory;
  documentType?: PhysicalDocumentType;
  documentName?: string;
  isReturnable?: boolean;
  returnDate?: string | Date | null;
  location?: string;
  custodianUserId?: string;
  receivedByPersonName?: string;
  receivedByPhone?: string;
  notes?: string;
}

export interface ReturnPhysicalDocumentInput {
  actualReturnedDate?: string | Date;
  returnedToPersonName?: string;
  returnedNotes?: string;
}

export interface GetPhysicalDocumentsQuery {
  page?: number | string;
  limit?: number | string;
  clientId?: string;
  category?: DocumentCategory;
  status?: PhysicalDocumentStatus;
  isReturnable?: string | boolean;
  documentType?: PhysicalDocumentType;
  location?: string;
  fromDate?: string;
  toDate?: string;
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc' | 1 | -1;
}

/**
 * Creates a physical document entry in the in-out custody register
 */
export const createPhysicalDocumentService = async (
  tenantId: mongoose.Types.ObjectId,
  data: CreatePhysicalDocumentInput,
  currentUserId: mongoose.Types.ObjectId
): Promise<IPhysicalDocument> => {
  // Validate Client existence
  const client = await Client.findOne({ _id: data.clientId, tenantId });
  if (!client) {
    throw new ApiError(404, 'Client not found', 'CLIENT_NOT_FOUND');
  }

  // Validate Custodian user if passed
  const custodianId = data.custodianUserId
    ? new mongoose.Types.ObjectId(data.custodianUserId)
    : currentUserId;

  const custodianUser = await User.findOne({ _id: custodianId, tenantId });
  if (!custodianUser) {
    throw new ApiError(404, 'Custodian user not found', 'USER_NOT_FOUND');
  }

  const isReturnable = Boolean(data.isReturnable);
  let returnDate: Date | undefined;

  if (isReturnable) {
    if (!data.returnDate) {
      throw new ApiError(
        400,
        'Return date is required when document is marked as returnable',
        'VALIDATION_ERROR'
      );
    }
    returnDate = new Date(data.returnDate);
  }

  // Determine initial status
  let status: PhysicalDocumentStatus = 'In Custody';
  let actualReturnedDate: Date | undefined;

  if (data.category === 'Given' && !isReturnable) {
    status = 'Returned';
    actualReturnedDate = data.date ? new Date(data.date) : new Date();
  } else if (isReturnable && returnDate && returnDate < new Date()) {
    status = 'Overdue';
  }

  const doc = await PhysicalDocumentModel.create({
    tenantId,
    clientId: new mongoose.Types.ObjectId(data.clientId),
    date: data.date ? new Date(data.date) : new Date(),
    category: data.category,
    documentType: data.documentType,
    documentName: data.documentName.trim(),
    isReturnable,
    returnDate,
    actualReturnedDate,
    status,
    location: data.location.trim(),
    custodianUserId: custodianId,
    receivedByPersonName: data.receivedByPersonName?.trim(),
    receivedByPhone: data.receivedByPhone?.trim(),
    notes: data.notes?.trim()
  });

  return (await PhysicalDocumentModel.findById(doc._id)
    .populate('clientId', 'name email mobile')
    .populate('custodianUserId', 'name email')) as IPhysicalDocument;
};

/**
 * Returns a filterable, paginated list of physical documents with inventory summary
 */
export const getPhysicalDocumentListService = async (
  tenantId: mongoose.Types.ObjectId,
  query: GetPhysicalDocumentsQuery
) => {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
  const skip = (page - 1) * limit;

  const filter: any = { tenantId };

  if (query.clientId && mongoose.Types.ObjectId.isValid(query.clientId)) {
    filter.clientId = new mongoose.Types.ObjectId(query.clientId);
  }

  if (query.category) {
    filter.category = query.category;
  }

  if (query.status) {
    filter.status = query.status;
  }

  if (query.documentType) {
    filter.documentType = query.documentType;
  }

  if (query.location) {
    filter.location = query.location;
  }

  if (query.isReturnable !== undefined && query.isReturnable !== '') {
    filter.isReturnable = String(query.isReturnable) === 'true';
  }

  if (query.fromDate || query.toDate) {
    filter.date = {};
    if (query.fromDate) {
      filter.date.$gte = new Date(query.fromDate);
    }
    if (query.toDate) {
      const to = new Date(query.toDate);
      to.setHours(23, 59, 59, 999);
      filter.date.$lte = to;
    }
  }

  if (query.search && query.search.trim()) {
    const regex = new RegExp(query.search.trim(), 'i');
    filter.$or = [
      { documentName: regex },
      { location: regex },
      { receivedByPersonName: regex },
      { returnedToPersonName: regex },
      { notes: regex }
    ];
  }

  const sortField = query.sortBy || 'date';
  const sortDirection =
    query.sortOrder === 'asc' || query.sortOrder === 1 ? 1 : -1;
  const sortOptions: any = { [sortField]: sortDirection, _id: -1 };

  const [items, totalMatching, inCustodyCount, overdueCount, returnedCount] =
    await Promise.all([
      PhysicalDocumentModel.find(filter)
        .populate('clientId', 'name email mobile')
        .populate('custodianUserId', 'name email')
        .sort(sortOptions)
        .skip(skip)
        .limit(limit)
        .lean(),
      PhysicalDocumentModel.countDocuments(filter),
      PhysicalDocumentModel.countDocuments({ tenantId, status: 'In Custody' }),
      PhysicalDocumentModel.countDocuments({ tenantId, status: 'Overdue' }),
      PhysicalDocumentModel.countDocuments({ tenantId, status: 'Returned' })
    ]);

  const totalPages = Math.ceil(totalMatching / limit) || 1;

  return {
    data: items,
    meta: {
      total: totalMatching,
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1
    },
    summary: {
      inCustody: inCustodyCount,
      overdue: overdueCount,
      returned: returnedCount,
      totalRegistered: inCustodyCount + overdueCount + returnedCount
    }
  };
};

/**
 * Gets a physical document by its ID with populated references
 */
export const getPhysicalDocumentByIdService = async (
  tenantId: mongoose.Types.ObjectId,
  id: string
): Promise<IPhysicalDocument> => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(400, 'Invalid document ID format', 'VALIDATION_ERROR');
  }

  const doc = await PhysicalDocumentModel.findOne({ _id: id, tenantId })
    .populate('clientId', 'name email mobile')
    .populate('custodianUserId', 'name email');

  if (!doc) {
    throw new ApiError(404, 'Physical document record not found', 'DOCUMENT_NOT_FOUND');
  }

  return doc;
};

/**
 * Updates an existing physical document metadata or location
 */
export const updatePhysicalDocumentService = async (
  tenantId: mongoose.Types.ObjectId,
  id: string,
  updateData: UpdatePhysicalDocumentInput
): Promise<IPhysicalDocument> => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(400, 'Invalid document ID format', 'VALIDATION_ERROR');
  }

  const doc = await PhysicalDocumentModel.findOne({ _id: id, tenantId });
  if (!doc) {
    throw new ApiError(404, 'Physical document record not found', 'DOCUMENT_NOT_FOUND');
  }

  // Validate client if changed
  if (updateData.clientId && updateData.clientId !== doc.clientId.toString()) {
    const client = await Client.findOne({ _id: updateData.clientId, tenantId });
    if (!client) {
      throw new ApiError(404, 'Client not found', 'CLIENT_NOT_FOUND');
    }
    doc.clientId = new mongoose.Types.ObjectId(updateData.clientId);
  }

  // Validate custodian user if changed
  if (
    updateData.custodianUserId &&
    updateData.custodianUserId !== doc.custodianUserId.toString()
  ) {
    const user = await User.findOne({ _id: updateData.custodianUserId, tenantId });
    if (!user) {
      throw new ApiError(404, 'Custodian user not found', 'USER_NOT_FOUND');
    }
    doc.custodianUserId = new mongoose.Types.ObjectId(updateData.custodianUserId);
  }

  if (updateData.documentName !== undefined) {
    doc.documentName = updateData.documentName.trim();
  }

  if (updateData.category !== undefined) {
    doc.category = updateData.category;
  }

  if (updateData.documentType !== undefined) {
    doc.documentType = updateData.documentType;
  }

  if (updateData.location !== undefined) {
    doc.location = updateData.location.trim();
  }

  if (updateData.date !== undefined) {
    doc.date = new Date(updateData.date);
  }

  if (updateData.isReturnable !== undefined) {
    doc.isReturnable = Boolean(updateData.isReturnable);
  }

  if (updateData.returnDate !== undefined) {
    if (updateData.returnDate === null || updateData.returnDate === '') {
      doc.returnDate = undefined;
    } else {
      doc.returnDate = new Date(updateData.returnDate);
    }
  }

  if (doc.isReturnable && !doc.returnDate) {
    throw new ApiError(
      400,
      'Return date is required when document is marked as returnable',
      'VALIDATION_ERROR'
    );
  }

  // Recalculate status if not marked as Returned
  if (doc.status !== 'Returned') {
    if (doc.isReturnable && doc.returnDate && doc.returnDate < new Date()) {
      doc.status = 'Overdue';
    } else {
      doc.status = 'In Custody';
    }
  }

  if (updateData.receivedByPersonName !== undefined) {
    doc.receivedByPersonName = updateData.receivedByPersonName.trim();
  }

  if (updateData.receivedByPhone !== undefined) {
    doc.receivedByPhone = updateData.receivedByPhone.trim();
  }

  if (updateData.notes !== undefined) {
    doc.notes = updateData.notes.trim();
  }

  await doc.save();

  return (await PhysicalDocumentModel.findById(doc._id)
    .populate('clientId', 'name email mobile')
    .populate('custodianUserId', 'name email')) as IPhysicalDocument;
};

/**
 * Deletes a physical document record
 */
export const deletePhysicalDocumentService = async (
  tenantId: mongoose.Types.ObjectId,
  id: string
): Promise<void> => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(400, 'Invalid document ID format', 'VALIDATION_ERROR');
  }

  const result = await PhysicalDocumentModel.findOneAndDelete({ _id: id, tenantId });
  if (!result) {
    throw new ApiError(404, 'Physical document record not found', 'DOCUMENT_NOT_FOUND');
  }
};

/**
 * Acknowledges document return to client or physical hand-back
 */
export const returnPhysicalDocumentService = async (
  tenantId: mongoose.Types.ObjectId,
  id: string,
  returnData: ReturnPhysicalDocumentInput
): Promise<IPhysicalDocument> => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(400, 'Invalid document ID format', 'VALIDATION_ERROR');
  }

  const doc = await PhysicalDocumentModel.findOne({ _id: id, tenantId });
  if (!doc) {
    throw new ApiError(404, 'Physical document record not found', 'DOCUMENT_NOT_FOUND');
  }

  if (doc.status === 'Returned') {
    throw new ApiError(
      400,
      'Document has already been marked as returned',
      'DOCUMENT_ALREADY_RETURNED'
    );
  }

  doc.status = 'Returned';
  doc.actualReturnedDate = returnData.actualReturnedDate
    ? new Date(returnData.actualReturnedDate)
    : new Date();

  if (returnData.returnedToPersonName) {
    doc.returnedToPersonName = returnData.returnedToPersonName.trim();
  }
  if (returnData.returnedNotes) {
    doc.returnedNotes = returnData.returnedNotes.trim();
  }

  await doc.save();

  return (await PhysicalDocumentModel.findById(doc._id)
    .populate('clientId', 'name email mobile')
    .populate('custodianUserId', 'name email')) as IPhysicalDocument;
};

/**
 * Aggregates all storage locations with custody counts
 */
export const getStorageLocationsService = async (
  tenantId: mongoose.Types.ObjectId
) => {
  const locations = await PhysicalDocumentModel.aggregate([
    { $match: { tenantId } },
    {
      $group: {
        _id: '$location',
        activeCount: {
          $sum: { $cond: [{ $eq: ['$status', 'In Custody'] }, 1, 0] }
        },
        overdueCount: {
          $sum: { $cond: [{ $eq: ['$status', 'Overdue'] }, 1, 0] }
        },
        returnedCount: {
          $sum: { $cond: [{ $eq: ['$status', 'Returned'] }, 1, 0] }
        },
        totalCount: { $sum: 1 }
      }
    },
    {
      $project: {
        _id: 0,
        location: '$_id',
        activeCount: 1,
        overdueCount: 1,
        returnedCount: 1,
        totalCount: 1
      }
    },
    { $sort: { activeCount: -1, overdueCount: -1, totalCount: -1, location: 1 } }
  ]);

  return locations;
};

/**
 * Scans for overdue returnable physical documents and transitions them to 'Overdue'
 */
export const scanOverduePhysicalDocumentsService = async (
  tenantId?: mongoose.Types.ObjectId,
  referenceDate: Date = new Date()
) => {
  const matchFilter: any = {
    status: 'In Custody',
    isReturnable: true,
    returnDate: { $lt: referenceDate }
  };

  if (tenantId) {
    matchFilter.tenantId = tenantId;
  }

  const result = await PhysicalDocumentModel.updateMany(matchFilter, {
    $set: { status: 'Overdue' }
  });

  return {
    referenceDate,
    updatedOverdueCount: result.modifiedCount
  };
};

/**
 * Generates CSV string of the physical document register
 */
export const exportPhysicalDocumentsCsvService = async (
  tenantId: mongoose.Types.ObjectId,
  query: GetPhysicalDocumentsQuery
): Promise<string> => {
  const filter: any = { tenantId };

  if (query.clientId && mongoose.Types.ObjectId.isValid(query.clientId)) {
    filter.clientId = new mongoose.Types.ObjectId(query.clientId);
  }
  if (query.category) filter.category = query.category;
  if (query.status) filter.status = query.status;
  if (query.documentType) filter.documentType = query.documentType;
  if (query.location) filter.location = query.location;
  if (query.isReturnable !== undefined && query.isReturnable !== '') {
    filter.isReturnable = String(query.isReturnable) === 'true';
  }

  const items = await PhysicalDocumentModel.find(filter)
    .populate('clientId', 'name')
    .populate('custodianUserId', 'name')
    .sort({ date: -1, createdAt: -1 })
    .lean();

  const escapeCsv = (val: any) => {
    if (val === undefined || val === null) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };

  const headers = [
    'Date',
    'Category',
    'Document Name',
    'Document Type',
    'Client Name',
    'Status',
    'Returnable',
    'Expected Return Date',
    'Actual Returned Date',
    'Storage Location',
    'Custodian',
    'Received By',
    'Returned To',
    'Notes'
  ];

  const rows = items.map((doc: any) => {
    const clientName = doc.clientId?.name || 'N/A';
    const custodianName = doc.custodianUserId?.name || 'N/A';
    const dateStr = doc.date ? new Date(doc.date).toISOString().split('T')[0] : '';
    const returnDateStr = doc.returnDate
      ? new Date(doc.returnDate).toISOString().split('T')[0]
      : '';
    const actualReturnedStr = doc.actualReturnedDate
      ? new Date(doc.actualReturnedDate).toISOString().split('T')[0]
      : '';

    return [
      escapeCsv(dateStr),
      escapeCsv(doc.category),
      escapeCsv(doc.documentName),
      escapeCsv(doc.documentType),
      escapeCsv(clientName),
      escapeCsv(doc.status),
      escapeCsv(doc.isReturnable ? 'Yes' : 'No'),
      escapeCsv(returnDateStr),
      escapeCsv(actualReturnedStr),
      escapeCsv(doc.location),
      escapeCsv(custodianName),
      escapeCsv(doc.receivedByPersonName || ''),
      escapeCsv(doc.returnedToPersonName || ''),
      escapeCsv(doc.notes || '')
    ].join(',');
  });

  return [headers.join(','), ...rows].join('\r\n');
};

/**
 * Generates Handover Slip acknowledgment details and printable HTML
 */
export const generateHandoverSlipService = async (
  tenantId: mongoose.Types.ObjectId,
  id: string
) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(400, 'Invalid document ID format', 'VALIDATION_ERROR');
  }

  const doc = await PhysicalDocumentModel.findOne({ _id: id, tenantId })
    .populate('clientId', 'name email mobile address city state pincode')
    .populate('custodianUserId', 'name email');

  if (!doc) {
    throw new ApiError(404, 'Physical document record not found', 'DOCUMENT_NOT_FOUND');
  }

  const organization = await Organization.findById(tenantId);
  const orgName = organization?.name || 'Proactive Accounting Suite';
  const orgAddress = organization?.address
    ? `${organization.address.addressLine1}, ${organization.address.city}, ${organization.address.state} - ${organization.address.pincode}`
    : '';

  const client: any = doc.clientId;
  const custodian: any = doc.custodianUserId;
  const clientName = client?.name || 'Valued Client';
  const slipDate = new Date().toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Document Handover Acknowledgment Slip</title>
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #1e293b; padding: 40px; margin: 0; background: #fff; }
    .header { border-bottom: 2px solid #0f172a; padding-bottom: 20px; margin-bottom: 30px; display: flex; justify-content: space-between; align-items: flex-start; }
    .title { font-size: 24px; font-weight: 700; color: #0f172a; margin: 0 0 6px 0; }
    .subtitle { font-size: 14px; color: #64748b; margin: 0; }
    .badge { display: inline-block; padding: 4px 12px; border-radius: 9999px; font-size: 12px; font-weight: 600; text-transform: uppercase; background: #f1f5f9; color: #334155; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 30px; }
    .box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; }
    .box h4 { margin: 0 0 10px 0; font-size: 13px; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; }
    .row { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 14px; }
    .row .label { color: #64748b; }
    .row .val { font-weight: 600; color: #0f172a; }
    .table-container { margin: 30px 0; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; }
    table { width: 100%; border-collapse: collapse; text-align: left; }
    th { background: #0f172a; color: #fff; padding: 12px 16px; font-size: 13px; font-weight: 600; }
    td { padding: 12px 16px; border-bottom: 1px solid #e2e8f0; font-size: 14px; }
    .declaration { background: #fdf6b2; border: 1px solid #fde047; border-radius: 6px; padding: 14px; font-size: 13px; color: #723b10; line-height: 1.5; margin-bottom: 40px; }
    .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 60px; margin-top: 50px; }
    .sign-line { border-top: 1px dashed #94a3b8; padding-top: 10px; text-align: center; font-size: 13px; font-weight: 600; color: #334155; }
    .stamp-box { height: 70px; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1 class="title">${orgName}</h1>
      <p class="subtitle">${orgAddress || 'Chartered Accountants & Financial Advisors'}</p>
    </div>
    <div style="text-align: right;">
      <span class="badge">${doc.category === 'Received' ? 'Deposit / Custody Receipt' : 'Return / Handover Slip'}</span>
      <p style="font-size: 12px; color: #64748b; margin-top: 6px;">Date: ${slipDate}</p>
    </div>
  </div>

  <div class="grid">
    <div class="box">
      <h4>Client Details</h4>
      <div class="row"><span class="label">Client Name:</span><span class="val">${clientName}</span></div>
      <div class="row"><span class="label">Phone:</span><span class="val">${client?.phone || 'N/A'}</span></div>
      <div class="row"><span class="label">Email:</span><span class="val">${client?.email || 'N/A'}</span></div>
    </div>
    <div class="box">
      <h4>Custody Details</h4>
      <div class="row"><span class="label">Action Type:</span><span class="val">${doc.category}</span></div>
      <div class="row"><span class="label">Custodian:</span><span class="val">${custodian?.name || 'Authorized Staff'}</span></div>
      <div class="row"><span class="label">Office Location:</span><span class="val">${doc.location}</span></div>
    </div>
  </div>

  <div class="table-container">
    <table>
      <thead>
        <tr>
          <th>Document Description</th>
          <th>Type</th>
          <th>Returnable</th>
          <th>Status</th>
          <th>Actual / Return Date</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>${doc.documentName}</strong></td>
          <td>${doc.documentType}</td>
          <td>${doc.isReturnable ? 'Yes' : 'No'}</td>
          <td>${doc.status}</td>
          <td>${doc.actualReturnedDate ? new Date(doc.actualReturnedDate).toLocaleDateString('en-IN') : (doc.returnDate ? new Date(doc.returnDate).toLocaleDateString('en-IN') : 'N/A')}</td>
        </tr>
      </tbody>
    </table>
  </div>

  <div class="declaration">
    <strong>Acknowledgment:</strong> This document acknowledges that the above-mentioned physical asset / original document has been received or delivered under proper physical custody. Both parties verify the physical condition of the item at the time of handover.
  </div>

  <div class="signatures">
    <div>
      <div class="stamp-box"></div>
      <div class="sign-line">Received / Acknowledged By (Client Signature)</div>
    </div>
    <div>
      <div class="stamp-box"></div>
      <div class="sign-line">Authorized Signatory (${orgName})</div>
    </div>
  </div>
</body>
</html>
  `.trim();

  return {
    documentId: doc._id,
    slipDate,
    organization: {
      name: orgName,
      address: orgAddress
    },
    client: {
      id: client?._id,
      name: clientName,
      phone: client?.phone,
      email: client?.email
    },
    document: {
      name: doc.documentName,
      type: doc.documentType,
      category: doc.category,
      status: doc.status,
      isReturnable: doc.isReturnable,
      returnDate: doc.returnDate,
      actualReturnedDate: doc.actualReturnedDate,
      location: doc.location,
      custodianName: custodian?.name,
      notes: doc.notes
    },
    html
  };
};

import mongoose from 'mongoose';
import { DSC, IDSC } from '../models/DSC';
import { DSCHandoverLog, IDSCHandoverLog } from '../models/DSCHandoverLog';
import { Client } from '../modules/clients/schemas/client.schema';
import { Task } from '../models/Task';
import { Service } from '../modules/services/schemas/service.schema';
import { ApiError } from '../common/errors/api-error';
import { sendDscExpiryEmail } from './email.service';

export interface CreateDscInput {
  clientId: string;
  certificateName: string;
  certificateClass?: 'Class 2' | 'Class 3';
  tokenType?: 'ePass2003' | 'ProxKey' | 'mToken' | 'Watchdata' | 'Other';
  tokenSerialNumber?: string;
  issuingAuthority?: 'eMudhra' | 'Capricorn' | 'Vsign' | 'Sify' | 'IDSign' | 'Other';
  issueDate: string | Date;
  expiryDate: string | Date;
  physicalLocation: string;
  status?: 'In Office' | 'With Client' | 'Expired' | 'Renewed';
  currentHolderName?: string;
  notes?: string;
}

export interface UpdateDscInput {
  certificateName?: string;
  certificateClass?: 'Class 2' | 'Class 3';
  tokenType?: 'ePass2003' | 'ProxKey' | 'mToken' | 'Watchdata' | 'Other';
  tokenSerialNumber?: string;
  issuingAuthority?: 'eMudhra' | 'Capricorn' | 'Vsign' | 'Sify' | 'IDSign' | 'Other';
  issueDate?: string | Date;
  expiryDate?: string | Date;
  physicalLocation?: string;
  status?: 'In Office' | 'With Client' | 'Expired' | 'Renewed';
  currentHolderName?: string;
  notes?: string;
}

export interface GetDscListQuery {
  clientId?: string;
  status?: string;
  search?: string;
  expiringWithinDays?: number;
  page?: number;
  limit?: number;
}

export interface DscHandoverInput {
  action: 'Handed to Client' | 'Received from Client' | 'Internal Transfer';
  transferredToName: string;
  transferredToPhone?: string;
  reason: string;
  expectedReturnDate?: string | Date;
  receivedBackDate?: string | Date;
  notes?: string;
}

export interface DscExpiryScanSummary {
  scannedCount: number;
  expiredCount: number;
  milestonesTriggered: {
    thirtyDays: number;
    fifteenDays: number;
    sevenDays: number;
  };
  tasksCreated: number;
  emailsDispatched: number;
  processedDscIds: string[];
}

export interface DscKpiSummary {
  total: number;
  inOffice: number;
  withClient: number;
  expired: number;
  expiringIn30Days: number;
}

/**
 * 1. Create a new client DSC token entry
 */
export const createDscService = async (
  tenantId: mongoose.Types.ObjectId,
  userId: mongoose.Types.ObjectId,
  data: CreateDscInput
): Promise<IDSC> => {
  const clientObjId = new mongoose.Types.ObjectId(data.clientId);
  const client = await Client.findOne({ _id: clientObjId, tenantId });
  if (!client) {
    throw new ApiError(404, 'Client not found in this organization', 'CLIENT_NOT_FOUND');
  }

  const issueDate = new Date(data.issueDate);
  const expiryDate = new Date(data.expiryDate);

  if (isNaN(issueDate.getTime()) || isNaN(expiryDate.getTime())) {
    throw new ApiError(400, 'Invalid issue or expiry date format', 'INVALID_DATE');
  }

  if (expiryDate <= issueDate) {
    throw new ApiError(400, 'Expiry date must be after issue date', 'INVALID_EXPIRY_DATE');
  }

  const now = new Date();
  let status: 'In Office' | 'With Client' | 'Expired' | 'Renewed' = data.status || 'In Office';
  if (expiryDate < now) {
    status = 'Expired';
  }

  const dsc = await DSC.create({
    tenantId,
    clientId: clientObjId,
    certificateName: data.certificateName.trim(),
    certificateClass: data.certificateClass || 'Class 3',
    tokenType: data.tokenType || 'ePass2003',
    tokenSerialNumber: data.tokenSerialNumber ? data.tokenSerialNumber.trim() : undefined,
    issuingAuthority: data.issuingAuthority || 'eMudhra',
    issueDate,
    expiryDate,
    physicalLocation: data.physicalLocation.trim(),
    status,
    currentHolderName: data.currentHolderName ? data.currentHolderName.trim() : undefined,
    notes: data.notes ? data.notes.trim() : undefined,
    createdBy: userId,
    alertMilestonesSent: []
  });

  return dsc;
};

/**
 * 2. Get paginated and filterable list of DSCs
 */
export const getDscListService = async (
  tenantId: mongoose.Types.ObjectId,
  query: GetDscListQuery = {}
): Promise<{ dscs: IDSC[]; total: number; page: number; limit: number; totalPages: number }> => {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.max(1, Math.min(100, Number(query.limit) || 20));
  const skip = (page - 1) * limit;

  const filter: any = { tenantId };

  if (query.clientId) {
    filter.clientId = new mongoose.Types.ObjectId(query.clientId);
  }

  if (query.status) {
    filter.status = query.status;
  }

  if (query.search && query.search.trim()) {
    const searchRegex = new RegExp(query.search.trim(), 'i');
    filter.$or = [
      { certificateName: searchRegex },
      { tokenSerialNumber: searchRegex },
      { physicalLocation: searchRegex },
      { currentHolderName: searchRegex }
    ];
  }

  if (query.expiringWithinDays && query.expiringWithinDays > 0) {
    const now = new Date();
    const maxExpiry = new Date(now.getTime() + query.expiringWithinDays * 24 * 60 * 60 * 1000);
    filter.expiryDate = { $gte: now, $lte: maxExpiry };
    if (!query.status) {
      filter.status = { $in: ['In Office', 'With Client'] };
    }
  }

  const [dscs, total] = await Promise.all([
    DSC.find(filter)
      .populate('clientId', 'name email mobile entityType')
      .populate('createdBy', 'name username email')
      .sort({ expiryDate: 1 })
      .skip(skip)
      .limit(limit),
    DSC.countDocuments(filter)
  ]);

  return {
    dscs,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit) || 1
  };
};

/**
 * 3. Get single DSC detail along with its physical handover history
 */
export const getDscByIdService = async (
  tenantId: mongoose.Types.ObjectId,
  id: string
): Promise<{ dsc: IDSC; history: IDSCHandoverLog[] }> => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(400, 'Invalid DSC identifier', 'INVALID_ID');
  }

  const dsc = await DSC.findOne({ _id: new mongoose.Types.ObjectId(id), tenantId })
    .populate('clientId', 'name email mobile entityType')
    .populate('createdBy', 'name username email');

  if (!dsc) {
    throw new ApiError(404, 'DSC token not found', 'DSC_NOT_FOUND');
  }

  const history = await DSCHandoverLog.find({ tenantId, dscId: dsc._id })
    .populate('handledByUserId', 'name username email')
    .sort({ createdAt: -1 });

  return { dsc, history };
};

/**
 * 4. Update an existing DSC entry
 */
export const updateDscService = async (
  tenantId: mongoose.Types.ObjectId,
  id: string,
  data: UpdateDscInput
): Promise<IDSC> => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(400, 'Invalid DSC identifier', 'INVALID_ID');
  }

  const dsc = await DSC.findOne({ _id: new mongoose.Types.ObjectId(id), tenantId });
  if (!dsc) {
    throw new ApiError(404, 'DSC token not found', 'DSC_NOT_FOUND');
  }

  if (data.certificateName !== undefined) dsc.certificateName = data.certificateName.trim();
  if (data.certificateClass !== undefined) dsc.certificateClass = data.certificateClass;
  if (data.tokenType !== undefined) dsc.tokenType = data.tokenType;
  if (data.tokenSerialNumber !== undefined) dsc.tokenSerialNumber = data.tokenSerialNumber.trim();
  if (data.issuingAuthority !== undefined) dsc.issuingAuthority = data.issuingAuthority;
  if (data.physicalLocation !== undefined) dsc.physicalLocation = data.physicalLocation.trim();
  if (data.currentHolderName !== undefined) dsc.currentHolderName = data.currentHolderName.trim();
  if (data.notes !== undefined) dsc.notes = data.notes.trim();

  if (data.issueDate) {
    const issueDate = new Date(data.issueDate);
    if (isNaN(issueDate.getTime())) throw new ApiError(400, 'Invalid issue date', 'INVALID_DATE');
    dsc.issueDate = issueDate;
  }

  if (data.expiryDate) {
    const expiryDate = new Date(data.expiryDate);
    if (isNaN(expiryDate.getTime())) throw new ApiError(400, 'Invalid expiry date', 'INVALID_DATE');
    if (expiryDate <= dsc.issueDate) {
      throw new ApiError(400, 'Expiry date must be after issue date', 'INVALID_EXPIRY_DATE');
    }
    dsc.expiryDate = expiryDate;

    // If renewed with future date, update status if expired
    if (expiryDate > new Date() && dsc.status === 'Expired') {
      dsc.status = 'In Office';
      dsc.alertMilestonesSent = [];
    }
  }

  if (data.status) {
    dsc.status = data.status;
  }

  await dsc.save();
  return dsc;
};

/**
 * 5. Delete DSC entry
 */
export const deleteDscService = async (
  tenantId: mongoose.Types.ObjectId,
  id: string
): Promise<boolean> => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new ApiError(400, 'Invalid DSC identifier', 'INVALID_ID');
  }

  const dsc = await DSC.findOneAndDelete({ _id: new mongoose.Types.ObjectId(id), tenantId });
  if (!dsc) {
    throw new ApiError(404, 'DSC token not found', 'DSC_NOT_FOUND');
  }

  await DSCHandoverLog.deleteMany({ tenantId, dscId: dsc._id });
  return true;
};

/**
 * 6. Record physical handover / movement of DSC
 */
export const logDscHandoverService = async (
  tenantId: mongoose.Types.ObjectId,
  userId: mongoose.Types.ObjectId,
  dscId: string,
  data: DscHandoverInput
): Promise<{ log: IDSCHandoverLog; dsc: IDSC }> => {
  if (!mongoose.Types.ObjectId.isValid(dscId)) {
    throw new ApiError(400, 'Invalid DSC identifier', 'INVALID_ID');
  }

  const dsc = await DSC.findOne({ _id: new mongoose.Types.ObjectId(dscId), tenantId });
  if (!dsc) {
    throw new ApiError(404, 'DSC token not found', 'DSC_NOT_FOUND');
  }

  const expectedReturnDate = data.expectedReturnDate ? new Date(data.expectedReturnDate) : undefined;
  const receivedBackDate = data.receivedBackDate ? new Date(data.receivedBackDate) : undefined;

  const log = await DSCHandoverLog.create({
    tenantId,
    dscId: dsc._id,
    action: data.action,
    transferredToName: data.transferredToName.trim(),
    transferredToPhone: data.transferredToPhone ? data.transferredToPhone.trim() : undefined,
    reason: data.reason.trim(),
    expectedReturnDate,
    receivedBackDate,
    handledByUserId: userId,
    notes: data.notes ? data.notes.trim() : undefined
  });

  // State transitions based on handover action
  if (data.action === 'Handed to Client') {
    dsc.status = 'With Client';
    dsc.currentHolderName = data.transferredToName.trim();
  } else if (data.action === 'Received from Client') {
    dsc.status = 'In Office';
    dsc.currentHolderName = undefined;
  } else if (data.action === 'Internal Transfer') {
    dsc.currentHolderName = data.transferredToName.trim();
  }

  await dsc.save();
  return { log, dsc };
};

/**
 * 7. Get chronological handover history
 */
export const getDscHistoryService = async (
  tenantId: mongoose.Types.ObjectId,
  dscId: string
): Promise<IDSCHandoverLog[]> => {
  if (!mongoose.Types.ObjectId.isValid(dscId)) {
    throw new ApiError(400, 'Invalid DSC identifier', 'INVALID_ID');
  }

  return DSCHandoverLog.find({
    tenantId,
    dscId: new mongoose.Types.ObjectId(dscId)
  })
    .populate('handledByUserId', 'name username email')
    .sort({ createdAt: -1 });
};

/**
 * Helper to ensure a Service exists to link to DSC renewal tasks
 */
const getOrCreateDscRenewalService = async (tenantId: mongoose.Types.ObjectId): Promise<mongoose.Types.ObjectId> => {
  let service = await Service.findOne({ tenantId, name: /DSC|Digital Signature/i });
  if (!service) {
    service = await Service.findOne({ tenantId, isEnabled: true });
  }
  if (!service) {
      service = await Service.create({
        tenantId,
        name: 'DSC Renewal Service',
        isEnabled: true,
        isRecurring: false,
        sacCode: '998313',
        gstPercentage: 18,
        defaultBillingRate: 2500,
        isBillable: true,
        assignedUsers: [],
        checklist: []
      });
  }
  return service._id as mongoose.Types.ObjectId;
};

/**
 * 8. Automated DSC Expiry Scanner (Phases 74 & 75)
 * Scans active DSCs, transitions expired, detects 30/15/7 day windows,
 * spawns renewal tasks, and dispatches email alerts.
 */
export const scanDscExpiriesService = async (
  tenantId?: mongoose.Types.ObjectId,
  referenceDate: Date = new Date()
): Promise<DscExpiryScanSummary> => {
  const query: any = {};
  if (tenantId) {
    query.tenantId = tenantId;
  }

  // Scan DSCs that are not already marked 'Renewed'
  query.status = { $in: ['In Office', 'With Client', 'Expired'] };

  const dscs = await DSC.find(query).populate('clientId', 'name email mobile');

  const summary: DscExpiryScanSummary = {
    scannedCount: dscs.length,
    expiredCount: 0,
    milestonesTriggered: {
      thirtyDays: 0,
      fifteenDays: 0,
      sevenDays: 0
    },
    tasksCreated: 0,
    emailsDispatched: 0,
    processedDscIds: []
  };

  const refTime = referenceDate.getTime();

  for (const dsc of dscs) {
    const expiryTime = new Date(dsc.expiryDate).getTime();
    const diffDays = Math.ceil((expiryTime - refTime) / (1000 * 60 * 60 * 24));

    // Case 1: Already expired
    if (diffDays <= 0) {
      if (dsc.status !== 'Expired') {
        dsc.status = 'Expired';
        await dsc.save();
        summary.expiredCount++;
      }
      continue;
    }

    // Case 2: Expiring in the future -> determine milestone
    let milestoneToTrigger: '30_day' | '15_day' | '7_day' | null = null;
    let taskPriority: 'Low' | 'Medium' | 'High' | 'Urgent' = 'Medium';

    if (diffDays <= 7) {
      milestoneToTrigger = '7_day';
      taskPriority = 'Urgent';
    } else if (diffDays <= 15) {
      milestoneToTrigger = '15_day';
      taskPriority = 'High';
    } else if (diffDays <= 30) {
      milestoneToTrigger = '30_day';
      taskPriority = 'Medium';
    }

    if (milestoneToTrigger && !dsc.alertMilestonesSent.includes(milestoneToTrigger)) {
      dsc.alertMilestonesSent.push(milestoneToTrigger);

      if (milestoneToTrigger === '30_day') summary.milestonesTriggered.thirtyDays++;
      if (milestoneToTrigger === '15_day') summary.milestonesTriggered.fifteenDays++;
      if (milestoneToTrigger === '7_day') summary.milestonesTriggered.sevenDays++;

      const client = dsc.clientId as any;
      const clientName = client?.name || 'Client';

      // Phase 75: Auto-spawn Task for renewal with idempotency check
      const serviceId = await getOrCreateDscRenewalService(dsc.tenantId);
      const taskTitle = `Renew DSC: ${dsc.certificateName} (${clientName})`;

      const existingTask = await Task.findOne({
        tenantId: dsc.tenantId,
        clientId: dsc.clientId,
        description: new RegExp(`DSC token #${dsc.tokenSerialNumber || dsc.certificateName}`, 'i'),
        status: { $ne: 'Cancelled' }
      });

      if (!existingTask) {
        await Task.create({
          tenantId: dsc.tenantId,
          clientId: dsc.clientId,
          serviceId,
          description: `Renew DSC token #${dsc.tokenSerialNumber || 'N/A'} (${dsc.certificateName}) for client ${clientName}. Certificate expires in ${diffDays} day(s) on ${dsc.expiryDate.toISOString().split('T')[0]}. Physical Location: ${dsc.physicalLocation}.`,
          status: 'Pending',
          priority: taskPriority,
          dueDate: dsc.expiryDate,
          creationType: 'automated',
          checklist: [
            { stepName: 'Contact Client for Renewal Documents & Authorization', isCompleted: false },
            { stepName: 'Verify Mobile & Video Verification on Certifying Portal', isCompleted: false },
            { stepName: 'Download New Certificate into USB Hardware Token', isCompleted: false },
            { stepName: 'Update Storage Location and Register Entry in Proactive', isCompleted: false }
          ],
          tags: ['Compliance', 'DSC Renewal', 'Phase 3'],
          billingAmount: 2500,
          isBillable: true,
          isBilled: false,
          timeLogged: 0
        });
        summary.tasksCreated++;
      }

      // Phase 75: Dispatch email notification if client has email
      if (client?.email) {
        await sendDscExpiryEmail(
          client.email,
          clientName,
          dsc.certificateName,
          dsc.expiryDate.toISOString().split('T')[0],
          diffDays
        );
        summary.emailsDispatched++;
      }

      await dsc.save();
      summary.processedDscIds.push(dsc._id.toString());
    }
  }

  return summary;
};

/**
 * 9. Get DSC summary KPIs for dashboard
 */
export const getDscSummaryKpiService = async (
  tenantId: mongoose.Types.ObjectId
): Promise<DscKpiSummary> => {
  const now = new Date();
  const thirtyDaysLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const [total, inOffice, withClient, expired, expiringIn30Days] = await Promise.all([
    DSC.countDocuments({ tenantId }),
    DSC.countDocuments({ tenantId, status: 'In Office' }),
    DSC.countDocuments({ tenantId, status: 'With Client' }),
    DSC.countDocuments({ tenantId, status: 'Expired' }),
    DSC.countDocuments({
      tenantId,
      status: { $in: ['In Office', 'With Client'] },
      expiryDate: { $gte: now, $lte: thirtyDaysLater }
    })
  ]);

  return {
    total,
    inOffice,
    withClient,
    expired,
    expiringIn30Days
  };
};

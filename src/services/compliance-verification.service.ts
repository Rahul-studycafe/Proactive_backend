import mongoose from 'mongoose';
import {
  ComplianceLog,
  IComplianceLog,
  ComplianceQueryType,
  ComplianceStatus
} from '../models/ComplianceLog';
import { Client } from '../modules/clients/schemas/client.schema';
import { ApiError } from '../common/errors/api-error';

export interface IPANVerificationResult {
  pan: string;
  valid: boolean;
  nameOnPan: string;
  category: 'Individual' | 'Company' | 'Partnership / LLP' | 'HUF' | 'Trust' | 'AOP' | 'Other';
  status: 'Active' | 'Inactive' | 'NotFound';
  verifiedAt: Date;
  fromCache?: boolean;
}

export interface IGSTINVerificationResult {
  gstin: string;
  valid: boolean;
  legalName: string;
  tradeName: string;
  pan: string;
  constitutionOfBusiness: string;
  taxpayerType: 'Regular' | 'Composition';
  status: 'Active' | 'Cancelled' | 'Suspended';
  registrationDate?: string;
  principalAddress: {
    address: string;
    city: string;
    state: string;
    pincode: string;
  };
  verifiedAt: Date;
  fromCache?: boolean;
}

export interface ClientAutoFillData {
  name: string;
  contactPersonName?: string;
  pan: string;
  gstin: string;
  entityType: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  taxpayerType: string;
}

// Map 2-digit Indian GST State Codes
export const GST_STATE_CODES: Record<string, string> = {
  '01': 'Jammu and Kashmir',
  '02': 'Himachal Pradesh',
  '03': 'Punjab',
  '04': 'Chandigarh',
  '05': 'Uttarakhand',
  '06': 'Haryana',
  '07': 'Delhi',
  '08': 'Rajasthan',
  '09': 'Uttar Pradesh',
  '10': 'Bihar',
  '11': 'Sikkim',
  '12': 'Arunachal Pradesh',
  '13': 'Nagaland',
  '14': 'Manipur',
  '15': 'Mizoram',
  '16': 'Tripura',
  '17': 'Meghalaya',
  '18': 'Assam',
  '19': 'West Bengal',
  '20': 'Jharkhand',
  '21': 'Odisha',
  '22': 'Chhattisgarh',
  '23': 'Madhya Pradesh',
  '24': 'Gujarat',
  '26': 'Dadra and Nagar Haveli and Daman and Diu',
  '27': 'Maharashtra',
  '29': 'Karnataka',
  '30': 'Goa',
  '31': 'Lakshadweep',
  '32': 'Kerala',
  '33': 'Tamil Nadu',
  '34': 'Puducherry',
  '35': 'Andaman and Nicobar Islands',
  '36': 'Telangana',
  '37': 'Andhra Pradesh',
  '38': 'Ladakh',
  '97': 'Other Territory'
};

/**
 * Validates 10-digit Indian PAN format and derives legal entity category
 */
export const validatePanSyntax = (pan: string) => {
  const cleanPan = pan.trim().toUpperCase();
  const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;

  if (!panRegex.test(cleanPan)) {
    return {
      valid: false,
      pan: cleanPan,
      category: 'Other' as const,
      error: 'Invalid PAN syntax. Must be 5 letters, 4 digits, followed by 1 letter (e.g. ABCDE1234F)'
    };
  }

  // 4th character entity classification
  const fourthChar = cleanPan.charAt(3);
  let category: IPANVerificationResult['category'] = 'Other';
  switch (fourthChar) {
    case 'P':
      category = 'Individual';
      break;
    case 'C':
      category = 'Company';
      break;
    case 'F':
      category = 'Partnership / LLP';
      break;
    case 'H':
      category = 'HUF';
      break;
    case 'T':
      category = 'Trust';
      break;
    case 'A':
      category = 'AOP';
      break;
    default:
      category = 'Other';
  }

  return {
    valid: true,
    pan: cleanPan,
    category
  };
};

/**
 * Validates 15-character Indian GSTIN format, state code, and embedded PAN
 */
export const validateGstinSyntax = (gstin: string) => {
  const cleanGstin = gstin.trim().toUpperCase();
  const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

  if (!gstinRegex.test(cleanGstin)) {
    return {
      valid: false,
      gstin: cleanGstin,
      error: 'Invalid GSTIN syntax. Must be 15 characters (e.g. 27ABCDE1234F1Z5)'
    };
  }

  const stateCode = cleanGstin.substring(0, 2);
  const stateName = GST_STATE_CODES[stateCode];
  if (!stateName) {
    return {
      valid: false,
      gstin: cleanGstin,
      error: `Invalid state code prefix "${stateCode}" in GSTIN`
    };
  }

  const embeddedPan = cleanGstin.substring(2, 12);
  const panCheck = validatePanSyntax(embeddedPan);
  if (!panCheck.valid) {
    return {
      valid: false,
      gstin: cleanGstin,
      error: `Invalid embedded PAN "${embeddedPan}" in GSTIN`
    };
  }

  return {
    valid: true,
    gstin: cleanGstin,
    stateCode,
    stateName,
    embeddedPan,
    category: panCheck.category
  };
};

/**
 * Mock Tax Compliance Adapter providing deterministic registry records for tests and sandbox
 */
export class MockTaxComplianceAdapter {
  static async verifyPan(pan: string): Promise<IPANVerificationResult> {
    const syntax = validatePanSyntax(pan);
    if (!syntax.valid) {
      throw new ApiError(400, syntax.error || 'Invalid PAN format', 'INVALID_PAN_FORMAT');
    }

    // Simulate Not Found for test pan ending with '0000X'
    if (syntax.pan.endsWith('0000X') || syntax.pan.startsWith('ZZZZZ')) {
      return {
        pan: syntax.pan,
        valid: false,
        nameOnPan: '',
        category: syntax.category,
        status: 'NotFound',
        verifiedAt: new Date()
      };
    }

    // Simulate Inactive for test pan ending with '9999I'
    if (syntax.pan.endsWith('9999I')) {
      return {
        pan: syntax.pan,
        valid: true,
        nameOnPan: 'Inactive Taxpayer Entity',
        category: syntax.category,
        status: 'Inactive',
        verifiedAt: new Date()
      };
    }

    let nameOnPan = '';
    const surnameChar = syntax.pan.charAt(4);
    switch (syntax.category) {
      case 'Company':
        nameOnPan = `${surnameChar}pex Enterprise Solutions Private Limited`;
        break;
      case 'Partnership / LLP':
        nameOnPan = `${surnameChar}pex & Associates LLP`;
        break;
      case 'Trust':
        nameOnPan = `${surnameChar}hree Educational & Charitable Trust`;
        break;
      case 'HUF':
        nameOnPan = `Rajesh ${surnameChar}. Sharma HUF`;
        break;
      default:
        nameOnPan = `Rajesh ${surnameChar}. Sharma`;
    }

    return {
      pan: syntax.pan,
      valid: true,
      nameOnPan,
      category: syntax.category,
      status: 'Active',
      verifiedAt: new Date()
    };
  }

  static async verifyGstin(gstin: string): Promise<IGSTINVerificationResult> {
    const syntax = validateGstinSyntax(gstin);
    if (!syntax.valid) {
      throw new ApiError(400, syntax.error || 'Invalid GSTIN format', 'INVALID_GSTIN_FORMAT');
    }

    const { cleanGstin, stateName, embeddedPan, category } = {
      cleanGstin: syntax.gstin!,
      stateName: syntax.stateName!,
      embeddedPan: syntax.embeddedPan!,
      category: syntax.category!
    };

    // Simulate Cancelled for test GSTIN ending with '9'
    const isCancelled = cleanGstin.endsWith('9');
    const status: IGSTINVerificationResult['status'] = isCancelled
      ? 'Cancelled'
      : 'Active';

    let legalName = '';
    let tradeName = '';
    let constitution = '';

    if (category === 'Company') {
      legalName = 'Acme Solutions Private Limited';
      tradeName = 'Acme Cloud Tech';
      constitution = 'Private Limited Company';
    } else if (category === 'Partnership / LLP') {
      legalName = 'Apex Global Logistics LLP';
      tradeName = 'Apex Express Freight';
      constitution = 'Limited Liability Partnership';
    } else {
      legalName = 'Rajesh Kumar Sharma';
      tradeName = 'Sharma Trading Corporation';
      constitution = 'Proprietorship';
    }

    return {
      gstin: cleanGstin,
      valid: true,
      legalName,
      tradeName,
      pan: embeddedPan,
      constitutionOfBusiness: constitution,
      taxpayerType: 'Regular',
      status,
      registrationDate: '2017-07-01',
      principalAddress: {
        address: '402, Trade Tower, Bandra Kurla Complex',
        city: 'Mumbai',
        state: stateName,
        pincode: '400051'
      },
      verifiedAt: new Date()
    };
  }
}

/**
 * Verifies PAN with 30-day tenant cache and client badge persistence
 */
export const verifyPanService = async (
  tenantId: mongoose.Types.ObjectId,
  pan: string,
  requestedByUserId: mongoose.Types.ObjectId,
  clientId?: string
): Promise<IPANVerificationResult> => {
  const cleanPan = pan.trim().toUpperCase();
  const syntax = validatePanSyntax(cleanPan);
  if (!syntax.valid) {
    throw new ApiError(400, syntax.error || 'Invalid PAN format', 'INVALID_PAN_FORMAT');
  }

  // 1. Check 30-day cache in ComplianceLog
  const cached = await ComplianceLog.findOne({
    tenantId,
    queryType: 'PAN',
    queryValue: cleanPan,
    cachedUntil: { $gt: new Date() }
  }).sort({ createdAt: -1 });

  let result: IPANVerificationResult;

  if (cached) {
    result = {
      ...(cached.rawResponse as IPANVerificationResult),
      fromCache: true
    };
  } else {
    // 2. Query Adapter
    result = await MockTaxComplianceAdapter.verifyPan(cleanPan);

    // 3. Persist in ComplianceLog cache
    await ComplianceLog.create({
      tenantId,
      queryType: 'PAN',
      queryValue: cleanPan,
      rawResponse: result,
      verifiedStatus: result.status,
      requestedBy: requestedByUserId,
      cachedUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    });
  }

  // 4. Update Client badge if matching client exists or clientId passed
  const clientFilter: any = { tenantId };
  if (clientId && mongoose.Types.ObjectId.isValid(clientId)) {
    clientFilter._id = new mongoose.Types.ObjectId(clientId);
  } else {
    clientFilter.pan = cleanPan;
  }

  if (result.status === 'Active') {
    await Client.updateOne(clientFilter, {
      $set: {
        panVerified: true,
        verifiedAt: new Date()
      }
    });
  }

  return result;
};

/**
 * Verifies GSTIN with 30-day tenant cache and client badge persistence
 */
export const verifyGstinService = async (
  tenantId: mongoose.Types.ObjectId,
  gstin: string,
  requestedByUserId: mongoose.Types.ObjectId,
  clientId?: string
): Promise<IGSTINVerificationResult> => {
  const cleanGstin = gstin.trim().toUpperCase();
  const syntax = validateGstinSyntax(cleanGstin);
  if (!syntax.valid) {
    throw new ApiError(400, syntax.error || 'Invalid GSTIN format', 'INVALID_GSTIN_FORMAT');
  }

  // 1. Check 30-day cache in ComplianceLog
  const cached = await ComplianceLog.findOne({
    tenantId,
    queryType: 'GSTIN',
    queryValue: cleanGstin,
    cachedUntil: { $gt: new Date() }
  }).sort({ createdAt: -1 });

  let result: IGSTINVerificationResult;

  if (cached) {
    result = {
      ...(cached.rawResponse as IGSTINVerificationResult),
      fromCache: true
    };
  } else {
    // 2. Query Adapter
    result = await MockTaxComplianceAdapter.verifyGstin(cleanGstin);

    // 3. Persist in ComplianceLog cache
    await ComplianceLog.create({
      tenantId,
      queryType: 'GSTIN',
      queryValue: cleanGstin,
      rawResponse: result,
      verifiedStatus: result.status,
      requestedBy: requestedByUserId,
      cachedUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    });
  }

  // 4. Update Client badge if matching client exists or clientId passed
  const clientFilter: any = { tenantId };
  if (clientId && mongoose.Types.ObjectId.isValid(clientId)) {
    clientFilter._id = new mongoose.Types.ObjectId(clientId);
  } else {
    clientFilter.gstin = cleanGstin;
  }

  if (result.status === 'Active') {
    await Client.updateOne(clientFilter, {
      $set: {
        gstinVerified: true,
        panVerified: true,
        verifiedAt: new Date()
      }
    });
  }

  return result;
};

/**
 * Auto-fills client profile payload from verified GSTIN data
 */
export const autoFillClientFromGstinService = async (
  tenantId: mongoose.Types.ObjectId,
  gstin: string,
  requestedByUserId: mongoose.Types.ObjectId
): Promise<ClientAutoFillData> => {
  const verified = await verifyGstinService(
    tenantId,
    gstin,
    requestedByUserId
  );

  if (verified.status !== 'Active') {
    throw new ApiError(
      400,
      `Cannot auto-fill from inactive or cancelled GSTIN (status: ${verified.status})`,
      'GSTIN_INACTIVE'
    );
  }

  // Map constitution of business to Client entityType enum
  let entityType = 'Private Limited';
  const c = verified.constitutionOfBusiness.toLowerCase();
  if (c.includes('proprietor')) {
    entityType = 'Sole Proprietorship';
  } else if (c.includes('limited liability') || c.includes('llp')) {
    entityType = 'LLP';
  } else if (c.includes('partner')) {
    entityType = 'Partnership Firm';
  } else if (c.includes('trust')) {
    entityType = 'Trust';
  } else if (c.includes('ngo')) {
    entityType = 'NGO';
  } else if (c.includes('public')) {
    entityType = 'Public Limited';
  }

  return {
    name: verified.legalName,
    contactPersonName:
      verified.tradeName && verified.tradeName !== verified.legalName
        ? verified.legalName
        : undefined,
    pan: verified.pan,
    gstin: verified.gstin,
    entityType,
    address: verified.principalAddress.address,
    city: verified.principalAddress.city,
    state: verified.principalAddress.state,
    pincode: verified.principalAddress.pincode,
    taxpayerType: verified.taxpayerType
  };
};

/**
 * Returns compliance audit logs for the tenant
 */
export const getComplianceLogsService = async (
  tenantId: mongoose.Types.ObjectId,
  query: {
    page?: number | string;
    limit?: number | string;
    queryType?: ComplianceQueryType;
    search?: string;
  }
) => {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
  const skip = (page - 1) * limit;

  const filter: any = { tenantId };

  if (query.queryType) {
    filter.queryType = query.queryType;
  }

  if (query.search && query.search.trim()) {
    filter.queryValue = new RegExp(query.search.trim(), 'i');
  }

  const [logs, total] = await Promise.all([
    ComplianceLog.find(filter)
      .populate('requestedBy', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    ComplianceLog.countDocuments(filter)
  ]);

  return {
    data: logs,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1
    }
  };
};

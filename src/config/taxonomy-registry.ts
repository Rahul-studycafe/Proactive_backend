export interface CategoryDefinition {
  key: string;
  name: string;
  description: string;
  supportsColor?: boolean;
  supportsMetadata?: boolean;
  defaults: Array<{
    label: string;
    value: string;
    color?: string;
    metadata?: Record<string, any>;
  }>;
}

export const TAXONOMY_REGISTRY: Record<string, CategoryDefinition> = {
  document_types: {
    key: 'document_types',
    name: 'Document Types',
    description: 'Physical and digital document types handled by the firm',
    defaults: [
      { label: 'Original Deeds', value: 'Original Deeds' },
      { label: 'Passbook', value: 'Passbook' },
      { label: 'Cheque Book', value: 'Cheque Book' },
      { label: 'PAN Card', value: 'PAN Card' },
      { label: 'Registration Certificate', value: 'Registration Certificate' },
      { label: 'Company Seal', value: 'Company Seal' },
      { label: 'Other', value: 'Other' },
    ],
  },
  office_storage_locations: {
    key: 'office_storage_locations',
    name: 'Office Storage Locations',
    description: 'Physical safes, binders, cabinets, and rooms where documents & tokens are stored',
    defaults: [
      { label: 'Safe Box 1', value: 'Safe Box 1' },
      { label: 'Safe Box 2', value: 'Safe Box 2' },
      { label: 'Cabinet A, Shelf 3', value: 'Cabinet A, Shelf 3' },
      { label: 'Cabinet B', value: 'Cabinet B' },
      { label: 'Red Binder', value: 'Red Binder' },
      { label: 'Locker 1', value: 'Locker 1' },
      { label: 'Drawer 4', value: 'Drawer 4' },
      { label: 'Archive Room', value: 'Archive Room' },
    ],
  },
  usb_token_types: {
    key: 'usb_token_types',
    name: 'USB Token Hardware Types',
    description: 'Cryptographic USB token hardware dongles supported by the firm',
    defaults: [
      { label: 'ePass2003 Auto', value: 'ePass2003 Auto' },
      { label: 'ProxKey Watchdata', value: 'ProxKey Watchdata' },
      { label: 'mToken CryptoID', value: 'mToken CryptoID' },
      { label: 'Watchdata', value: 'Watchdata' },
      { label: 'Other Hardware Dongle', value: 'Other Hardware Dongle' },
    ],
  },
  issuing_authorities: {
    key: 'issuing_authorities',
    name: 'Issuing Authorities (CA)',
    description: 'Certifying authorities issuing digital signature certificates',
    defaults: [
      { label: 'eMudhra Consumer Services', value: 'eMudhra Consumer Services' },
      { label: 'Capricorn Identity Services', value: 'Capricorn Identity Services' },
      { label: 'Vsign (Verasys CA)', value: 'Vsign (Verasys CA)' },
      { label: 'Sify SafeScrypt', value: 'Sify SafeScrypt' },
      { label: 'IDSign CA', value: 'IDSign CA' },
      { label: 'Other Certifying Authority', value: 'Other Certifying Authority' },
    ],
  },
  certificate_classes: {
    key: 'certificate_classes',
    name: 'Certificate Classes',
    description: 'Digital signature certificate legal classes and types',
    defaults: [
      { label: 'Class 3 (MCA/GST Standard)', value: 'Class 3 (MCA/GST Standard)' },
      { label: 'Class 2 (Legacy)', value: 'Class 2 (Legacy)' },
      { label: 'Document Signer Certificate', value: 'Document Signer Certificate' },
    ],
  },
  portals_and_authorities: {
    key: 'portals_and_authorities',
    name: 'Portals & Authorities',
    description: 'Statutory government filing websites, judicial portals, and regulatory gateways',
    supportsMetadata: true,
    defaults: [
      { label: 'GST Portal', value: 'GST Portal', metadata: { portalUrl: 'https://services.gst.gov.in/services/login', category: 'Taxation' } },
      { label: 'Income Tax e-Filing Portal', value: 'Income Tax e-Filing Portal', metadata: { portalUrl: 'https://eportal.incometax.gov.in', category: 'Taxation' } },
      { label: 'MCA (Ministry of Corporate Affairs) / V3', value: 'MCA (Ministry of Corporate Affairs) / V3', metadata: { portalUrl: 'https://www.mca.gov.in', category: 'Corporate Affairs' } },
      { label: 'TRACES (TDS CPC)', value: 'TRACES (TDS CPC)', metadata: { portalUrl: 'https://www.tdscpc.gov.in', category: 'Taxation' } },
      { label: 'ICEGATE (Indian Customs EDI Gateway)', value: 'ICEGATE', metadata: { portalUrl: 'https://www.icegate.gov.in', category: 'Customs' } },
      { label: 'EPFO Unified Portal', value: 'EPFO Unified Portal', metadata: { portalUrl: 'https://unifiedportal-emp.epfindia.gov.in', category: 'Labor Compliance' } },
      { label: 'ESIC Portal', value: 'ESIC Portal', metadata: { portalUrl: 'https://www.esic.in', category: 'Labor Compliance' } },
      { label: 'State Commercial Tax / VAT / PT', value: 'State Commercial Tax / VAT / PT', metadata: { category: 'State Taxes' } },
    ],
  },
  payment_modes: {
    key: 'payment_modes',
    name: 'Payment Modes',
    description: 'Supported modes of settlement for receipts, invoices, and expenses',
    defaults: [
      { label: 'Bank Transfer (NEFT / RTGS / IMPS)', value: 'Bank Transfer' },
      { label: 'UPI / QR Code', value: 'UPI' },
      { label: 'Cheque', value: 'Cheque' },
      { label: 'Cash', value: 'Cash' },
      { label: 'Credit Card', value: 'Credit Card' },
      { label: 'Debit Card', value: 'Debit Card' },
      { label: 'Other', value: 'Other' },
    ],
  },
  tags: {
    key: 'tags',
    name: 'Tags',
    description: 'Organization-wide taxonomy badges for clients, tasks, and records',
    supportsColor: true,
    defaults: [
      { label: 'VIP', value: 'VIP', color: '#8B5CF6' },
      { label: 'High Priority', value: 'High Priority', color: '#EF4444' },
      { label: 'Monthly Filing', value: 'Monthly Filing', color: '#3B82F6' },
      { label: 'Audit Required', value: 'Audit Required', color: '#F59E0B' },
      { label: 'Corporate', value: 'Corporate', color: '#10B981' },
      { label: 'Individual', value: 'Individual', color: '#6366F1' },
    ],
  },
  client_entity_types: {
    key: 'client_entity_types',
    name: 'Client Entity Types',
    description: 'Legal forms of business organization for client profiles',
    defaults: [
      { label: 'Individual', value: 'Individual' },
      { label: 'Sole Proprietorship', value: 'Sole Proprietorship' },
      { label: 'Partnership Firm', value: 'Partnership Firm' },
      { label: 'Private Limited', value: 'Private Limited' },
      { label: 'One Person Company', value: 'One Person Company' },
      { label: 'LLP', value: 'LLP' },
      { label: 'Trust', value: 'Trust' },
      { label: 'NGO', value: 'NGO' },
      { label: 'HUF', value: 'HUF' },
      { label: 'Public Limited', value: 'Public Limited' },
      { label: 'Other', value: 'Other' },
    ],
  },
  client_groups: {
    key: 'client_groups',
    name: 'Client Groups',
    description: 'Management and family group classifications for consolidating related client accounts',
    supportsColor: true,
    defaults: [
      { label: 'Sharma Family', value: 'Sharma Family', color: '#3B82F6' },
      { label: 'Patil Consultancy', value: 'Patil Consultancy', color: '#10B981' },
      { label: 'Mehta Group', value: 'Mehta Group', color: '#8B5CF6' },
      { label: 'Joshi Holdings', value: 'Joshi Holdings', color: '#F59E0B' },
    ],
  },
  credit_note_reasons: {
    key: 'credit_note_reasons',
    name: 'Credit Note Reasons',
    description: 'Statutory and commercial reasons for issuing credit adjustment notes',
    defaults: [
      { label: 'Overcharge Correction', value: 'Overcharge Correction' },
      { label: 'Service Cancellation', value: 'Service Cancellation' },
      { label: 'Goodwill Discount', value: 'Goodwill Discount' },
      { label: 'Deficiency of Service', value: 'Deficiency of Service' },
      { label: 'Other Statutory Reason', value: 'Other Statutory Reason' },
    ],
  },
  storage_unit_types: {
    key: 'storage_unit_types',
    name: 'Storage Unit Types',
    description: 'Physical classifications for warehouse, archive, and office storage equipment',
    defaults: [
      { label: 'Cabinet', value: 'Cabinet' },
      { label: 'Shelf', value: 'Shelf' },
      { label: 'Safe Box', value: 'Safe Box' },
      { label: 'Locker', value: 'Locker' },
      { label: 'Drawer', value: 'Drawer' },
      { label: 'Archive Room', value: 'Archive Room' },
      { label: 'Other', value: 'Other' },
    ],
  },
};


import { Request, Response } from 'express';
import { TenantWebsiteSettings } from '../models/TenantWebsiteSettings';
import { sendSuccess } from '../utils/ApiResponse';
import { asyncHandler } from '../utils/async-handler';
import { ApiError } from '../utils/ApiError';
import { Organization } from '../modules/auth/schemas';

export const getPublicWebsiteConfig = asyncHandler(async (req: Request, res: Response) => {
  const subdomain = req.query.subdomain as string;
  const host = req.headers.host || '';

  let query: any = {};
  if (subdomain) {
    query = { subdomain: subdomain.toLowerCase() };
  } else if (host && !host.includes('localhost') && !host.includes('127.0.0.1')) {
    const parts = host.split('.');
    if (parts.length > 2) {
      query = { subdomain: parts[0].toLowerCase() };
    } else {
      query = { customDomain: host.toLowerCase() };
    }
  }

  let settings = Object.keys(query).length > 0 ? await TenantWebsiteSettings.findOne(query) : null;
  if (!settings) {
    settings = await TenantWebsiteSettings.findOne({ isPublished: true });
  }

  if (!settings) {
    // Default fallback branding
    return sendSuccess(res, 200, 'Website config resolved', {
      branding: {
        firmName: 'Proactive Advisory & CA Practice',
        logoUrl: '',
        faviconUrl: '',
        brandColor: '#2563eb'
      },
      hero: {
        title: 'Client Self-Service Portal',
        subtitle: 'Access statutory filing status, download acknowledged tax returns, and track invoices securely.',
        bannerImageUrl: ''
      },
      contact: {
        email: 'support@proactive.local',
        phone: '+91 98765 43210',
        address: 'Practice Office, Tech City'
      },
      services: [
        { title: 'GST Filings & Advisory', description: 'Monthly GSTR-3B & GSTR-1 compliances' },
        { title: 'Income Tax & TDS', description: 'Annual returns and quarterly TDS statements' },
        { title: 'Audit & Assurance', description: 'Statutory and internal company audits' }
      ]
    });
  }

  return sendSuccess(res, 200, 'Website config resolved', {
    branding: settings.branding,
    hero: settings.hero,
    contact: settings.contact,
    services: settings.services.filter(s => s.isActive)
  });
});

export const getTenantWebsiteSettings = asyncHandler(async (req: Request, res: Response) => {
  if (!req.tenantId) {
    throw new ApiError(401, 'Unauthorized');
  }

  let settings = await TenantWebsiteSettings.findOne({ tenantId: req.tenantId });
  if (!settings) {
    const org = await Organization.findById(req.tenantId);
    settings = await TenantWebsiteSettings.create({
      tenantId: req.tenantId,
      subdomain: org?.name?.toLowerCase().replace(/[^a-z0-9]/g, '-') || 'firm',
      branding: {
        firmName: org?.name || 'Proactive Advisory',
        brandColor: '#2563eb'
      },
      contact: {
        email: org?.email || '',
        phone: org?.phone || '',
        address: ''
      }
    });
  }

  return sendSuccess(res, 200, 'Website settings retrieved', settings);
});

export const updateTenantWebsiteSettings = asyncHandler(async (req: Request, res: Response) => {
  if (!req.tenantId) {
    throw new ApiError(401, 'Unauthorized');
  }

  const { subdomain, customDomain, branding, hero, contact, services, isPublished } = req.body;

  // Check subdomain conflict if changed
  if (subdomain) {
    const conflict = await TenantWebsiteSettings.findOne({
      subdomain: subdomain.toLowerCase(),
      tenantId: { $ne: req.tenantId }
    });
    if (conflict) {
      throw new ApiError(409, 'Subdomain is already taken by another firm');
    }
  }

  const updated = await TenantWebsiteSettings.findOneAndUpdate(
    { tenantId: req.tenantId },
    {
      $set: {
        ...(subdomain ? { subdomain: subdomain.toLowerCase() } : {}),
        ...(customDomain !== undefined ? { customDomain: customDomain.toLowerCase() } : {}),
        ...(branding ? { branding } : {}),
        ...(hero ? { hero } : {}),
        ...(contact ? { contact } : {}),
        ...(services ? { services } : {}),
        ...(isPublished !== undefined ? { isPublished } : {})
      }
    },
    { new: true, upsert: true }
  );

  return sendSuccess(res, 200, 'Website settings updated successfully', updated);
});


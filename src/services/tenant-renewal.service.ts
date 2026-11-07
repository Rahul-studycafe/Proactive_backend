import mongoose from 'mongoose';
import { TenantSubscription } from '../models/TenantSubscription';
import { User } from '../modules/auth/schemas';
import { Organization } from '../modules/auth/schemas/organization.schema';
import { Client } from '../modules/clients/schemas/client.schema';
import { DocumentModel } from '../models/Document';

export interface TenantUsageSummary {
  planTier: string;
  status: string;
  subscriptionDuration?: string;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  daysUntilRenewal: number;
  users: {
    used: number;
    max: number;
    percentage: number;
  };
  clients: {
    used: number;
    max: number;
    percentage: number;
  };
  storage: {
    usedGb: number;
    maxGb: number;
    percentage: number;
  };
  featuresEnabled: Record<string, boolean>;
}

export interface ExpiringTenantAlert {
  tenantId: mongoose.Types.ObjectId;
  planTier: string;
  expiresAt: Date;
  daysRemaining: number;
  urgency: 'Critical' | 'Warning' | 'Notice' | 'Expired';
}

export class TenantRenewalService {
  /**
   * Phase 145: Aggregates real-time tenant resource consumption vs plan limits.
   */
  static async getTenantUsage(tenantId: mongoose.Types.ObjectId): Promise<TenantUsageSummary> {
    const org = await Organization.findById(tenantId);
    let sub: any = await TenantSubscription.findOne({ tenantId });

    const maxUsersFromOrg = org?.plan?.maxUsers || 5;
    const renewalDateFromOrg = org?.renewalDate || new Date(Date.now() + 30 * 86400 * 1000);
    const orgStatus = org?.subscriptionStatus || 'active';
    const statusFormatted = orgStatus.charAt(0).toUpperCase() + orgStatus.slice(1);
    const tierName = maxUsersFromOrg <= 5 ? 'Starter' : maxUsersFromOrg <= 15 ? 'Professional' : 'Enterprise';

    if (!sub) {
      // Default to organization plan baseline if explicit TenantSubscription not yet created
      sub = {
        planTier: tierName,
        status: statusFormatted,
        maxUsers: maxUsersFromOrg,
        maxClients: Math.max(100, maxUsersFromOrg * 25),
        storageLimitGb: maxUsersFromOrg <= 5 ? 10 : maxUsersFromOrg <= 15 ? 25 : 100,
        currentPeriodStart: org?.createdAt || new Date(),
        currentPeriodEnd: renewalDateFromOrg,
        featuresEnabled: {
          clientPortal: true,
          timeTracking: true,
          multiBranch: true,
          customDomain: maxUsersFromOrg > 15,
          bulkWhatsApp: maxUsersFromOrg > 5
        }
      } as any;
    } else {
      // Ensure maxUsers, renewal date, and status reflect organization plan
      if (org?.plan?.maxUsers && (!sub.maxUsers || sub.maxUsers < org.plan.maxUsers)) {
        sub.maxUsers = org.plan.maxUsers;
      }
      if (org?.renewalDate) {
        sub.currentPeriodEnd = org.renewalDate;
      }
      if (org?.subscriptionStatus) {
        sub.status = statusFormatted;
      }
    }

    const [activeUsers, totalClients, totalDocs] = await Promise.all([
      User.countDocuments({ tenantId, isActive: true }),
      Client.countDocuments({ tenantId }),
      DocumentModel.countDocuments({ tenantId })
    ]);

    // Estimate 2.5MB per stored document if exact byte sizes are not logged
    const estimatedStorageGb = Math.round(((totalDocs * 2.5) / 1024) * 100) / 100;

    const msDiff = new Date(sub.currentPeriodEnd).getTime() - Date.now();
    const daysUntilRenewal = Math.ceil(msDiff / (1000 * 60 * 60 * 24));

    const userPct = sub.maxUsers > 0 ? Math.min(100, Math.round((activeUsers / sub.maxUsers) * 100)) : 0;
    const clientPct = sub.maxClients > 0 ? Math.min(100, Math.round((totalClients / sub.maxClients) * 100)) : 0;
    const storagePct = sub.storageLimitGb > 0 ? Math.min(100, Math.round((estimatedStorageGb / sub.storageLimitGb) * 100)) : 0;

    return {
      planTier: sub.planTier || tierName,
      status: sub.status || statusFormatted,
      subscriptionDuration: org?.subscriptionDuration || 'monthly',
      currentPeriodStart: sub.currentPeriodStart,
      currentPeriodEnd: sub.currentPeriodEnd,
      daysUntilRenewal,
      users: {
        used: activeUsers,
        max: sub.maxUsers,
        percentage: userPct
      },
      clients: {
        used: totalClients,
        max: sub.maxClients,
        percentage: clientPct
      },
      storage: {
        usedGb: estimatedStorageGb,
        maxGb: sub.storageLimitGb,
        percentage: storagePct
      },
      featuresEnabled: sub.featuresEnabled || {}
    };
  }

  /**
   * Phase 145: Scans all tenant subscriptions approaching renewal or already expired.
   */
  static async scanExpiringTenants(refDate: Date = new Date()): Promise<ExpiringTenantAlert[]> {
    const horizonDate = new Date(refDate.getTime() + 7 * 86400 * 1000);

    const subscriptions = await TenantSubscription.find({
      status: { $in: ['Active', 'Past Due'] },
      currentPeriodEnd: { $lte: horizonDate }
    }).sort({ currentPeriodEnd: 1 });

    const alerts: ExpiringTenantAlert[] = [];

    for (const sub of subscriptions) {
      const msDiff = new Date(sub.currentPeriodEnd).getTime() - refDate.getTime();
      const daysRemaining = Math.ceil(msDiff / (1000 * 60 * 60 * 24));

      let urgency: 'Critical' | 'Warning' | 'Notice' | 'Expired';
      if (daysRemaining <= 0) {
        urgency = 'Expired';
      } else if (daysRemaining <= 1) {
        urgency = 'Critical';
      } else if (daysRemaining <= 3) {
        urgency = 'Warning';
      } else {
        urgency = 'Notice';
      }

      alerts.push({
        tenantId: sub.tenantId,
        planTier: sub.planTier,
        expiresAt: sub.currentPeriodEnd,
        daysRemaining,
        urgency
      });
    }

    return alerts;
  }
}

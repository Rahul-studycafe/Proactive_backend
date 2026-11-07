import mongoose from 'mongoose';
import { Task, ITask } from '../models/Task';
import { Service, IService } from '../modules/services/schemas/service.schema';
import { Package, IPackage } from '../modules/services/schemas/package.schema';
import { Client, IClient } from '../modules/clients/schemas/client.schema';
import { Organization } from '../modules/auth/schemas';
import { AutomationLog, IAutomationLogDetail } from '../models/AutomationLog';
import { triggerAutoDocumentRequestForService } from './document-request.service';
import {
  calculatePeriodString,
  calculateDueDate,
  shouldSpawnToday,
  PeriodOffset
} from './recurrence.service';

export interface TaskGenerationResult {
  status: 'Created' | 'Skipped' | 'Failed';
  reason?: string;
  task?: ITask;
  clientId: mongoose.Types.ObjectId;
  serviceId: mongoose.Types.ObjectId;
  period: string;
}

export interface AutomationExecutionSummary {
  tenantsProcessed: number;
  scannedClients: number;
  tasksCreated: number;
  tasksSkipped: number;
  errors: number;
  details: IAutomationLogDetail[];
  logId?: mongoose.Types.ObjectId;
}

/**
 * Idempotently generates a task for a single client and service in a specific period (Phase 63)
 */
export const generateTaskForClientService = async (
  tenantId: mongoose.Types.ObjectId,
  clientId: mongoose.Types.ObjectId,
  serviceId: mongoose.Types.ObjectId,
  periodStr: string,
  referenceDate: Date = new Date(),
  customAssignees?: mongoose.Types.ObjectId[],
  customBillingAmount?: number
): Promise<TaskGenerationResult> => {
  try {
    // 1. Idempotency Check: strictly guarantee no duplicate task for same (tenantId, clientId, serviceId, period)
    const existingTask = await Task.findOne({
      tenantId,
      clientId,
      serviceId,
      'period.label': periodStr
    });

    if (existingTask) {
      return {
        status: 'Skipped',
        reason: 'Already Spawned',
        task: existingTask,
        clientId,
        serviceId,
        period: periodStr
      };
    }

    // 2. Fetch Service
    const service = await Service.findOne({ _id: serviceId, tenantId });
    if (!service) {
      return {
        status: 'Failed',
        reason: 'Service not found',
        clientId,
        serviceId,
        period: periodStr
      };
    }

    // 3. Fetch Client
    const client = await Client.findOne({ _id: clientId, tenantId });
    if (!client) {
      return {
        status: 'Failed',
        reason: 'Client not found',
        clientId,
        serviceId,
        period: periodStr
      };
    }

    // 4. Resolve Checklist from Service blueprint
    const checklist = (service.checklist || []).map((step: any) => ({
      stepName: step.stepName,
      isCompleted: false
    }));

    // 5. Setup Custom Fields
    const customFieldValues: Record<string, any> = {};
    if (service.customFieldsDef) {
      service.customFieldsDef.forEach((cf: any) => {
        customFieldValues[cf.label] = '';
      });
    }

    // 6. Resolve Assignee Hierarchy:
    // (a) explicitly passed customAssignees -> (b) service.assignedUsers -> (c) client.assignedUsers
    let assigneeIds: mongoose.Types.ObjectId[] = [];
    if (customAssignees && customAssignees.length > 0) {
      assigneeIds = customAssignees;
    } else if (service.assignedUsers && service.assignedUsers.length > 0) {
      assigneeIds = service.assignedUsers;
    } else if (client.assignedUsers && client.assignedUsers.length > 0) {
      assigneeIds = client.assignedUsers;
    }

    // 7. Calculate Due Date & Subtasks
    const dueDay = service.frequency?.dueDay || 20;
    const dueDate = calculateDueDate(dueDay, referenceDate, 0);

    const calculatedSubtasks = (service.subtasks || []).map((st: any) => {
      let stDueDate = undefined;
      let stTargetDate = undefined;
      if (st.relativeDueDays !== undefined && st.relativeDueDays !== null) {
        const d = new Date(referenceDate);
        d.setDate(d.getDate() + st.relativeDueDays);
        stDueDate = d;
      }
      if (st.relativeTargetDays !== undefined && st.relativeTargetDays !== null) {
        const d = new Date(referenceDate);
        d.setDate(d.getDate() + st.relativeTargetDays);
        stTargetDate = d;
      }
      return {
        title: st.title,
        description: st.description,
        assignedUserId:
          st.assignedUserIds && st.assignedUserIds.length > 0
            ? st.assignedUserIds[0]
            : undefined,
        dueDate: stDueDate,
        targetDate: stTargetDate,
        status: 'Pending'
      };
    });

    const billingAmount =
      customBillingAmount !== undefined
        ? customBillingAmount
        : service.defaultBillingRate || 0;

    // 8. Create Task with automated creationType
    const task = await Task.create({
      tenantId,
      clientId,
      serviceId,
      assigneeIds,
      description: `${service.name} - ${periodStr}`,
      status: 'Pending',
      priority: 'Medium',
      period: {
        month: referenceDate.getUTCMonth() + 1,
        year: referenceDate.getUTCFullYear(),
        label: periodStr
      },
      dueDate,
      creationType: 'automated',
      checklist,
      subtasks: calculatedSubtasks,
      customFieldValues,
      isBillable: service.isBillable ?? true,
      billingAmount,
      billableAmount: billingAmount,
      docCollectionRequest: service.autoDocCollection?.isEnabled || false,
      docCollectionMessage:
        service.autoDocCollection?.defaultMessage ||
        'Please provide the required compliance documents.'
    });

    if (task.docCollectionRequest) {
      await triggerAutoDocumentRequestForService(
        tenantId,
        clientId,
        serviceId,
        undefined,
        task._id
      ).catch(err => console.error('[task-generation] Failed to trigger auto doc request:', err));
    }

    return {
      status: 'Created',
      task,
      clientId,
      serviceId,
      period: periodStr
    };
  } catch (err: any) {
    return {
      status: 'Failed',
      reason: err.message,
      clientId,
      serviceId,
      period: periodStr
    };
  }
};

export interface ScanRecurringTasksOptions {
  tenantId?: mongoose.Types.ObjectId;
  clientId?: mongoose.Types.ObjectId;
  serviceId?: mongoose.Types.ObjectId;
  forceAll?: boolean; // If true, ignores creationDay check (used for manual on-demand trigger)
  runType?: 'Cron' | 'Manual';
  triggeredBy?: mongoose.Types.ObjectId;
  referenceDate?: Date;
}

/**
 * Scans active clients across tenants and executes idempotent recurring task generation (Phase 64 & 65)
 */
export const scanAndGenerateRecurringTasks = async (
  options: ScanRecurringTasksOptions = {}
): Promise<AutomationExecutionSummary> => {
  const startedAt = new Date();
  const refDate = options.referenceDate || new Date();
  const runType = options.runType || 'Manual';

  // 1. Resolve Target Tenants
  let tenantIds: mongoose.Types.ObjectId[] = [];
  if (options.tenantId) {
    tenantIds = [options.tenantId];
  } else {
    const orgs = await Organization.find({ isActive: true }).select('_id');
    tenantIds = orgs.map((o) => o._id as mongoose.Types.ObjectId);
  }

  let totalScannedClients = 0;
  let totalTasksCreated = 0;
  let totalTasksSkipped = 0;
  let totalErrors = 0;
  const executionDetails: IAutomationLogDetail[] = [];

  for (const tid of tenantIds) {
    // 2. Query active clients with subscribed services or packages
    const clientQuery: any = {
      tenantId: tid,
      isActive: true,
      $or: [
        { 'subscribedServices.0': { $exists: true } },
        { 'subscribedPackages.0': { $exists: true } }
      ]
    };

    if (options.clientId) {
      clientQuery._id = options.clientId;
    }

    const clients = await Client.find(clientQuery);
    totalScannedClients += clients.length;

    // Cache packages in tenant for fast resolution
    const packages = await Package.find({ tenantId: tid, isActive: true });
    const packageMap = new Map<string, IPackage>();
    packages.forEach((pkg) => packageMap.set(pkg._id.toString(), pkg));

    // Cache services in tenant
    const services = await Service.find({ tenantId: tid, isEnabled: true });
    const serviceMap = new Map<string, IService>();
    services.forEach((s) => serviceMap.set(s._id.toString(), s));

    for (const client of clients) {
      // Collect all service subscriptions (both direct and via packages)
      interface ServiceSubTarget {
        serviceId: mongoose.Types.ObjectId;
        customUsers?: mongoose.Types.ObjectId[];
        customPrice?: number;
      }

      const targetsMap = new Map<string, ServiceSubTarget>();

      // Direct subscriptions
      if (client.subscribedServices) {
        client.subscribedServices.forEach((sub) => {
          targetsMap.set(sub.serviceId.toString(), {
            serviceId: sub.serviceId,
            customUsers: sub.customUsers,
            customPrice: sub.customPrice
          });
        });
      }

      // Package subscriptions
      if (client.subscribedPackages) {
        client.subscribedPackages.forEach((pkgSub) => {
          const pkg = packageMap.get(pkgSub.packageId.toString());
          if (pkg && pkg.serviceIds) {
            pkg.serviceIds.forEach((sId) => {
              const sidStr = sId.toString();
              if (!targetsMap.has(sidStr)) {
                targetsMap.set(sidStr, {
                  serviceId: sId
                });
              }
            });
          }
        });
      }

      // Process each subscribed service
      for (const target of targetsMap.values()) {
        if (options.serviceId && target.serviceId.toString() !== options.serviceId.toString()) {
          continue;
        }

        const service = serviceMap.get(target.serviceId.toString());
        if (!service) continue;

        // Verify if task should spawn today
        const freqType = service.frequency?.type || 'monthly';
        const offset: PeriodOffset =
          (service.frequency?.creationMonthOffset as PeriodOffset) || 'previous';

        if (!options.forceAll) {
          const isSpawnDay = shouldSpawnToday(service.frequency, refDate);
          if (!isSpawnDay) continue;
        }

        const periodStr = calculatePeriodString(freqType, refDate, offset);

        const genResult = await generateTaskForClientService(
          tid,
          client._id as mongoose.Types.ObjectId,
          target.serviceId,
          periodStr,
          refDate,
          target.customUsers,
          target.customPrice
        );

        if (genResult.status === 'Created') {
          totalTasksCreated++;
        } else if (genResult.status === 'Skipped') {
          totalTasksSkipped++;
        } else {
          totalErrors++;
        }

        executionDetails.push({
          clientId: {
            _id: client._id,
            name: client.name,
            clientNumber: client.clientNumber || client.fileNo,
            fileNo: client.clientNumber || client.fileNo
          } as any,
          serviceId: {
            _id: target.serviceId,
            name: service.name
          } as any,
          period: periodStr,
          status: genResult.status,
          reason: genResult.reason
        });
      }
    }
  }

  const completedAt = new Date();

  // 3. Save to AutomationLog (Phase 66)
  let logId: mongoose.Types.ObjectId | undefined;
  if (tenantIds.length > 0) {
    const primaryTenantId = options.tenantId || tenantIds[0];
    const logDoc = await AutomationLog.create({
      tenantId: primaryTenantId,
      runType,
      triggeredBy: options.triggeredBy,
      startedAt,
      completedAt,
      tasksCreatedCount: totalTasksCreated,
      tasksSkippedCount: totalTasksSkipped,
      errorCount: totalErrors,
      details: executionDetails
    });
    logId = logDoc._id as mongoose.Types.ObjectId;
  }

  return {
    tenantsProcessed: tenantIds.length,
    scannedClients: totalScannedClients,
    tasksCreated: totalTasksCreated,
    tasksSkipped: totalTasksSkipped,
    errors: totalErrors,
    details: executionDetails,
    logId
  };
};

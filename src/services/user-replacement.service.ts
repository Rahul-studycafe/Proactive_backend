import mongoose, { Types } from 'mongoose';
import { User } from '../modules/auth/schemas';
import { Task } from '../models/Task';
import { TaskHistory } from '../models/TaskHistory';
import { Client } from '../modules/clients/schemas/client.schema';
import { ApiError } from '../common/errors/api-error';

export interface ReplaceUserPayload {
  departingUserId: string;
  replacementUserId: string;
  reassignTasks?: boolean;
  reassignClients?: boolean;
  reassignServices?: boolean;
}

export interface ReplaceUserResult {
  tasksReassignedCount: number;
  clientsReassignedCount: number;
  servicesReassignedCount: number;
  userDeactivated: boolean;
}

/**
 * Phase 120: Atomic User Replacement Utility (Staff Handover)
 */
export const replaceUserService = async (
  tenantId: Types.ObjectId,
  payload: ReplaceUserPayload
): Promise<ReplaceUserResult> => {
  const {
    departingUserId,
    replacementUserId,
    reassignTasks = true,
    reassignClients = true,
    reassignServices = true
  } = payload;

  if (!Types.ObjectId.isValid(departingUserId) || !Types.ObjectId.isValid(replacementUserId)) {
    throw new ApiError(400, 'Invalid user ID format provided', 'INVALID_USER_ID');
  }

  if (departingUserId === replacementUserId) {
    throw new ApiError(400, 'Departing user and replacement user cannot be identical', 'SAME_USER_ERROR');
  }

  const tenantObjId = new Types.ObjectId(tenantId);
  const departingObjId = new Types.ObjectId(departingUserId);
  const replacementObjId = new Types.ObjectId(replacementUserId);

  // Validate users exist under the same tenant
  const [departingUser, replacementUser] = await Promise.all([
    User.findOne({ _id: departingObjId, tenantId: tenantObjId }).setOptions({ skipTenantPlugin: true }),
    User.findOne({ _id: replacementObjId, tenantId: tenantObjId }).setOptions({ skipTenantPlugin: true })
  ]);

  if (!departingUser) {
    throw new ApiError(404, 'Departing user not found in this organization', 'DEPARTING_USER_NOT_FOUND');
  }
  if (!replacementUser) {
    throw new ApiError(404, 'Replacement user not found in this organization', 'REPLACEMENT_USER_NOT_FOUND');
  }

  let session: mongoose.ClientSession | null = null;
  let useTransaction = true;

  try {
    session = await mongoose.startSession();
    session.startTransaction();
  } catch {
    useTransaction = false;
    session = null;
  }

  try {
    const sessionOption = session ? { session } : {};

    let tasksReassignedCount = 0;
    let clientsReassignedCount = 0;
    let servicesReassignedCount = 0;

    // 1. Reassign Tasks
    if (reassignTasks) {
      const taskFilter = {
        tenantId: tenantObjId,
        status: { $nin: ['Completed', 'Cancelled'] },
        $or: [
          { assigneeIds: departingObjId },
          { 'subtasks.assignedUserId': departingObjId }
        ]
      };

      const tasksToReassign = await Task.find(taskFilter).select('_id').session(session || null);
      tasksReassignedCount = tasksToReassign.length;

      if (tasksReassignedCount > 0) {
        // Replace in assigneeIds
        await Task.updateMany(
          { _id: { $in: tasksToReassign.map((t) => t._id) } },
          {
            $pull: { assigneeIds: departingObjId }
          },
          sessionOption
        );

        await Task.updateMany(
          { _id: { $in: tasksToReassign.map((t) => t._id) } },
          {
            $addToSet: { assigneeIds: replacementObjId }
          },
          sessionOption
        );

        // Replace in subtasks
        await Task.updateMany(
          {
            _id: { $in: tasksToReassign.map((t) => t._id) },
            'subtasks.assignedUserId': departingObjId
          },
          {
            $set: { 'subtasks.$[sub].assignedUserId': replacementObjId }
          },
          {
            ...sessionOption,
            arrayFilters: [{ 'sub.assignedUserId': departingObjId }]
          }
        );

        // Append audit entries
        const auditEntries = tasksToReassign.map((t) => ({
          tenantId: tenantObjId,
          taskId: t._id,
          createdBy: replacementObjId,
          action: 'Staff Handover Reassignment',
          details: `Reassigned from ${departingUser.name} to ${replacementUser.name}`
        }));
        await TaskHistory.insertMany(auditEntries, sessionOption);
      }
    }

    // 2. Reassign Clients
    if (reassignClients) {
      const clientFilter = {
        tenantId: tenantObjId,
        assignedUsers: departingObjId
      };

      const clients = await Client.find(clientFilter).select('_id').session(session || null);
      clientsReassignedCount = clients.length;

      if (clientsReassignedCount > 0) {
        await Client.updateMany(
          { _id: { $in: clients.map((c) => c._id) } },
          {
            $pull: { assignedUsers: departingObjId }
          },
          sessionOption
        );

        await Client.updateMany(
          { _id: { $in: clients.map((c) => c._id) } },
          {
            $addToSet: { assignedUsers: replacementObjId }
          },
          sessionOption
        );
      }
    }

    // 3. Reassign Service Subscription Custom Users
    if (reassignServices) {
      const serviceClients = await Client.find({
        tenantId: tenantObjId,
        'subscribedServices.customUsers': departingObjId
      }).select('_id').session(session || null);

      servicesReassignedCount = serviceClients.length;

      if (servicesReassignedCount > 0) {
        await Client.updateMany(
          { _id: { $in: serviceClients.map((c) => c._id) } },
          {
            $pull: { 'subscribedServices.$[].customUsers': departingObjId }
          },
          sessionOption
        );

        await Client.updateMany(
          { _id: { $in: serviceClients.map((c) => c._id) } },
          {
            $addToSet: { 'subscribedServices.$[].customUsers': replacementObjId }
          },
          sessionOption
        );
      }
    }

    // 4. Deactivate Departing User
    await User.updateOne(
      { _id: departingObjId, tenantId: tenantObjId },
      { $set: { isActive: false } },
      sessionOption
    );

    if (session && useTransaction) {
      await session.commitTransaction();
    }

    return {
      tasksReassignedCount,
      clientsReassignedCount,
      servicesReassignedCount,
      userDeactivated: true
    };
  } catch (error) {
    if (session && useTransaction) {
      await session.abortTransaction();
    }
    throw error;
  } finally {
    if (session) {
      session.endSession();
    }
  }
};

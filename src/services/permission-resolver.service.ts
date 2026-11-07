import { User } from '../modules/auth/schemas';
import { Role, IRole, ScopeType } from '../modules/roles/schemas';
import { ApiError } from '../common/errors/api-error';

export interface EffectivePermission {
  allowed: boolean;
  scope: ScopeType;
}

export interface UserEffectiveState {
  isSuperAdmin: boolean;
  permissions: Record<string, EffectivePermission>;
  roles: { id: string; name: string }[];
}

const SCOPE_RANK: Record<string, number> = {
  assigned_only: 1,
  team_only: 2,
  everything: 3,
};

export function widenScope(scopeA: string, scopeB: string): ScopeType {
  const rankA = SCOPE_RANK[scopeA] || 1;
  const rankB = SCOPE_RANK[scopeB] || 1;
  return rankA >= rankB ? (scopeA as ScopeType) : (scopeB as ScopeType);
}

interface CacheEntry {
  state: UserEffectiveState;
  expiresAt: number;
}

const userCache = new Map<string, CacheEntry>();
const tenantUsersMap = new Map<string, Set<string>>(); // tenantId -> Set<userId>

export class PermissionResolverService {
  private static CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes TTL

  /**
   * Resolves effective permissions across all assigned roles for a user.
   * Handles multi-role union, scope widening, and legacy nested permission formats.
   */
  static async resolveUserPermissions(
    userId: string,
    tenantId: string
  ): Promise<UserEffectiveState> {
    const now = Date.now();
    const cached = userCache.get(userId);
    if (cached && cached.expiresAt > now) {
      return cached.state;
    }

    const user = await User.findById(userId)
      .populate('roleId')
      .populate('roleIds')
      .setOptions({ skipTenantPlugin: true });

    if (!user) {
      throw new ApiError(401, 'User not found', 'UNAUTHORIZED');
    }

    // 1. Organization Owner Check — Absolute Super Admin bypass
    if (user.isOwner) {
      const state: UserEffectiveState = {
        isSuperAdmin: true,
        permissions: {},
        roles: [{ id: user.roleId?._id?.toString() || 'owner', name: 'Super Admin (Owner)' }]
      };
      this.cacheUser(userId, tenantId, state);
      return state;
    }

    // 2. Collect all roles (primary roleId + secondary roleIds array)
    const rawRoles: IRole[] = [
      user.roleId as any,
      ...((user.roleIds as any[]) || [])
    ].filter(Boolean);

    // Deduplicate roles by ID
    const roleMap = new Map<string, IRole>();
    for (const r of rawRoles) {
      if (r && r._id) {
        roleMap.set(r._id.toString(), r);
      }
    }
    const roles = Array.from(roleMap.values());

    let isSuperAdmin = false;
    const resolvedPerms: Record<string, EffectivePermission> = {};
    const rolesList: { id: string; name: string }[] = [];

    for (const role of roles) {
      rolesList.push({ id: role._id.toString(), name: role.name });

      if (role.isSuperAdmin) {
        isSuperAdmin = true;
        break;
      }

      const rolePerms = role.permissions || {};

      // Process permissions: handles both flat Map/Object ("client:create") and legacy nested ("client.create")
      for (const [key, val] of Object.entries(rolePerms)) {
        if (!val) continue;

        // Check if canonical format ("resource:action")
        if (typeof val === 'object' && 'allowed' in val) {
          const permAction = val as { allowed: boolean; scope?: ScopeType };
          if (!permAction.allowed) continue;

          const scope = permAction.scope || 'everything';
          if (!resolvedPerms[key]) {
            resolvedPerms[key] = { allowed: true, scope };
          } else {
            resolvedPerms[key].scope = widenScope(resolvedPerms[key].scope, scope);
          }
        } 
        // Legacy nested structure: key is resource (e.g. "client"), val is { create: { allowed: true }, edit: ... }
        else if (typeof val === 'object') {
          for (const [subAction, subVal] of Object.entries(val)) {
            const permAction = subVal as { allowed?: boolean; scope?: ScopeType };
            if (!permAction || !permAction.allowed) continue;

            const canonicalKey = `${key}:${subAction}`;
            const scope = permAction.scope || 'everything';

            if (!resolvedPerms[canonicalKey]) {
              resolvedPerms[canonicalKey] = { allowed: true, scope };
            } else {
              resolvedPerms[canonicalKey].scope = widenScope(resolvedPerms[canonicalKey].scope, scope);
            }
          }
        }
      }
    }

    const state: UserEffectiveState = {
      isSuperAdmin,
      permissions: resolvedPerms,
      roles: rolesList
    };

    this.cacheUser(userId, tenantId, state);
    return state;
  }

  private static cacheUser(userId: string, tenantId: string, state: UserEffectiveState) {
    userCache.set(userId, {
      state,
      expiresAt: Date.now() + this.CACHE_TTL_MS
    });

    if (!tenantUsersMap.has(tenantId)) {
      tenantUsersMap.set(tenantId, new Set());
    }
    tenantUsersMap.get(tenantId)!.add(userId);
  }

  /**
   * Instantly invalidates permissions when a user's role assignment changes.
   */
  static invalidateUser(userId: string) {
    userCache.delete(userId);
  }

  /**
   * Instantly invalidates all cached users in a tenant when a role is modified.
   */
  static invalidateTenant(tenantId: string) {
    const users = tenantUsersMap.get(tenantId);
    if (users) {
      users.forEach((uid) => userCache.delete(uid));
      users.clear();
    }
  }

  /**
   * Clears the entire cache (useful for testing or cold reloads).
   */
  static clearAll() {
    userCache.clear();
    tenantUsersMap.clear();
  }
}


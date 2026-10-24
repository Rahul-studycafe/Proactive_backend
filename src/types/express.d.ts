import mongoose from 'mongoose';

/**
 * Extend Express Request to include tenant-scoped properties
 * injected by the authenticate middleware.
 */
declare global {
  namespace Express {
    interface Request {
      /** The authenticated user's document from MongoDB */
      user?: {
        _id: mongoose.Types.ObjectId;
        tenantId: mongoose.Types.ObjectId;
        name: string;
        username: string;
        roleId: mongoose.Types.ObjectId;
        departmentId?: mongoose.Types.ObjectId;
        tokenVersion: number;
      };
      /** The tenantId extracted from the JWT — NEVER from the client */
      tenantId?: mongoose.Types.ObjectId;
      
      /** The authorization scope determined by the authorize middleware */
      permissionScope?: 'everything' | 'assigned_only' | 'team_only';
      
      /** The Mongoose filter object to apply data scoping (e.g., { assignedUserId: req.user._id }) */
      scopeFilter?: any;
    }
  }
}

export { };

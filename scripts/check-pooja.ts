import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Ensure models are registered
import '../src/modules/roles/schemas';
import '../src/modules/auth/schemas';
import { PermissionResolverService } from '../src/services/permission-resolver.service';

async function main() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://root:secret@localhost:27017/proactive?authSource=admin');
  const res = await PermissionResolverService.resolveUserPermissions('6a3fb9242858e47d6f643f01', '6a3f7e69fd80b3e6b26c0762');
  console.log('isSuperAdmin:', res.isSuperAdmin);
  console.log('roles:', res.roles);
  console.log('permissions keys count:', Object.keys(res.permissions).length);
  console.log('permissions:', res.permissions);
  await mongoose.disconnect();
}

main().catch(console.error);


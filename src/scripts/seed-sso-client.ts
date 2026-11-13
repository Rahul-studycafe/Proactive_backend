import dns from 'node:dns';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { SsoClient } from '../models/SsoClient';

try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch {
  // Ignore fallback
}

dotenv.config();

async function seedSsoClient() {
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://root:secret@localhost:27017/proactive?authSource=admin';
  console.log(`Connecting to MongoDB at: ${mongoUri.replace(/:([^:@]+)@/, ':****@')}`);
  await mongoose.connect(mongoUri);

  const clientId = process.env.SSO_CLIENT_ID || 'automation-cafe';
  const name = process.env.SSO_CLIENT_NAME || 'Automation Cafe';
  const clientSecret = process.env.SSO_CLIENT_SECRET || `sec_live_${crypto.randomBytes(20).toString('hex')}`;
  const salt = await bcrypt.genSalt(12);
  const clientSecretHash = await bcrypt.hash(clientSecret, salt);

  const allowedRedirectUris = [
    'http://localhost:8080/sso/exchange',
    'http://127.0.0.1:8080/sso/exchange',
    process.env.FRONTEND_URL ? `${process.env.FRONTEND_URL.replace(/\/$/, '')}/sso/exchange` : '',
  ].filter(Boolean);

  const existingClient = await SsoClient.findOne({ clientId });

  if (existingClient) {
    existingClient.name = name;
    existingClient.clientSecretHash = clientSecretHash;
    existingClient.allowedRedirectUris = allowedRedirectUris;
    existingClient.isActive = true;
    existingClient.provisioningMode = 'auto_provision';
    await existingClient.save();
    console.log(`\nUpdated existing SSO Client: "${name}" (${clientId})`);
  } else {
    await SsoClient.create({
      clientId,
      clientSecretHash,
      name,
      description: 'External Automation Platform & Software Suite',
      allowedRedirectUris,
      provisioningMode: 'auto_provision',
      defaultPlanMaxUsers: 5,
      isActive: true,
    });
    console.log(`\nCreated new SSO Client: "${name}" (${clientId})`);
  }

  console.log('\n======================================================');
  console.log('  ONE-CLICK SSO CLIENT CREDENTIALS (SAVE THESE)');
  console.log('======================================================');
  console.log(`  Client ID     : ${clientId}`);
  console.log(`  Client Secret : ${clientSecret}`);
  console.log(`  Allowed URIs  : ${allowedRedirectUris.join(', ')}`);
  console.log(`  Mode          : auto_provision`);
  console.log('======================================================\n');

  await mongoose.disconnect();
  console.log('Disconnected from MongoDB.');
}

seedSsoClient().catch((err) => {
  console.error('Failed to seed SSO client:', err);
  process.exit(1);
});

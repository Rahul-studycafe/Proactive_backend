import dotenv from 'dotenv';
dotenv.config();
import mongoose from 'mongoose';

async function migrate() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) {
    console.error('No MONGO_URI provided in environment');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('Connected to database for clientNumber migration');

  const db = mongoose.connection.db!;
  const clients = await db.collection('clients').find({}).toArray();
  console.log(`Found ${clients.length} clients to check/migrate.`);

  let updatedCount = 0;
  for (const c of clients) {
    const val = c.clientNumber || c.fileNo;
    if (val) {
      await db.collection('clients').updateOne(
        { _id: c._id },
        { $set: { clientNumber: val, fileNo: val } }
      );
      updatedCount++;
      console.log(`Migrated: "${c.name}" -> clientNumber = "${val}"`);
    }
  }

  console.log(`Successfully migrated ${updatedCount} clients.`);
  await mongoose.disconnect();
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});


const mongoose = require('mongoose');

async function run() {
  await mongoose.connect('mongodb://root:secret@localhost:27017/proactive?authSource=admin');
  console.log('Connected to MongoDB');

  const { triggerAutoDocumentRequestForService } = require('../dist/services/document-request.service');

  const client = await mongoose.connection.db.collection('clients').findOne({ name: /Zenith/i });
  if (!client) {
    console.error('Zenith client not found');
    process.exit(1);
  }

  const service = await mongoose.connection.db.collection('services').findOne({ name: /GST filling/i });
  if (!service) {
    console.error('GST filling service not found');
    process.exit(1);
  }

  console.log('Triggering auto doc request for client:', client.name, 'service:', service.name);
  const result = await triggerAutoDocumentRequestForService(client.tenantId, client._id, service._id);
  console.log('Result:', result ? {
    _id: result._id,
    requestNo: result.requestNo,
    title: result.title,
    instructions: result.instructions,
    status: result.status,
    itemsCount: result.items?.length,
    uploadUrl: result.uploadUrl
  } : 'Failed/Null');

  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});



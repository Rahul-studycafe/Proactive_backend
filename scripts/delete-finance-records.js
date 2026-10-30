const mongoose = require('mongoose');

async function run() {
  await mongoose.connect('mongodb://root:secret@localhost:27017/proactive?authSource=admin');
  console.log('Connected to MongoDB');

  const db = mongoose.connection.db;

  // 1. Delete Quotations
  const quotRes = await db.collection('quotations').deleteMany({});
  console.log(`Deleted Quotations: ${quotRes.deletedCount}`);

  // 2. Delete Invoices
  const invRes = await db.collection('invoices').deleteMany({});
  console.log(`Deleted Invoices: ${invRes.deletedCount}`);

  // 3. Delete Credit Notes
  const cnRes = await db.collection('creditnotes').deleteMany({});
  console.log(`Deleted Credit Notes: ${cnRes.deletedCount}`);

  // 4. Delete Receipts
  const rctRes = await db.collection('receipts').deleteMany({});
  console.log(`Deleted Receipts: ${rctRes.deletedCount}`);

  // 5. Delete Expenses
  const expRes = await db.collection('expenses').deleteMany({});
  console.log(`Deleted Expenses: ${expRes.deletedCount}`);

  // 6. Unlink any tasks that were billed/associated with deleted invoices
  const taskRes = await db.collection('tasks').updateMany(
    { $or: [{ invoiceId: { $ne: null } }, { isBilled: true }] },
    { $set: { isBilled: false }, $unset: { invoiceId: '', billingInvoiceId: '' } }
  );
  console.log(`Tasks unlinked from deleted invoices: ${taskRes.modifiedCount}`);

  // 7. Reset sequence numbers in organizations so next records start fresh from 1
  const orgRes = await db.collection('organizations').updateMany(
    {},
    {
      $set: {
        lastInvoiceNumber: 0,
        lastReceiptNumber: 0,
        lastCreditNoteNumber: 0,
        lastQuotationNumber: 0
      }
    }
  );
  console.log(`Organizations sequence numbers reset: ${orgRes.modifiedCount}`);

  console.log('Cleanup completed successfully.');
  process.exit(0);
}

run().catch((err) => {
  console.error('Cleanup error:', err);
  process.exit(1);
});


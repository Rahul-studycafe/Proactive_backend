const mongoose = require('c:/Users/hp/Desktop/Proactive/Backend/node_modules/mongoose');

async function fixDuration() {
  await mongoose.connect('mongodb://root:secret@localhost:27017/proactive?authSource=admin');
  const res = await mongoose.connection.db.collection('organizations').updateMany(
    { slug: { $in: ['rahul-and-co', 'pd-gupta'] } },
    { $set: { subscriptionDuration: 'yearly' } }
  );
  console.log('Updated orgs count:', res.modifiedCount);
  const updated = await mongoose.connection.db.collection('organizations').find({ slug: { $in: ['rahul-and-co', 'pd-gupta'] } }).toArray();
  console.log(updated.map((o) => ({ name: o.name, duration: o.subscriptionDuration, renewalDate: o.renewalDate })));
  await mongoose.disconnect();
}

fixDuration().catch(console.error);


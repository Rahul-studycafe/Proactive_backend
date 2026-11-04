const mongoose = require('c:/Users/hp/Desktop/Proactive/Backend/node_modules/mongoose');
const bcrypt = require('c:/Users/hp/Desktop/Proactive/Backend/node_modules/bcryptjs');

async function setPasswords() {
  await mongoose.connect('mongodb://root:secret@localhost:27017/proactive?authSource=admin');
  const salt = await bcrypt.genSalt(12);
  const hash = await bcrypt.hash('password123', salt);

  // Update Rahul
  await mongoose.connection.db.collection('platformusers').updateOne(
    { email: 'rahulchauhah50@gmail.com' },
    { $set: { password: hash } }
  );
  await mongoose.connection.db.collection('users').updateOne(
    { email: 'rahulchauhah50@gmail.com' },
    { $set: { password: hash } }
  );

  // Update Raja
  await mongoose.connection.db.collection('platformusers').updateOne(
    { email: 'info@studycafe.in' },
    { $set: { password: hash } }
  );
  await mongoose.connection.db.collection('users').updateOne(
    { email: 'info@studycafe.in' },
    { $set: { password: hash } }
  );

  console.log('Successfully set password123 for Rahul Chauhan and Raja Mehta!');
  await mongoose.disconnect();
}
setPasswords().catch(console.error);


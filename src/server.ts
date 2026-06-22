import app from './app';
import dotenv from 'dotenv';
import connectDB from './config/db';
import dns from 'node:dns';

// Force Node.js to prioritize IPv4 over IPv6. 
// Fixes ENETUNREACH errors on servers that have IPv6 disabled/unreachable (like many Docker/VPS environments).
dns.setDefaultResultOrder('ipv4first');

dotenv.config();

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  // Connect to Database
  await connectDB();

  // Start Express Server
  const server = app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });

  return server;
};

const serverPromise = startServer();

export default serverPromise;

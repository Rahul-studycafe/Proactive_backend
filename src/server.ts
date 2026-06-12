import app from './app';
import dotenv from 'dotenv';
import connectDB from './config/db';

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

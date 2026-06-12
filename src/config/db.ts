import mongoose from 'mongoose';

const connectDB = async (retries = 5, delay = 5000): Promise<void> => {
  const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/proactive';

  while (retries > 0) {
    try {
      await mongoose.connect(uri);
      console.log('Successfully connected to MongoDB');
      return;
    } catch (error) {
      console.error(`MongoDB connection failed. Retries left: ${retries - 1}`);
      console.error(error);
      retries -= 1;
      if (retries === 0) {
        console.error('All retries to connect to MongoDB failed. Exiting process.');
        process.exit(1);
      }
      // Wait before retrying
      await new Promise((res) => setTimeout(res, delay));
    }
  }
};

export default connectDB;

// config/database.js
const mongoose = require('mongoose');

const connectDatabase = async () => {
  try {
    console.log('🔍 Checking MONGO_URI...');
    console.log('MONGO_URI:', process.env.MONGO_URI ? '***' + process.env.MONGO_URI.slice(-20) : 'NOT FOUND');
    
    if (!process.env.MONGO_URI) {
      throw new Error('MONGO_URI is not defined in environment variables');
    }

    const conn = await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log(`✅ MongoDB Connected: ${conn.connection.host}`.cyan.bold);
    console.log(`📊 Database: ${conn.connection.name}`.green.bold);
    
  } catch (error) {
    console.error(`❌ Database connection failed: ${error.message}`.red.bold);
    console.log('💡 Make sure your .env file has MONGO_URI defined');
    process.exit(1);
  }
};

mongoose.connection.on('disconnected', () => {
  console.log('⚠️ MongoDB disconnected'.yellow.bold);
});

mongoose.connection.on('error', (err) => {
  console.error(`❌ MongoDB connection error: ${err}`.red.bold);
});

module.exports = connectDatabase;
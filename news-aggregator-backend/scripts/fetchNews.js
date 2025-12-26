// scripts/fetchNews.js - Manual news fetcher
require('dotenv').config();
const connectDB = require('../config/database');
const rssAggregator = require('../services/rssAggregator');

async function fetchNews() {
  try {
    console.log('🔌 Connecting to database...');
    await connectDB();
    
    console.log('📡 Fetching RSS feeds...');
    const totalArticles = await rssAggregator.fetchAllFeeds();
    
    console.log('\n✅ SUCCESS!');
    console.log(`📰 Total new articles fetched: ${totalArticles}`);
    console.log('\n💡 Now you can:');
    console.log('   1. Open http://localhost:5000/api/articles');
    console.log('   2. Connect your frontend to see articles');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

fetchNews();
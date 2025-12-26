// workers/aggregatorWorker.js - Background Worker for RSS Aggregation
require('dotenv').config();
const { Queue, Worker } = require('bullmq');
const rssAggregator = require('../services/rssAggregator');
const articleExtractor = require('../services/articleExtractor');
const redis = require('../config/redis');
const connectDB = require('../config/database');
const { WORKER_CONCURRENCY, CRON_PATTERNS } = require('../config/constants');

// Create queues
const aggregatorQueue = new Queue('rss-aggregator', {
  connection: redis
});

const extractorQueue = new Queue('article-extractor', {
  connection: redis
});

// RSS Aggregation Worker
const aggregatorWorker = new Worker('rss-aggregator', async (job) => {
  console.log(`🔄 Job started: ${job.name} (ID: ${job.id})`);
  
  try {
    const totalArticles = await rssAggregator.fetchAllFeeds();
    
    // After fetching, trigger extraction for new articles
    if (totalArticles > 0) {
      await extractorQueue.add('extract-batch', { limit: 20 }, {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000
        }
      });
    }
    
    return { totalArticles, timestamp: new Date() };
    
  } catch (error) {
    console.error('❌ Aggregator job failed:', error);
    throw error;
  }
}, {
  connection: redis,
  concurrency: WORKER_CONCURRENCY.RSS_AGGREGATOR
});

// Article Extraction Worker
const extractorWorker = new Worker('article-extractor', async (job) => {
  console.log(`🔄 Extraction job started (ID: ${job.id})`);
  
  try {
    const { limit = 10 } = job.data;
    const processed = await articleExtractor.extractBatch(limit);
    
    return { processed, timestamp: new Date() };
    
  } catch (error) {
    console.error('❌ Extraction job failed:', error);
    throw error;
  }
}, {
  connection: redis,
  concurrency: WORKER_CONCURRENCY.ARTICLE_EXTRACTOR
});

// Event listeners
aggregatorWorker.on('completed', (job, result) => {
  console.log(`✅ Aggregator job ${job.id} completed:`, result);
});

aggregatorWorker.on('failed', (job, err) => {
  console.error(`❌ Aggregator job ${job?.id} failed:`, err.message);
});

extractorWorker.on('completed', (job, result) => {
  console.log(`✅ Extractor job ${job.id} completed:`, result);
});

extractorWorker.on('failed', (job, err) => {
  console.error(`❌ Extractor job ${job?.id} failed:`, err.message);
});

// Schedule recurring jobs
async function setupScheduledJobs() {
  try {
    // Remove existing repeatable jobs
    const repeatableJobs = await aggregatorQueue.getRepeatableJobs();
    for (const job of repeatableJobs) {
      await aggregatorQueue.removeRepeatableByKey(job.key);
    }
    
    // Fetch RSS feeds every 15 minutes
    await aggregatorQueue.add(
      'fetch-rss-feeds',
      {},
      {
        repeat: {
          pattern: CRON_PATTERNS.RSS_FETCH // Every 15 minutes
        },
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000
        }
      }
    );
    
    console.log('✅ Scheduled jobs configured (RSS fetch every 15 minutes)');
  } catch (error) {
    console.error('❌ Failed to setup scheduled jobs:', error);
  }
}

// Start workers
async function startWorkers() {
  try {
    // Connect to MongoDB
    await connectDB();
    
    // Setup scheduled jobs
    await setupScheduledJobs();
    
    // Trigger immediate fetch on startup
    await aggregatorQueue.add('initial-fetch', {}, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000
      }
    });
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🚀 Workers started successfully');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📋 Active workers:');
    console.log('   • RSS Aggregator (runs every 15 min)');
    console.log('   • Article Extractor (processes in batches)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
  } catch (error) {
    console.error('❌ Failed to start workers:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, closing workers...');
  await aggregatorWorker.close();
  await extractorWorker.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('Received SIGINT, closing workers...');
  await aggregatorWorker.close();
  await extractorWorker.close();
  process.exit(0);
});

// Start if run directly
if (require.main === module) {
  startWorkers();
}

module.exports = {
  aggregatorQueue,
  extractorQueue,
  startWorkers
};
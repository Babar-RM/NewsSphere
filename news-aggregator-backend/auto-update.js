// auto-update.js - Place in ROOT of backend folder
require('dotenv').config();
const cron = require('node-cron');
const { exec } = require('child_process');

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🤖 NEWS AUTO-UPDATER STARTED');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('📡 Fetching news every 15 minutes...');
console.log('🇵🇰 Including Pakistan news sources');
console.log('🌍 Including global news sources');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// Run immediately
console.log('🚀 Running initial fetch...\n');
exec('node fetch-news.js', { cwd: __dirname }, (error, stdout, stderr) => {
  if (stdout) console.log(stdout);
  if (error) console.error('Error:', error.message);
});

// Then every 15 minutes
cron.schedule('*/15 * * * *', () => {
  console.log(`\n⏰ ${new Date().toLocaleString()} - Auto-fetching...\n`);
  exec('node fetch-news.js', { cwd: __dirname }, (error, stdout, stderr) => {
    if (stdout) console.log(stdout);
    if (error) console.error('Error:', error.message);
  });
});

process.on('SIGINT', () => {
  console.log('\n🛑 Stopped');
  process.exit(0);
});
// fetch-news.js - Fetch News with COMPLETE Full Text Extraction
require('dotenv').config();
const mongoose = require('mongoose');
const RSSParser = require('rss-parser');
const axios = require('axios');
const { Readability } = require('@mozilla/readability');
const { JSDOM } = require('jsdom');

// Article Schema
const articleSchema = new mongoose.Schema({
  title: { type: String, required: true },
  url: { type: String, required: true, unique: true },
  source: { type: String, required: true },
  description: String,
  fullText: String,
  author: String,
  publishedAt: { type: Date, default: Date.now },
  category: { 
    type: String, 
    enum: ['tech', 'business', 'sports', 'world', 'entertainment', 'other'],
    default: 'other' 
  },
  imageUrl: String,
  isProcessed: { type: Boolean, default: false },
  wordCount: { type: Number, default: 0 },
}, { timestamps: true });

const Article = mongoose.model('Article', articleSchema);

// RSS Feeds - Including PAKISTAN Sources
const RSS_FEEDS = [
  // Pakistan News
  { url: 'https://www.dawn.com/feeds/home', source: 'Dawn (Pakistan)', category: 'world' },
  { url: 'https://www.thenews.com.pk/rss/1/1', source: 'The News (Pakistan)', category: 'world' },
  { url: 'https://tribune.com.pk/feed/home', source: 'Express Tribune', category: 'world' },
  { url: 'https://www.brecorder.com/feed', source: 'Business Recorder (PK)', category: 'business' },
  
  // Technology
  { url: 'https://techcrunch.com/feed/', source: 'TechCrunch', category: 'tech' },
  { url: 'https://www.theverge.com/rss/index.xml', source: 'The Verge', category: 'tech' },
  { url: 'https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml', source: 'NY Times', category: 'tech' },
  
  // Business
  { url: 'https://feeds.bbci.co.uk/news/business/rss.xml', source: 'BBC', category: 'business' },
  { url: 'https://rss.nytimes.com/services/xml/rss/nyt/Business.xml', source: 'NY Times', category: 'business' },
  
  // Sports
  { url: 'https://feeds.bbci.co.uk/sport/rss.xml', source: 'BBC', category: 'sports' },
  { url: 'https://www.espn.com/espn/rss/news', source: 'ESPN', category: 'sports' },
  
  // World News
  { url: 'https://feeds.bbci.co.uk/news/world/rss.xml', source: 'BBC', category: 'world' },
  { url: 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml', source: 'NY Times', category: 'world' },
  { url: 'https://www.aljazeera.com/xml/rss/all.xml', source: 'Al Jazeera', category: 'world' },
];

const parser = new RSSParser({
  timeout: 15000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  }
});

// Extract image
function extractImage(item) {
  if (item.enclosure?.url && item.enclosure.url.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
    return item.enclosure.url;
  }
  if (item['media:thumbnail']?.$?.url) return item['media:thumbnail'].$.url;
  if (item['media:content']?.$?.url) return item['media:content'].$.url;
  
  if (item.content) {
    const imgMatch = item.content.match(/<img[^>]+src=["']([^"']+)["']/);
    if (imgMatch) return imgMatch[1];
  }
  
  return null;
}

// Extract FULL ARTICLE CONTENT
async function extractFullText(url, source) {
  const maxRetries = 2;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`      📄 Extracting full text (attempt ${attempt}/${maxRetries})...`);
      
      const response = await axios.get(url, {
        timeout: 20000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
        },
        maxRedirects: 5,
        validateStatus: (status) => status < 500,
      });
      
      if (response.status !== 200) {
        console.log(`      ⚠️  Status ${response.status}, skipping...`);
        return null;
      }
      
      // Parse with Readability
      const dom = new JSDOM(response.data, { 
        url,
        contentType: 'text/html',
        includeNodeLocations: false,
        storageQuota: 10000000
      });
      
      const reader = new Readability(dom.window.document, {
        charThreshold: 500,
      });
      
      const article = reader.parse();
      
      if (!article || !article.textContent) {
        console.log(`      ⚠️  No readable content found`);
        return null;
      }
      
      // Clean the text thoroughly
      let fullText = article.textContent;
      
      // Remove script/style content
      fullText = fullText.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
      fullText = fullText.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
      
      // Normalize whitespace
      fullText = fullText
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .replace(/\t/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/\n\s*\n\s*\n+/g, '\n\n')
        .trim();
      
      // Split into paragraphs
      const paragraphs = fullText
        .split(/\n\n+/)
        .map(p => p.trim())
        .filter(p => p.length > 50) // Remove short fragments
        .filter(p => !p.match(/^(Advertisement|Continue reading|Read more|Subscribe|Sign up|Share|Tweet|Email)/i));
      
      fullText = paragraphs.join('\n\n');
      
      const wordCount = fullText.split(/\s+/).length;
      
      if (wordCount < 100) {
        console.log(`      ⚠️  Content too short (${wordCount} words)`);
        return null;
      }
      
      console.log(`      ✅ Extracted ${wordCount} words, ${paragraphs.length} paragraphs`);
      
      return {
        fullText,
        wordCount
      };
      
    } catch (error) {
      console.log(`      ⚠️  Attempt ${attempt} failed: ${error.message}`);
      
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s before retry
      }
    }
  }
  
  return null;
}

// Fetch single feed
async function fetchFeed(feedConfig) {
  try {
    console.log(`\n📡 Fetching ${feedConfig.source} (${feedConfig.category})...`);
    
    const feed = await parser.parseURL(feedConfig.url);
    let newArticles = 0;
    let extractedCount = 0;
    
    const items = feed.items.slice(0, 3); // Limit to 3 per source for speed
    
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      
      try {
        const exists = await Article.findOne({ url: item.link });
        if (exists) {
          console.log(`   ⏭️  Skipped (already exists)`);
          continue;
        }
        
        console.log(`\n   📰 [${i + 1}/${items.length}] ${item.title.substring(0, 60)}...`);
        
        // Extract full content
        const extracted = await extractFullText(item.link, feedConfig.source);
        
        let fullText = '';
        let wordCount = 0;
        let isProcessed = false;
        
        if (extracted) {
          fullText = extracted.fullText;
          wordCount = extracted.wordCount;
          isProcessed = true;
          extractedCount++;
        } else {
          // Fallback to description
          fullText = item.contentSnippet || item.summary || '';
          wordCount = fullText.split(/\s+/).length;
        }
        
        // Create article
        const article = new Article({
          title: item.title || 'Untitled',
          url: item.link,
          source: feedConfig.source,
          category: feedConfig.category,
          description: (item.contentSnippet || item.summary || '').substring(0, 500),
          fullText: fullText,
          author: item.creator || item['dc:creator'] || 'Unknown',
          publishedAt: item.pubDate ? new Date(item.pubDate) : new Date(),
          imageUrl: extractImage(item),
          isProcessed: isProcessed,
          wordCount: wordCount,
        });
        
        await article.save();
        newArticles++;
        
        console.log(`   ✅ Saved (${isProcessed ? 'FULL TEXT' : 'summary only'})`);
        
        // Delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 2000));
        
      } catch (saveError) {
        if (saveError.code === 11000) {
          console.log(`   ⏭️  Skipped (duplicate)`);
        } else {
          console.error(`   ❌ Save error: ${saveError.message}`);
        }
      }
    }
    
    console.log(`\n✅ ${feedConfig.source}: ${newArticles} new articles (${extractedCount} with full text)`);
    return { total: newArticles, extracted: extractedCount };
    
  } catch (error) {
    console.error(`\n❌ ${feedConfig.source} failed: ${error.message}`);
    return { total: 0, extracted: 0 };
  }
}

// Main
async function fetchAllNews() {
  try {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🚀 NEWS AGGREGATOR - Full Text Extraction');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    console.log('\n🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ MongoDB Connected');
    
    const startTime = Date.now();
    
    let totalArticles = 0;
    let totalExtracted = 0;
    
    for (const feed of RSS_FEEDS) {
      const result = await fetchFeed(feed);
      totalArticles += result.total;
      totalExtracted += result.extracted;
    }
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ FETCH COMPLETE!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📰 Total articles: ${totalArticles}`);
    console.log(`✅ Full text extracted: ${totalExtracted}`);
    console.log(`⏱️  Duration: ${duration}s`);
    
    // Show samples
    const samples = await Article.find({ isProcessed: true })
      .sort({ createdAt: -1 })
      .limit(2);
    
    if (samples.length > 0) {
      console.log('\n📋 Sample Articles:');
      samples.forEach((article, i) => {
        console.log(`\n${i + 1}. ${article.title}`);
        console.log(`   Source: ${article.source} | Words: ${article.wordCount}`);
        console.log(`   Preview: ${article.fullText.substring(0, 150)}...`);
      });
    }
    
    const dbStats = await Article.countDocuments();
    console.log(`\n💾 Total articles in database: ${dbStats}`);
    
    console.log('\n💡 Next Steps:');
    console.log('   1. Start backend: npm start');
    console.log('   2. Start frontend: cd ../frontend && npm start');
    console.log('   3. Open: http://localhost:3000');
    console.log('   4. Click any article to see FULL CONTENT!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ FATAL ERROR:', error.message);
    console.error('\n💡 Check:');
    console.error('   • MongoDB connection string in .env');
    console.error('   • Internet connection');
    console.error('   • Firewall settings');
    process.exit(1);
  }
}

fetchAllNews();
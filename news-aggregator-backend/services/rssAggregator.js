// services/rssAggregator.js - RSS Feed Aggregation Service
const RSSParser = require('rss-parser');
const Article = require('../models/Article');
const { RSS_FEEDS } = require('../config/constants');

const parser = new RSSParser({
  timeout: 10000,
  headers: {
    'User-Agent': 'NewsAggregator/1.0 (https://github.com/yourusername/news-aggregator)'
  }
});

class RSSAggregator {
  
  async fetchFeed(feedConfig) {
    try {
      console.log(`📡 Fetching ${feedConfig.source}...`);
      
      const feed = await parser.parseURL(feedConfig.url);
      const articles = [];
      
      for (const item of feed.items) {
        // Skip if article already exists
        const exists = await Article.findOne({ url: item.link });
        if (exists) continue;
        
        // Create article document
        const article = {
          title: item.title,
          url: item.link,
          source: feedConfig.source,
          category: feedConfig.category,
          description: item.contentSnippet || item.summary || item.content?.substring(0, 200) || '',
          author: item.creator || item['dc:creator'] || 'Unknown',
          publishedAt: item.pubDate ? new Date(item.pubDate) : new Date(),
          imageUrl: this.extractImage(item),
          isProcessed: false
        };
        
        articles.push(article);
      }
      
      if (articles.length > 0) {
        await Article.insertMany(articles, { ordered: false });
        console.log(`✅ ${feedConfig.source}: Added ${articles.length} new articles`);
      } else {
        console.log(`ℹ️  ${feedConfig.source}: No new articles`);
      }
      
      return articles.length;
      
    } catch (error) {
      console.error(`❌ Error fetching ${feedConfig.source}:`, error.message);
      return 0;
    }
  }
  
  extractImage(item) {
    // Try different RSS image fields
    if (item.enclosure?.url && item.enclosure.url.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
      return item.enclosure.url;
    }
    
    if (item['media:thumbnail']?.['$']?.url) {
      return item['media:thumbnail']['$'].url;
    }
    
    if (item['media:content']?.['$']?.url) {
      return item['media:content']['$'].url;
    }
    
    // Try to find image in content
    if (item.content) {
      const imgMatch = item.content.match(/<img[^>]+src="([^">]+)"/);
      if (imgMatch && imgMatch[1]) return imgMatch[1];
    }
    
    return null;
  }
  
  async fetchAllFeeds() {
    console.log('🚀 Starting RSS aggregation...');
    const startTime = Date.now();
    
    const results = await Promise.allSettled(
      RSS_FEEDS.map(feed => this.fetchFeed(feed))
    );
    
    const totalArticles = results
      .filter(r => r.status === 'fulfilled')
      .reduce((sum, r) => sum + r.value, 0);
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`✅ Aggregation complete: ${totalArticles} new articles in ${duration}s`);
    
    return totalArticles;
  }
}

module.exports = new RSSAggregator();
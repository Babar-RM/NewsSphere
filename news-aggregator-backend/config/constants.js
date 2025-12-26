// config/constants.js - Application Constants
module.exports = {
    // Cache TTL (Time To Live) in seconds
    CACHE_TTL: {
      ARTICLES_LIST: 300,      // 5 minutes
      ARTICLE_DETAIL: 3600,    // 1 hour
      SUMMARY: 86400,          // 24 hours
      TRANSLATION: 86400,      // 24 hours
    },
    
    // Pagination
    DEFAULT_PAGE_SIZE: 20,
    MAX_PAGE_SIZE: 100,
    
    // Categories
    CATEGORIES: ['tech', 'business', 'sports', 'entertainment', 'world', 'other'],
    
    // RSS Feed Sources
    RSS_FEEDS: [
      { url: 'https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml', source: 'NYTimes', category: 'world' },
      { url: 'https://feeds.bbci.co.uk/news/rss.xml', source: 'BBC', category: 'world' },
      { url: 'https://techcrunch.com/feed/', source: 'TechCrunch', category: 'tech' },
      { url: 'https://www.theverge.com/rss/index.xml', source: 'The Verge', category: 'tech' },
      { url: 'https://www.espn.com/espn/rss/news', source: 'ESPN', category: 'sports' },
    ],
    
    // Worker settings
    WORKER_CONCURRENCY: {
      RSS_AGGREGATOR: 1,
      ARTICLE_EXTRACTOR: 2,
    },
    
    // Cron patterns
    CRON_PATTERNS: {
      RSS_FETCH: '*/15 * * * *', // Every 15 minutes
    },
  };
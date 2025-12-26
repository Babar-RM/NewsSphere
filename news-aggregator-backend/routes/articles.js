// routes/articles.js - API Routes for Articles
const express = require('express');
const router = express.Router();
const Article = require('../models/Article');
const redis = require('../config/redis');
const crypto = require('crypto');
const { DEFAULT_PAGE_SIZE, CACHE_TTL } = require('../config/constants');
const mlService = require('../services/mlService');
const translationService = require('../services/translationService');



// Helper: Generate cache key
const generateCacheKey = (prefix, params) => {
  const paramsStr = JSON.stringify(params);
  const hash = crypto.createHash('md5').update(paramsStr).digest('hex');
  return `${prefix}:${hash}`;
};

// GET /api/articles - List articles with pagination and filters
router.get('/', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = DEFAULT_PAGE_SIZE, 
      category, 
      source,
      search 
    } = req.query;
    
    const cacheKey = generateCacheKey('articles', { page, limit, category, source, search });
    
    // Check cache
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return res.json({ ...JSON.parse(cached), fromCache: true });
      }
    } catch (cacheError) {
      console.log('Cache miss or error:', cacheError.message);
    }
    
    // Build query
    const query = {};
    if (category) query.category = category;
    if (source) query.source = source;
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const [articles, total] = await Promise.all([
      Article.find(query)
        .sort({ publishedAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .select('-fullText -contentHash') // Don't send full text in list
        .lean(),
      Article.countDocuments(query)
    ]);
    
    const result = {
      articles,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    };
    
    // Cache result
    try {
      await redis.setex(cacheKey, CACHE_TTL.ARTICLES_LIST, JSON.stringify(result));
    } catch (cacheError) {
      console.log('Cache set error:', cacheError.message);
    }
    
    res.json(result);
    
  } catch (error) {
    console.error('❌ Error fetching articles:', error);
    res.status(500).json({ error: 'Failed to fetch articles' });
  }
});

// GET /api/articles/:id - Get single article with full text
router.get('/:id', async (req, res) => {
  try {
    const article = await Article.findById(req.params.id);
    
    if (!article) {
      return res.status(404).json({ error: 'Article not found' });
    }
    
    res.json(article);
    
  } catch (error) {
    console.error('❌ Error fetching article:', error);
    
    if (error.name === 'CastError') {
      return res.status(400).json({ error: 'Invalid article ID' });
    }
    
    res.status(500).json({ error: 'Failed to fetch article' });
  }
});

router.post('/:id/summarize', async (req, res) => {
  try {
    const { length = 'long' } = req.body; // Changed default to 'long'
    const article = await Article.findById(req.params.id);
    
    if (!article) {
      return res.status(404).json({ error: 'Article not found' });
    }
    
    const cacheKey = generateCacheKey('summary', { id: req.params.id, length });
    
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return res.json({ summary: cached, fromCache: true });
      }
    } catch (cacheError) {
      console.log('Cache error:', cacheError.message);
    }
    
    // Use LONGER text for better summary
    const textToSummarize = article.fullText || article.description;
    
    // If using Hugging Face
    if (process.env.HUGGINGFACE_API_KEY) {
      const mlService = require('../services/mlService');
      const summary = await mlService.summarize(textToSummarize, 'long');
      
      await redis.setex(cacheKey, CACHE_TTL.SUMMARY, summary);
      return res.json({ summary });
    }
    
    // Fallback: Generate 5-6 sentence summary
    const sentences = textToSummarize
      .split(/[.!?]+/)
      .map(s => s.trim())
      .filter(s => s.length > 30);
    
    const summaryLines = sentences.slice(0, 6).join('. ') + '.';
    
    await redis.setex(cacheKey, CACHE_TTL.SUMMARY, summaryLines);
    res.json({ summary: summaryLines });
    
  } catch (error) {
    console.error('❌ Error summarizing:', error);
    res.status(500).json({ error: 'Failed to summarize article' });
  }
});

// POST /api/articles/:id/translate - Translate to Urdu
router.post('/:id/translate', async (req, res) => {
  try {
    const { mode = 'summary' } = req.body; // 'summary' or 'full'
    const article = await Article.findById(req.params.id);
    
    if (!article) {
      return res.status(404).json({ error: 'Article not found' });
    }
    
    const cacheKey = generateCacheKey('translation-urdu', { id: req.params.id, mode });
    
    // Check cache
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        console.log('✅ Returning cached translation');
        return res.json({ translation: JSON.parse(cached), fromCache: true });
      }
    } catch (cacheError) {
      console.log('Cache error:', cacheError.message);
    }
    
    // Choose what to translate
    let textToTranslate = '';
    if (mode === 'full' && article.fullText) {
      textToTranslate = article.fullText;
    } else {
      textToTranslate = article.description || article.fullText?.substring(0, 1000) || '';
    }
    
    if (!textToTranslate) {
      return res.status(400).json({ error: 'No content to translate' });
    }
    
    console.log(`📝 Translating ${mode} (${textToTranslate.length} chars)...`);
    
    // Translate to Urdu
    const translatedTitle = await translationService.translateToUrdu(article.title);
    
    let translatedContent;
    if (mode === 'full' && textToTranslate.length > 5000) {
      translatedContent = await translationService.translateLongText(textToTranslate);
    } else {
      translatedContent = await translationService.translateToUrdu(textToTranslate);
    }
    
    const translation = {
      title: translatedTitle,
      content: translatedContent,
      language: 'Urdu (اردو)',
      mode: mode
    };
    
    // Cache result for 24 hours
    try {
      await redis.setex(cacheKey, 86400, JSON.stringify(translation));
      console.log('✅ Translation cached');
    } catch (cacheError) {
      console.log('Cache set error:', cacheError.message);
    }
    
    res.json({ translation });
    
  } catch (error) {
    console.error('❌ Error translating:', error);
    res.status(500).json({ 
      error: 'Failed to translate article',
      details: error.message 
    });
  }
});
// POST /api/articles/:id/tts - Generate Text-to-Speech
router.post('/:id/tts', async (req, res) => {
  try {
    const article = await Article.findById(req.params.id);
    
    if (!article) {
      return res.status(404).json({ error: 'Article not found' });
    }
    
    // Placeholder for TTS feature
    res.json({ 
      message: 'TTS feature coming soon',
      audioUrl: null
    });
    
  } catch (error) {
    console.error('❌ Error generating TTS:', error);
    res.status(500).json({ error: 'Failed to generate audio' });
  }
});

// Helper function: Generate mock summary
function generateMockSummary(article, length) {
  const sentences = article.description.split('.').filter(s => s.trim());
  
  let summaryLength;
  switch(length) {
    case 'short':
      summaryLength = 1;
      break;
    case 'long':
      summaryLength = Math.min(sentences.length, 4);
      break;
    default: // medium
      summaryLength = Math.min(sentences.length, 2);
  }
  
  return sentences.slice(0, summaryLength).join('. ').trim() + '.';
}

module.exports = router;
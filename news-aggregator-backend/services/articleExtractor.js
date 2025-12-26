// services/articleExtractor.js - Article Content Extraction Service
const axios = require('axios');
const { Readability } = require('@mozilla/readability');
const { JSDOM } = require('jsdom');
const Article = require('../models/Article');

class ArticleExtractor {
  
  async extractFullText(articleId) {
    try {
      const article = await Article.findById(articleId);
      
      if (!article) {
        throw new Error('Article not found');
      }
      
      if (article.isProcessed && article.fullText) {
        console.log(`ℹ️  Article already extracted: ${article.title}`);
        return article;
      }
      
      console.log(`📰 Extracting: ${article.title}`);
      
      // Fetch HTML
      const response = await axios.get(article.url, {
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        },
        maxRedirects: 5,
      });
      
      // Parse with Readability
      const dom = new JSDOM(response.data, { url: article.url });
      const reader = new Readability(dom.window.document);
      const parsed = reader.parse();
      
      if (!parsed) {
        throw new Error('Failed to extract readable content');
      }
      
      // Update article
      article.fullText = this.cleanText(parsed.textContent);
      article.isProcessed = true;
      article.extractedAt = new Date();
      
      // Update image if better one found
      if (!article.imageUrl && parsed.image) {
        article.imageUrl = parsed.image;
      }
      
      await article.save();
      
      console.log(`✅ Extracted: ${article.title}`);
      return article;
      
    } catch (error) {
      console.error(`❌ Extraction failed for article ${articleId}:`, error.message);
      
      // Mark as processed even if failed (don't retry endlessly)
      if (articleId) {
        try {
          await Article.findByIdAndUpdate(articleId, { 
            isProcessed: true,
            extractedAt: new Date()
          });
        } catch (updateError) {
          console.error('Failed to update article status:', updateError.message);
        }
      }
      
      throw error;
    }
  }
  
  cleanText(text) {
    return text
      .replace(/\s+/g, ' ')           // Normalize whitespace
      .replace(/\n{3,}/g, '\n\n')     // Max 2 newlines
      .replace(/\t+/g, ' ')           // Remove tabs
      .trim();
  }
  
  async extractBatch(limit = 10) {
    try {
      // Find unprocessed articles
      const articles = await Article.find({ isProcessed: false })
        .limit(limit)
        .select('_id title')
        .lean();
      
      if (articles.length === 0) {
        console.log('ℹ️  No unprocessed articles found');
        return 0;
      }
      
      console.log(`🔄 Processing batch of ${articles.length} articles...`);
      
      const results = await Promise.allSettled(
        articles.map(a => this.extractFullText(a._id))
      );
      
      const successful = results.filter(r => r.status === 'fulfilled').length;
      console.log(`✅ Batch complete: ${successful}/${articles.length} successful`);
      
      return successful;
      
    } catch (error) {
      console.error('❌ Batch extraction error:', error);
      return 0;
    }
  }
}

module.exports = new ArticleExtractor();
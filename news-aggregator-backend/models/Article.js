// models/Article.js - Article Database Schema
const mongoose = require('mongoose');
const crypto = require('crypto');

const articleSchema = new mongoose.Schema({
  // Basic Information
  title: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  url: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  source: {
    type: String,
    required: true,
    index: true
  },
  
  // Content
  description: {
    type: String,
    default: ''
  },
  fullText: {
    type: String,
    default: ''
  },
  
  // Metadata
  author: {
    type: String,
    default: 'Unknown'
  },
  publishedAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  category: {
    type: String,
    enum: ['tech', 'business', 'sports', 'world', 'entertainment', 'other'],
    default: 'other',
    index: true
  },
  
  // Media
  imageUrl: String,
  
  // Processing Status
  isProcessed: {
    type: Boolean,
    default: false,
    index: true
  },
  extractedAt: Date,
  
  // Deduplication
  contentHash: String,
  
}, {
  timestamps: true // Adds createdAt and updatedAt
});

// Compound Indexes for efficient queries
articleSchema.index({ publishedAt: -1, category: 1 });
articleSchema.index({ source: 1, publishedAt: -1 });
articleSchema.index({ isProcessed: 1, createdAt: 1 });

// Pre-save hook to generate content hash
articleSchema.pre('save', function(next) {
  if (this.fullText && this.isModified('fullText')) {
    this.contentHash = crypto
      .createHash('sha256')
      .update(this.fullText)
      .digest('hex');
  }
  next();
});

// Virtual for time ago
articleSchema.virtual('timeAgo').get(function() {
  const now = new Date();
  const diffMs = now - this.publishedAt;
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  
  if (diffHours < 1) return 'Just now';
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffHours < 48) return 'Yesterday';
  return this.publishedAt.toLocaleDateString();
});

// Enable virtuals in JSON
articleSchema.set('toJSON', { virtuals: true });
articleSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Article', articleSchema);
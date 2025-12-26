// services/translationService.js - Using translate-google package
const translate = require('translate-google');

class TranslationService {
  
  async translateToUrdu(text) {
    try {
      if (!text || text.trim().length === 0) {
        throw new Error('No text provided');
      }

      const textToTranslate = text.substring(0, 5000);
      
      console.log('🔄 Translating to Urdu...');
      
      const result = await translate(textToTranslate, { 
        from: 'en', 
        to: 'ur' 
      });
      
      console.log('✅ Translation complete');
      return result;
      
    } catch (error) {
      console.error('Translation error:', error.message);
      throw new Error('Failed to translate to Urdu');
    }
  }
  
  async translateLongText(text) {
    try {
      const maxChunkSize = 4000;
      const chunks = [];
      
      const paragraphs = text.split('\n\n').filter(p => p.trim());
      let currentChunk = '';
      
      for (const para of paragraphs) {
        if ((currentChunk + para).length < maxChunkSize) {
          currentChunk += para + '\n\n';
        } else {
          if (currentChunk) chunks.push(currentChunk.trim());
          currentChunk = para + '\n\n';
        }
      }
      
      if (currentChunk.trim()) chunks.push(currentChunk.trim());
      
      console.log(`🔄 Translating ${chunks.length} chunks...`);
      
      const translatedChunks = [];
      for (let i = 0; i < chunks.length; i++) {
        console.log(`   Chunk ${i + 1}/${chunks.length}...`);
        const result = await translate(chunks[i], { from: 'en', to: 'ur' });
        translatedChunks.push(result);
        
        if (i < chunks.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      console.log('✅ All chunks translated');
      return translatedChunks.join('\n\n');
      
    } catch (error) {
      console.error('Translation error:', error.message);
      throw new Error('Failed to translate');
    }
  }
}

module.exports = new TranslationService();
// services/mlService.js
const { HfInference } = require('@huggingface/inference');

class MLService {
  constructor() {
    this.hf = new HfInference(process.env.HUGGINGFACE_API_KEY);
  }

  async summarize(text, length = 'medium') {
    try {
      const maxLengthMap = {
        short: 50,
        medium: 130,
        long: 250
      };

      const result = await this.hf.summarization({
        model: 'facebook/bart-large-cnn',
        inputs: text.substring(0, 1024),
        parameters: {
          max_length: maxLengthMap[length],
          min_length: 20,
        }
      });

      return result.summary_text;
    } catch (error) {
      console.error('Summarization error:', error);
      throw new Error('Failed to generate summary');
    }
  }

  async translate(text, targetLang = 'es') {
    try {
      const modelMap = {
        'es': 'Helsinki-NLP/opus-mt-en-es',
        'fr': 'Helsinki-NLP/opus-mt-en-fr',
        'de': 'Helsinki-NLP/opus-mt-en-de',
        'zh': 'Helsinki-NLP/opus-mt-en-zh',
      };

      const model = modelMap[targetLang] || modelMap['es'];

      const result = await this.hf.translation({
        model: model,
        inputs: text.substring(0, 512),
      });

      return result.translation_text;
    } catch (error) {
      console.error('Translation error:', error);
      throw new Error('Failed to translate');
    }
  }
}

module.exports = new MLService();
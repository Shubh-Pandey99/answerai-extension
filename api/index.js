const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const app = express();

// Initialize the Google Generative AI client
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

app.get('/', (req, res) => {
  res.send('AI Meeting Assistant backend is running successfully!');
});

app.use(cors());
app.use(express.json());

app.post('/api/answer', async (req, res) => {
  if (!process.env.GOOGLE_API_KEY) {
    return res.status(500).json({ error: 'Google API key is not configured on the server.' });
  }

  console.log('Received request:', req.body);

  const { transcript, imageUrl } = req.body;

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-pro' });

    if (transcript) {
      const prompt = `Summarize this: ${transcript}`;
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      res.json({ answer: text });
    } else if (imageUrl) {
      // Placeholder for image analysis with a multimodal model like gemini-pro-vision
      // This requires a different implementation.
      res.json({ answer: 'Image analysis is not yet implemented.' });
    } else {
      res.status(400).json({ error: 'No transcript or imageUrl provided.' });
    }
  } catch (error) {
    console.error('Error calling Google AI API:', error);
    res.status(500).json({ error: 'Failed to get response from AI.' });
  }
});

module.exports = app;

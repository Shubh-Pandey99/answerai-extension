const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');
const app = express();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.get('/', (req, res) => {
  res.send('AI Meeting Assistant backend is running successfully!');
});

app.use(cors());
app.use(express.json());

app.post('/api/answer', async (req, res) => {
  console.log('Received request:', req.body);

  const { transcript, imageUrl } = req.body;

  try {
    if (transcript) {
      const completion = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: `Summarize this: ${transcript}` }],
      });
      res.json({ answer: completion.choices[0].message.content });
    } else if (imageUrl) {
      // Placeholder for image analysis with a multimodal model like gpt-4-vision-preview
      // This requires a different API structure.
      res.json({ answer: 'Image analysis is not yet implemented.' });
    } else {
      res.status(400).json({ error: 'No transcript or imageUrl provided.' });
    }
  } catch (error) {
    console.error('Error calling OpenAI API:', error);
    res.status(500).json({ error: 'Failed to get response from AI.' });
  }
});

module.exports = app;

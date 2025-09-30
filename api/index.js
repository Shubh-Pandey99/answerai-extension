const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const OpenAI = require('openai');
const app = express();

// --- Configuration ---
const AI_PROVIDER = process.env.AI_PROVIDER || 'mock'; // 'openai', 'google', or 'mock'

// --- Clients ---
let openAIClient, googleAIClient;

if (AI_PROVIDER === 'openai') {
  openAIClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

if (AI_PROVIDER === 'google') {
  googleAIClient = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
}

// --- Express App ---
app.get('/', (req, res) => {
  res.send(`AI Meeting Assistant backend is running with the "${AI_PROVIDER}" provider.`);
});

app.use(cors());
app.use(express.json());

app.post('/api/answer', async (req, res) => {
  console.log(`Received request on "${AI_PROVIDER}" provider:`, req.body);

  const { transcript } = req.body;

  try {
    let answer = 'Provider not configured correctly.';

    if (AI_PROVIDER === 'openai') {
      if (!process.env.OPENAI_API_KEY) throw new Error('OpenAI API key is not configured.');
      const completion = await openAIClient.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: `Summarize this: ${transcript}` }],
      });
      answer = completion.choices[0].message.content;

    } else if (AI_PROVIDER === 'google') {
      if (!process.env.GOOGLE_API_KEY) throw new Error('Google API key is not configured.');
      const model = googleAIClient.getGenerativeModel({ model: 'gemini-pro' });
      const result = await model.generateContent(`Summarize this: ${transcript}`);
      const response = await result.response;
      answer = response.text();

    } else { // Mock provider
      answer = `This is a mock summary of the transcript: "${transcript.substring(0, 50)}..."`;
    }

    res.json({ answer });

  } catch (error) {
    console.error(`Error with ${AI_PROVIDER} provider:`, error);
    res.status(500).json({ error: `Failed to get response from ${AI_PROVIDER}.` });
  }
});

module.exports = app;

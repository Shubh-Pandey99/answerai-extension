import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import handler from './api/answer.js';

dotenv.config({ path: '.env.local' });

const app = express();
const port = 3000;

// Use CORS middleware
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('AnswerAI server is running.');
});

app.post('/api/answer', (req, res) => {
  handler(req, res);
});

app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});

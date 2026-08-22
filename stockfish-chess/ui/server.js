const express = require('express');
const path = require('path');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = 6001;
const API_URL = 'http://stockfish-api:6000'; // Docker service name for internal communication

// Enable CORS
app.use(cors());

// Serve static files from both root and /stockfish-chess/
app.use(express.static(__dirname));
app.use('/stockfish-chess', express.static(__dirname));

// Parse JSON
app.use(express.json());

// Handle API calls with the path prefix
app.post('/stockfish-chess/api/best_move', async (req, res) => {
  try {
    const response = await axios.post(`${API_URL}/best_move`, req.body);
    res.json(response.data);
  } catch (error) {
    console.error('API Error:', error.message);
    res.status(500).json({ error: 'Failed to reach the Stockfish API' });
  }
});

app.post('/stockfish-chess/api/evaluate_move', async (req, res) => {
  try {
    const response = await axios.post(`${API_URL}/evaluate_move`, req.body);
    res.json(response.data);
  } catch (error) {
    console.error('API Error:', error.message);
    res.status(500).json({ error: 'Failed to reach the Stockfish API' });
  }
});

app.post('/stockfish-chess/api/analyze', async (req, res) => {
  try {
    const response = await axios.post(`${API_URL}/analyze`, req.body);
    res.json(response.data);
  } catch (error) {
    console.error('API Error:', error.message);
    res.status(500).json({ error: 'Failed to reach the Stockfish API' });
  }
});

// Serve index.html for all routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`UI server running at http://localhost:${PORT}`);
});
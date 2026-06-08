const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

// Enable CORS for all origins
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Serve static files
app.use(express.static('.'));

// Serve index.html at root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Proxy endpoint for Google Cloud Vision API
app.post('/api/vision', async (req, res) => {
  try {
    const { image } = req.body;
    
    const response = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${process.env.GOOGLE_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          requests: [{
            image: { content: image },
            features: [{ type: 'DOCUMENT_TEXT_DETECTION' }]
          }]
        })
      }
    );

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Vision API Error:', error);
    res.status(500).json({ 
      error: error.message,
      details: 'Failed to process image with Vision API'
    });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🟢 Journal Scanner proxy running on port ${PORT}`);
});

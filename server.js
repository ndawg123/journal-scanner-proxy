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

// Proxy endpoint for Notion API
app.post('/api/notion', async (req, res) => {
  try {
    const { databaseId, content, imageUrl } = req.body;
    
    const response = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.NOTION_TOKEN}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28'
      },
      body: JSON.stringify({
        parent: { database_id: databaseId },
        properties: {
          'Page': {
            title: [{
              text: {
                content: `Journal Entry - ${new Date().toLocaleDateString()}`
              }
            }]
          },
          'Content': {
            rich_text: [{
              text: {
                content: content ||  'No text extracted'
              }
            }]
          },
          'Date': {
            date: {
              start: new Date().toISOString().split('T')[0]
            }
          }
        },
        children: imageUrl ? [{
          object: 'block',
          type: 'image',
          image: {
            type: 'external',
            external: {
              url: imageUrl
            }
          }
        }] : []
      })
    });

    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || 'Notion API error');
    }

    res.json(data);
  } catch (error) {
    console.error('Notion API Error:', error);
    res.status(500).json({ 
      error: error.message,
      details: 'Failed to create Notion page'
    });
  }
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

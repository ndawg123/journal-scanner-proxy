const express = require('express');
const cors = require('cors');
const { Client } = require('@notionhq/client');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

app.post('/api/ocr', async (req, res) => {
  try {
    const { image, apiKey } = req.body;
    if (!apiKey) return res.status(400).json({ message: 'Missing API key' });
    
    const base64Image = image.split(',')[1];
    const response = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: [{ image: { content: base64Image }, features: [{ type: 'DOCUMENT_TEXT_DETECTION' }] }]
      })
    });
    
    const data = await response.json();
    res.json({ text: data.responses[0]?.fullTextAnnotation?.text || '' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post('/api/notion', async (req, res) => {
  try {
    const { token, databaseId, title, content, date, tags, source } = req.body;
    if (!token || !databaseId) return res.status(400).json({ message: 'Missing credentials' });
    
    const notion = new Client({ auth: token });
    const properties = { Name: { title: [{ text: { content: title || 'Untitled' } }] } };
    if (date) properties.Date = { date: { start: date } };
    if (tags?.length) properties.Tags = { multi_select: tags.map(tag => ({ name: tag })) };
    if (source) properties.Source = { select: { name: source } };
    
    const response = await notion.pages.create({
      parent: { database_id: databaseId },
      properties,
      children: content ? [{ object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content } }] } }] : []
    });
    
    res.json({ success: true, pageId: response.id });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post('/api/notion/databases/:id/query', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ message: "Missing Authorization" });
  
  try {
    const response = await fetch(`https://api.notion.com/v1/databases/${req.params.id}/query`, {
      method: "POST",
      headers: { Authorization: authHeader, "Content-Type": "application/json", "Notion-Version": "2022-06-28" },
      body: JSON.stringify(req.body)
    });
    res.json(await response.json());
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n📔 Journal Scanner proxy running on port ${PORT}\n`);
});

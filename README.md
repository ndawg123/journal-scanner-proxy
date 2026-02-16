# Journal Scanner - Handwritten Journal to Notion

A web application that scans handwritten journal pages, converts them to text using OCR (Google Cloud Vision API), and stores them in your Notion database.

## Features

- 📸 Capture journal pages using your phone camera
- 🤖 OCR conversion using Google Cloud Vision API
- 📝 Automatic upload to Notion database
- 🔍 Searchable handwritten entries
- 🖼️ Original images preserved in Notion
- 📱 Mobile-friendly interface
- ☁️ Cloud-deployed for access anywhere

## Prerequisites

Before you begin, you'll need:

1. **Notion Account** with an integration created
2. **Google Cloud Account** with Vision API enabled
3. **Render Account** (free tier works) for cloud deployment
4. **GitHub Account** for version control

## Setup Instructions

### Step 1: Clone the Repository

Open Terminal and run these commands (you can copy and paste the entire block):

```bash
cd ~/Desktop
git clone https://github.com/ndawg123/journal-scanner-proxy.git
cd journal-scanner-proxy
```

### Step 2: Get Your Notion Integration Token

1. Go to https://www.notion.so/my-integrations
2. Click "+ New integration"
3. Name it "Journal Scanner" and click Submit
4. Copy the "Internal Integration Secret" (starts with `secret_`)
5. Go to your Notion database and click the ••• menu → Add connections → Select your integration

### Step 3: Get Your Notion Database ID

1. Open your Notion database in a browser
2. The URL will look like: `https://www.notion.so/YOUR_WORKSPACE/DATABASE_ID?v=...`
3. Copy the DATABASE_ID part (32-character string)

### Step 4: Get Google Cloud Vision API Key

1. Go to https://console.cloud.google.com/
2. Create a new project or select existing one
3. Enable the Cloud Vision API
4. Go to "APIs & Services" → "Credentials"
5. Click "Create Credentials" → "API Key"
6. Copy the API key

### Step 5: Deploy to Render

1. Go to https://render.com and sign up/login
2. Click "New +" → "Web Service"
3. Connect your GitHub account
4. Select the `ndawg123/journal-scanner-proxy` repository
5. Configure the service:
   - **Name**: journal-scanner-proxy
   - **Environment**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
   - **Plan**: Free

6. Add Environment Variables (click "Add Environment Variable"):
   - `NOTION_TOKEN` = your Notion integration secret
   - `NOTION_DATABASE_ID` = your database ID
   - `GOOGLE_CLOUD_API_KEY` = your Google Cloud API key

7. Click "Create Web Service"
8. Wait for deployment (takes 2-3 minutes)
9. Your app will be available at: `https://journal-scanner-proxy.onrender.com`

### Step 6: Set Up Your Notion Database

Your Notion database needs these properties:
- **Title** (title) - Auto-created
- **Date** (date) - For journal entry date
- **Text** (rich text) - For OCR converted text
- **Image** (files & media) - For storing the original scanned image
- **Raw OCR** (rich text) - For storing raw OCR output

## Usage

1. Open your deployed app URL on your phone: `https://journal-scanner-proxy.onrender.com`
2. Take a photo of your journal page or upload an existing image
3. Click "Upload to Notion"
4. Wait for processing (usually 5-10 seconds)
5. Check your Notion database - new entry will appear with:
   - OCR-converted text
   - Original image
   - Current date

## Troubleshooting

### "Failed to upload" error
- Check that your environment variables are set correctly in Render
- Verify your Notion integration has access to the database
- Ensure your Google Cloud API key has Vision API enabled

### Image not uploading
- Make sure image size is under 10MB
- Check that you're using a supported format (JPG, PNG)

### OCR quality issues
- Ensure good lighting when photographing pages
- Keep the camera steady and page flat
- Try to capture the page straight-on (not at an angle)

## Technical Details

- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **Backend**: Node.js with Express
- **OCR**: Google Cloud Vision API
- **Database**: Notion API
- **Hosting**: Render (cloud platform)

## Security Notes

- Never commit your API keys to GitHub
- All sensitive credentials are stored as environment variables
- The app runs over HTTPS when deployed on Render

## Local Development

To run locally for testing:

```bash
cd ~/Desktop/journal-scanner-proxy
npm install

# Create a .env file with your credentials:
echo "NOTION_TOKEN=your_token_here" > .env
echo "NOTION_DATABASE_ID=your_db_id_here" >> .env
echo "GOOGLE_CLOUD_API_KEY=your_api_key_here" >> .env

# Start the server
node server.js
```

Then open http://localhost:3000 in your browser.

## License

MIT License - Feel free to modify and use for your own journal scanning needs!

## Support

For issues or questions, open an issue on the GitHub repository.

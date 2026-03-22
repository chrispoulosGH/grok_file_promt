# File Manager with MongoDB and Grok

This application allows you to upload files, tag them for organization, and query Grok with selected files.

## Features

- **File Upload**: Upload PDF, Word (.docx), and text files, extract text for AI processing
- **MongoDB Storage**: Persistent storage of file metadata, tags, and extracted text in MongoDB
- **Tag Management**: Add and remove custom tags for file organization
- **Category Filtering**: Filter files by tags for easy selection
- **Grok Integration**: Query Grok with selected files for AI-powered analysis
- **Synchronized Deletion**: Remove files from MongoDB

## Setup

### Prerequisites

1. **Node.js** (v14 or higher)
2. **MongoDB** - Choose one of the options below:

#### Option A: Local MongoDB Installation (Windows)

1. Download MongoDB Community Server from [mongodb.com](https://www.mongodb.com/try/download/community)
2. Install MongoDB following the installation wizard
3. Start MongoDB service:
   ```powershell
   net start MongoDB
   ```
4. Or run MongoDB manually:
   ```powershell
   "C:\Program Files\MongoDB\Server\6.0\bin\mongod.exe"
   ```

#### Option B: MongoDB Atlas (Cloud - Recommended)

1. Create a free account at [MongoDB Atlas](https://www.mongodb.com/atlas)
2. Create a new cluster
3. Get your connection string from the Atlas dashboard
4. Update the `MONGODB_URI` in your `server/.env` file

### Installation

1. Clone or download this repository
2. Install dependencies:
   ```bash
   cd server
   npm install
   cd ../client
   npm install
   ```

3. Configure environment variables:
   - Copy `server/.env.example` to `server/.env`
   - Add your Grok API key
   - Set MongoDB connection URI

4. Start the server:
   ```bash
   cd server
   npm start
   ```

5. In another terminal, start the client:
   ```bash
   cd client
   npm run dev
   ```

## API Endpoints

### Files
- `GET /files` - Get all files
- `POST /upload` - Upload files (multipart/form-data)
- `DELETE /files/:fileId` - Delete a file

### Tags
- `POST /files/:fileId/tags` - Add tags to a file
- `DELETE /files/:fileId/tags` - Remove tags from a file
- `GET /tags` - Get all unique tags
- `GET /files/categories?tags=tag1,tag2` - Get files by categories

### Grok Queries
- `POST /generate` - Query Grok with selected files

## Usage

1. **Upload Files**: Use the file upload section to add documents
2. **Tag Files**: Click "+ Add Tag" on any file to organize them
3. **Filter by Category**: Select one or more tags to view files with those tags
4. **Select Files**: Click "Select for Query" on files you want to include (optional)
5. **Query Grok**: Enter your prompt and generate responses. Grok will use selected files for analysis

## File Formats Supported

- PDF (.pdf)
- Microsoft Word (.docx) - automatically converted to text
- Plain text (.txt)

## Environment Variables

```env
GROK_API_KEY=your_grok_api_key
MONGODB_URI=mongodb://localhost:27017/filemanager
PORT=4000
```

## Troubleshooting

### MongoDB Connection Issues

If you see "MongoDB connection error":
- Ensure MongoDB is running locally, or
- Update `MONGODB_URI` to your MongoDB Atlas connection string
- Check firewall settings for port 27017 (local) or 27017 (Atlas)

### Grok API Issues

- Verify your `GROK_API_KEY` is correct
- Check your xAI account has API access
- Ensure you're using the correct API endpoints

## Architecture

- **Backend**: Node.js/Express server with MongoDB for persistence
- **Frontend**: React application for file management and Grok queries
- **Storage**: MongoDB for metadata and extracted text
- **AI**: Grok by xAI for document analysis and Q&A

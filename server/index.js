const path = require('path');
const crypto = require('crypto');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');
const cors = require('cors');
const mammoth = require('mammoth');
const pdfParse = require('pdf-parse');
const mongoose = require('mongoose');

const OPENAI_KEY = process.env.OPENAI_API_KEY;

const upload = multer({ dest: path.join(__dirname, 'uploads') });
const app = express();
app.use(cors());
app.use(express.json());

const GROK_KEY = process.env.GROK_API_KEY;
if (!GROK_KEY) {
  console.warn('Warning: GROK_API_KEY not set in environment');
}

const GROK_MODEL = process.env.GROK_MODEL || 'grok-beta';
const ENABLE_WEB_SEARCH = process.env.ENABLE_WEB_SEARCH !== 'false';

// Anthropic's built-in web search tool — search is executed server-side by Anthropic,
// so no custom search implementation is needed.
// web_search_20260209 is the version that supports claude-opus-4-6 / claude-sonnet-4-6
const WEB_SEARCH_TOOL = { type: 'web_search_20260209', name: 'web_search' };


// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/filemanager';
mongoose.connect(MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// File schema
const fileSchema = new mongoose.Schema({
  localFilename: { type: String, required: true },
  fileId:        { type: String, required: true, unique: true },
  contentType:   { type: String },
  fileContent:   { type: Buffer },   // original file bytes — enables download without local disk
  textContent:   { type: String },   // extracted text for AI processing
  uploadedAt:    { type: Date, default: Date.now },
  tags:          [{ type: String }]
});

const File = mongoose.model('File', fileSchema);

app.post('/upload', upload.array('files'), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'no files' });

    const results = [];

    for (const f of req.files) {
      const mimeType = f.mimetype;
      const isDocx = mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
                     f.originalname.endsWith('.docx');
      const isPdf = mimeType === 'application/pdf';
      const isPlaintext = ['text/plain', 'text/txt'].includes(mimeType);
      const isAudio = ['audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'audio/m4a',
                       'audio/webm', 'audio/ogg', 'video/webm'].includes(mimeType)
                   || /\.(mp3|wav|m4a|webm|ogg)$/i.test(f.originalname);
      const isImage = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(mimeType)
                   || /\.(jpg|jpeg|png|gif|webp)$/i.test(f.originalname);

      if (!isDocx && !isPdf && !isPlaintext && !isAudio && !isImage) {
        fs.unlink(f.path, () => {});
        return res.status(400).json({
          error: `Unsupported file format: ${mimeType}. Supported: PDF, Word, plaintext, audio (mp3/wav/m4a), and images (jpg/png/gif/webp).`
        });
      }

      let textContent = '';

      // Transcribe audio files via OpenAI Whisper
      if (isAudio) {
        if (!OPENAI_KEY) {
          fs.unlink(f.path, () => {});
          return res.status(400).json({ error: 'OPENAI_API_KEY not set — audio transcription unavailable.' });
        }
        try {
          console.log(`Transcribing ${f.originalname} via Whisper...`);
          const whisperForm = new FormData();
          whisperForm.append('file', fs.createReadStream(f.path), f.originalname);
          whisperForm.append('model', 'whisper-1');
          const whisperResp = await axios.post('https://api.openai.com/v1/audio/transcriptions', whisperForm, {
            headers: Object.assign({ 'Authorization': `Bearer ${OPENAI_KEY}` }, whisperForm.getHeaders())
          });
          textContent = `[Transcript of ${f.originalname}]\n\n${whisperResp.data.text}`;
          console.log(`Transcription done (${textContent.length} chars)`);
        } catch (err) {
          fs.unlink(f.path, () => {});
          return res.status(400).json({ error: `Audio transcription failed: ${err.response?.data?.error?.message || err.message}` });
        }
      }

      // Convert DOCX to plaintext
      else if (isDocx) {
        try {
          console.log(`Converting ${f.originalname} from DOCX to plaintext...`);
          const result = await mammoth.extractRawText({ path: f.path });
          textContent = result.value;
          console.log(`Conversion successful: ${textContent.length} chars`);
        } catch (err) {
          fs.unlink(f.path, () => {});
          return res.status(400).json({ error: `Failed to convert DOCX file: ${err.message}` });
        }
      }

      // Extract text from PDF
      else if (isPdf) {
        try {
          console.log(`Extracting text from ${f.originalname} PDF...`);
          const dataBuffer = fs.readFileSync(f.path);
          const data = await pdfParse(dataBuffer);
          textContent = data.text;
          console.log(`PDF text extraction successful: ${textContent.length} chars`);
        } catch (err) {
          fs.unlink(f.path, () => {});
          return res.status(400).json({ error: `Failed to extract text from PDF: ${err.message}` });
        }
      }

      // Read plaintext files
      else if (isPlaintext) {
        try {
          textContent = fs.readFileSync(f.path, 'utf-8');
          console.log(`Read plaintext file: ${textContent.length} chars`);
        } catch (err) {
          fs.unlink(f.path, () => {});
          return res.status(400).json({ error: `Failed to read text file: ${err.message}` });
        }
      }

      // For images, placeholder text
      else if (isImage) {
        textContent = `[Image file: ${f.originalname} - text extraction not supported]`;
      }

      // Read original file bytes into memory for storage in MongoDB
      const fileContent = fs.readFileSync(f.path);

      // Generate unique fileId
      const fileId = crypto.randomUUID();

      // Store in MongoDB
      const fileDoc = new File({
        localFilename: f.originalname,
        fileId,
        contentType:   mimeType,
        fileContent,
        textContent,
        uploadedAt:    new Date(),
        tags:          []
      });
      await fileDoc.save();
      results.push({ ...fileDoc.toObject(), fileContent: undefined }); // don't send bytes to client

      // Clean up multer temp file
      fs.unlink(f.path, () => {});
    }

    res.json({ uploaded: results });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/files', async (req, res) => {
  try {
    const files = await File.find().sort({ uploadedAt: -1 });
    res.json({ files });
  } catch (err) {
    console.error('Error fetching files:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Delete a file by fileId
app.delete('/files/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;
    console.log(`=== DELETE /files/${fileId} ===`);

    if (!fileId) {
      return res.status(400).json({ error: 'fileId required' });
    }

    // Find and remove from MongoDB
    const fileDoc = await File.findOneAndDelete({ fileId });
    if (!fileDoc) {
      return res.status(404).json({ error: 'File not found', fileId });
    }

    console.log(`Deleted from MongoDB: ${fileDoc.localFilename} (${fileId})`);

    res.json({
      success: true,
      filename: fileDoc.localFilename,
      fileId
    });
  } catch (err) {
    console.error('ERROR in DELETE /files/:fileId:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Download a file — streams original bytes from MongoDB to the browser
app.get('/files/:fileId/download', async (req, res) => {
  try {
    const { fileId } = req.params;
    const fileDoc = await File.findOne({ fileId });
    if (!fileDoc) return res.status(404).json({ error: 'File not found' });
    if (!fileDoc.fileContent) return res.status(404).json({ error: 'File content not available (re-upload to enable download)' });

    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileDoc.localFilename)}`);
    res.setHeader('Content-Type', fileDoc.contentType || 'application/octet-stream');
    res.send(fileDoc.fileContent);
  } catch (err) {
    console.error('ERROR in GET /files/:fileId/download:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Generate response using Grok API
app.post('/generate', async (req, res) => {
  try {
    const { messages } = req.body;
    console.log('=== /generate request ===');
    console.log('turns:', messages?.length);

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages array required' });
    }

    // Process messages to replace file references with text content
    const processedMessages = [];
    for (const msg of messages) {
      let messageText = '';

      if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type === 'text') {
            messageText += block.text + '\n\n';
          } else if (block.type === 'document' && block.source?.type === 'file') {
            // Fetch file text content
            const fileDoc = await File.findOne({ fileId: block.source.file_id });
            if (fileDoc && fileDoc.textContent) {
              messageText += `Content from ${fileDoc.localFilename}:\n\n${fileDoc.textContent}\n\n`;
            } else {
              messageText += `[File ${block.source.file_id} not found or no text content]\n\n`;
            }
          } else if (block.type === 'image' && block.source?.type === 'file') {
            // For images, add placeholder since Grok doesn't support image analysis like Claude
            const fileDoc = await File.findOne({ fileId: block.source.file_id });
            messageText += `[Image file: ${fileDoc?.localFilename || block.source.file_id} - image analysis not supported]\n\n`;
          }
        }
      } else {
        messageText = msg.content;
      }

      processedMessages.push({
        role: msg.role,
        content: messageText.trim()
      });
    }

    const headers = {
      'Authorization': `Bearer ${GROK_KEY}`,
      'Content-Type': 'application/json'
    };

    const payload = {
      model: GROK_MODEL,
      messages: processedMessages,
      max_tokens: 32000
    };

    console.log(`Calling Grok API with model ${GROK_MODEL}...`);
    console.log('Payload summary:', {
      model: payload.model,
      messageRoles: payload.messages.map(m => m.role)
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      console.error('Request timed out after 120s — aborting');
      controller.abort();
    }, 120000);

    let resp;
    try {
      resp = await axios.post('https://api.x.ai/v1/chat/completions', payload, {
        headers,
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeoutId);
    }

    // Transform Grok response to match expected format
    const responseData = {
      content: [{ type: 'text', text: resp.data.choices[0].message.content }],
      stop_reason: resp.data.choices[0].finish_reason === 'stop' ? 'end_turn' : resp.data.choices[0].finish_reason
    };

    console.log('Got response — stop_reason:', responseData.stop_reason);
    res.json(responseData);
  } catch (err) {
    console.error('ERROR in /generate:', err.response ? err.response.data : err.message);
    res.status(500).json({ error: err.message, details: err.response ? err.response.data : null });
  }
});

// Add tags to a file
app.post('/files/:fileId/tags', async (req, res) => {
  try {
    const { fileId } = req.params;
    const { tags } = req.body;

    if (!Array.isArray(tags)) {
      return res.status(400).json({ error: 'tags must be an array' });
    }

    const fileDoc = await File.findOneAndUpdate(
      { fileId },
      { $addToSet: { tags: { $each: tags } } },
      { new: true }
    );

    if (!fileDoc) {
      return res.status(404).json({ error: 'File not found' });
    }

    res.json({ file: fileDoc });
  } catch (err) {
    console.error('Error adding tags:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Remove tags from a file
app.delete('/files/:fileId/tags', async (req, res) => {
  try {
    const { fileId } = req.params;
    const { tags } = req.body;

    if (!Array.isArray(tags)) {
      return res.status(400).json({ error: 'tags must be an array' });
    }

    const fileDoc = await File.findOneAndUpdate(
      { fileId },
      { $pullAll: { tags: tags } },
      { new: true }
    );

    if (!fileDoc) {
      return res.status(404).json({ error: 'File not found' });
    }

    res.json({ file: fileDoc });
  } catch (err) {
    console.error('Error removing tags:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Get files by tags/categories
app.get('/files/categories', async (req, res) => {
  try {
    const { tags } = req.query;

    let query = {};
    if (tags) {
      const tagArray = tags.split(',').map(tag => tag.trim());
      query.tags = { $in: tagArray };
    }

    const files = await File.find(query).sort({ uploadedAt: -1 });
    
    // Group files by tags for easier frontend consumption
    const categories = {};
    files.forEach(file => {
      file.tags.forEach(tag => {
        if (!categories[tag]) {
          categories[tag] = [];
        }
        categories[tag].push(file);
      });
    });

    res.json({ files, categories });
  } catch (err) {
    console.error('Error fetching files by category:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Get all unique tags
app.get('/tags', async (req, res) => {
  try {
    const tags = await File.distinct('tags');
    res.json({ tags });
  } catch (err) {
    console.error('Error fetching tags:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Serve built React client in production (after `yarn build` in client/)
const clientDist = path.join(__dirname, '../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  console.log('Serving React client from', clientDist);
}

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Server listening on ${PORT}`));

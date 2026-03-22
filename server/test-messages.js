require('dotenv').config();
const axios = require('axios');

async function test() {
  try {
    const payload = {
      model: 'claude-opus-4-6',
      max_tokens: 2048,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'What is in this document?' },
            {
              type: 'document',
              source: {
                type: 'file',
                file_id: 'file_011CZBYe9ZgNdA6vat9pHLHR'
              }
            }
          ]
        }
      ]
    };

    const headers = {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-beta': 'files-api-2025-04-14',
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json'
    };

    console.log('Testing Messages API with headers:', headers);
    const resp = await axios.post('https://api.anthropic.com/v1/messages', payload, { headers });
    console.log('SUCCESS', resp.status, resp.data);
  } catch (err) {
    if (err.response) {
      console.log('ERROR', err.response.status, JSON.stringify(err.response.data, null, 2));
    } else {
      console.log('ERROR', err.message);
    }
  }
}

test();

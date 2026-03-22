const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

require('dotenv').config();
const key = process.env.ANTHROPIC_API_KEY;
if (!key) {
  console.error('ANHTROPIC_API_KEY not set');
  process.exit(1);
}

const endpoints = [
  'https://api.anthropic.com/v1/files',
  'https://api.anthropic.com/v1beta/files',
  'https://api.anthropic.com/v1alpha1/files',
  'https://api.anthropic.com/v1alpha/files',
  'https://api.anthropic.com/v1beta1/files'
];

async function test() {
  for (const url of endpoints) {
    try {
      const form = new FormData();
      form.append('file', fs.createReadStream('test-upload.txt'));
      const headers = Object.assign({ 
        'x-api-key': key,
        'anthropic-beta': 'files-api-2025-04-14',
        'anthropic-version': '2025-04-14'
      }, form.getHeaders());
      const resp = await axios.post(url, form, { headers, timeout: 10000 });
      console.log(url, '->', resp.status, resp.data);
    } catch (err) {
      if (err.response) {
        console.log(url, '->', err.response.status, JSON.stringify(err.response.data));
      } else {
        console.log(url, '->', err.message);
      }
    }
  }
}

test();

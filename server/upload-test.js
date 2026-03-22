require('dotenv').config();
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

async function run() {
  const form = new FormData();
  form.append('files', fs.createReadStream('test-upload.txt'));
  const headers = Object.assign({
    'x-api-key': process.env.ANTHROPIC_API_KEY,
    'anthropic-beta': 'files-api-2025-04-14',
    'anthropic-version': '2023-06-01'
  }, form.getHeaders());
  try {
    const resp = await axios.post('http://localhost:4000/upload', form, { headers });
    console.log('OK', resp.data);
  } catch (err) {
    if (err.response) {
      console.error('STATUS', err.response.status);
      console.error('DATA', JSON.stringify(err.response.data));
    } else {
      console.error(err.message);
    }
  }
}

run();

require('dotenv').config();
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

async function test() {
  try {
    const form = new FormData();
    form.append('file', fs.createReadStream('test-upload.txt'));
    const headers = Object.assign({
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-beta': 'files-api-2025-04-14',
      'anthropic-version': '2023-06-01'
    }, form.getHeaders());
    const resp = await axios.post('https://api.anthropic.com/v1/files', form, { headers, timeout: 10000 });
    console.log('SUCCESS', resp.status, resp.data);
  } catch (err) {
    if (err.response) {
      console.log('ERROR', err.response.status, JSON.stringify(err.response.data));
    } else {
      console.log('ERROR', err.message);
    }
  }
}

test();

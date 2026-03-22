require('dotenv').config();
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

const key = process.env.ANTHROPIC_API_KEY;
const versions = [
  '2025-04-14',
  '2024-06-20',
  '2024-05-15',
  '2024-04-22',
  '2024-04-01',
  '2024-01-15',
  '2025-04',
  '2025-04-14-preview'
];

async function test() {
  for (const v of versions) {
    try {
      const form = new FormData();
      form.append('file', fs.createReadStream('test-upload.txt'));
      const headers = Object.assign({
        'x-api-key': key,
        'anthropic-beta': 'files-api-2025-04-14',
        'anthropic-version': v
      }, form.getHeaders());
      const resp = await axios.post('https://api.anthropic.com/v1/files', form, { headers, timeout: 5000 });
      console.log(v, '->', resp.status, 'SUCCESS');
    } catch (err) {
      if (err.response) {
        console.log(v, '->', err.response.status, err.response.data?.error?.message || JSON.stringify(err.response.data));
      } else {
        console.log(v, '->', 'timeout/network error');
      }
    }
  }
}

test();

const axios = require('axios');

async function test() {
  try {
    const resp = await axios.post('http://localhost:4000/generate', {
      prompt: 'What is in this document?',
      fileIds: ['file_011CZBYe9ZgNdA6vat9pHLHR']
    });
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

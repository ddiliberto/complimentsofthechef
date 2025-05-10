require('dotenv').config();
const axios = require('axios');

const endpoint = 'https://openrouter.ai/api/v1/chat/completions';

async function generateListing(word) {
  const prompt = `
Write Etsy product copy for a sweatshirt that says "${word}" in bold collegiate font.
Tone: foodie, funny, preppy, Etsy-optimized.
Output JSON like:
{
  "word": "${word}",
  "title": "...",
  "emojis": "...",
  "description": "...",
  "tags": ["..."]
}
`;

  const response = await axios.post(
    endpoint,
    {
      model: "openai/gpt-4",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.85
    },
    {
      headers: {
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json"
      }
    }
  );

  const message = response.data.choices[0].message.content;

  try {
    return JSON.parse(message);
  } catch (e) {
    console.error("❌ Failed to parse JSON. Raw response:", message);
    throw e;
  }
}

module.exports = generateListing;

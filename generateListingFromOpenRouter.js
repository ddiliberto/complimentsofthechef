require('dotenv').config();
const axios = require('axios');

const endpoint = 'https://openrouter.ai/api/v1/chat/completions';

async function generateListing(word) {
  const prompt = `
Write Etsy product copy for a sweatshirt that says "${word}" in bold collegiate font.
Follow this exact format:

TITLE:
${word} Sweatshirt - Cute Oversized Unisex Crewneck, A Perfect Gift for ${word} Lovers and [CUISINE] Enthusiasts.

DESCRIPTION:
[FOOD-SPECIFIC EMOJIS]
Ready to look cute and feel cozy? Our "${word}" sweatshirt, a nod to [CUISINE] culture and a love of delicious food. Whether you're a fan of [RELATED FOODS], or other popular dishes, this preppy and oversized unisex sweatshirt is the perfect way to show off your passion for all things [CUISINE]. Made from soft, air-jet spun yarn, this classic fit sweater offers a comfortable and cozy fit that's perfect for any casual occasion. With its preppy and college-inspired style, this sweatshirt is the ideal choice for anyone who wants to make a statement with their fashion choices. So why wait? Show your love for [CUISINE] culture and your appreciation for delicious food with the "${word}" sweatshirt today!

---Standard sections below with food-specific emojis---

[FOOD-SPECIFIC EMOJIS] - DETAILS

• 50% cotton, 50% polyester
• Pre-shrunk
• Classic fit
• 1x1 athletic rib knit collar with spandex
• Air-jet spun yarn with a soft feel and reduced pilling
• Double-needle stitched collar, shoulders, armholes, cuffs, and hem

[FOOD-SPECIFIC EMOJIS] - FAST PROCESSING

After you place the order, it goes into production the same day. All orders are processed individually.

[FOOD-SPECIFIC EMOJIS] - 100% SATISFACTION GUARANTEE

If you have any comments or concerns always feel free to contact us. It is our goal to provide quality products with the highest level of customer satisfaction.

[FOOD-SPECIFIC EMOJIS] - FEEDBACK

We are a new Etsy store, so please, leave us feedback, as we are always looking for ways to improve our service. Thank you for your business, your support, and your continued feedback.

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
    // Clean the message to handle potential control characters
    const cleanedMessage = message
      .replace(/[\n\r]/g, ' ') // Replace newlines with spaces
      .replace(/\s+/g, ' ')    // Replace multiple spaces with a single space
      .replace(/\\n/g, '\\\\n') // Escape newlines in JSON strings
      .replace(/\\r/g, '\\\\r') // Escape carriage returns in JSON strings
      .replace(/\\t/g, '\\\\t'); // Escape tabs in JSON strings
    
    // Try to extract JSON from the message using regex
    const jsonMatch = cleanedMessage.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch (innerError) {
        console.error("❌ Failed to parse extracted JSON. Trying alternative method.");
      }
    }
    
    // If regex extraction fails, try to parse the original message
    try {
      return JSON.parse(message);
    } catch (originalError) {
      // If all parsing attempts fail, create a structured object manually
      console.error("❌ Failed to parse JSON. Creating structured object manually.");
      
      // Extract title, emojis, description, and tags using regex
      const titleMatch = message.match(/\"title\":\s*\"([^\"]+)\"/);
      const emojisMatch = message.match(/\"emojis\":\s*\"([^\"]+)\"/);
      const descriptionMatch = message.match(/\"description\":\s*\"([^\"]+)\"/);
      const tagsMatch = message.match(/\"tags\":\s*\[(.*?)\]/);
      
      const title = titleMatch ? titleMatch[1] : "";
      const emojis = emojisMatch ? emojisMatch[1] : "";
      const description = descriptionMatch ? descriptionMatch[1] : "";
      const tagsString = tagsMatch ? tagsMatch[1] : "";
      
      // Parse tags
      const tags = tagsString
        .split(',')
        .map(tag => tag.trim().replace(/^"|"$/g, ''))
        .filter(tag => tag);
      
      return {
        word: message.includes(word) ? word : "",
        title,
        emojis,
        description,
        tags
      };
    }
  } catch (e) {
    console.error("❌ Failed to parse JSON. Raw response:", message);
    throw e;
  }
}

module.exports = generateListing;

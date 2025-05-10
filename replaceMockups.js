
// replaceMockups.js — Upload custom mockups and replace default images on Printful

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const FormData = require("form-data");

const PRINTFUL_API_KEY = process.env.PRINTFUL_API_KEY;
const EXPORT_DIR = path.join(__dirname, "export-mockups");

// Replace these with your real mappings
const productVariantMap = {
  "TACOS": {
    "NAVY": 4012_64,
    "SAND": 4012_60
  },
  "YOGURT": {
    "NAVY": 4012_64,
    "SAND": 4012_60
  }
};

async function uploadImageToPrintful(filePath) {
  const form = new FormData();
  form.append("file", fs.createReadStream(filePath));
  form.append("purpose", "mockup");

  const res = await axios.post("https://api.printful.com/files", form, {
    headers: {
      Authorization: `Bearer ${PRINTFUL_API_KEY}`,
      ...form.getHeaders()
    }
  });

  return res.data.result.id;
}

async function attachImageToVariant(productId, variantId, fileId) {
  const res = await axios.post(
    `https://api.printful.com/store/products/${productId}/sync-variant/${variantId}/images`,
    {
      image_id: fileId,
      position: "front"
    },
    {
      headers: {
        Authorization: `Bearer ${PRINTFUL_API_KEY}`
      }
    }
  );

  return res.data;
}

async function replaceMockups() {
  const products = fs.readdirSync(EXPORT_DIR);

  for (const product of products) {
    const productDir = path.join(EXPORT_DIR, product);
    const files = fs.readdirSync(productDir);

    for (const file of files) {
      const filePath = path.join(productDir, file);
      const color = file
        .replace(`${product}-`, "")
        .replace(".png", "")
        .toUpperCase();

      const variantId = productVariantMap[product]?.[color];
      if (!variantId) {
        console.warn(`⚠️ No variant ID found for ${product} ${color}`);
        continue;
      }

      const fileId = await uploadImageToPrintful(filePath);
      console.log(`✅ Uploaded ${file} as file_id: ${fileId}`);

      const attachResult = await attachImageToVariant(product, variantId, fileId);
      console.log(`🔁 Replaced image for variant ${variantId} on ${product}`);
    }
  }
}

replaceMockups().catch(err => {
  console.error("❌ Error:", err.response?.data || err.message);
});

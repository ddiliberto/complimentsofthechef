// cloudinaryUploader.js
const cloudinary = require('cloudinary').v2;
require('dotenv').config();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Uploads an image to Cloudinary and returns the direct secure URL
 * @param {string} filePath
 * @returns {Promise<string>} secure URL
 */
async function uploadToCloudinary(filePath) {
  try {
    const result = await cloudinary.uploader.upload(filePath, {
      folder: 'printful_uploads',
      use_filename: true,
      unique_filename: false,
      overwrite: true,
    });
    console.log(`✅ Cloudinary upload success: ${result.secure_url}`);
    return result.secure_url;
  } catch (err) {
    console.error(`❌ Cloudinary upload failed: ${err.message}`);
    throw err;
  }
}

module.exports = { uploadToCloudinary };
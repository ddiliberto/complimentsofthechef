/**
 * fileUploader.js
 * 
 * This module provides a unified file upload strategy using Cloudinary.
 * It uploads files directly to Cloudinary and returns the secure URL.
 */

const { uploadToCloudinary } = require('./cloudinaryUploader');
const path = require('path');
const fs = require('fs');

/**
 * Upload file with fallback strategy
 * @param {string} filePath - Path to local file
 * @param {boolean} enableDropboxFallback - Deprecated parameter, kept for backward compatibility
 * @returns {Promise<string>} File URL on Cloudinary
 */
async function uploadFileWithFallbackStrategy(filePath, enableDropboxFallback = false) {
  const fileName = path.basename(filePath);
  console.log(`🚀 Starting upload process for ${fileName}...`);
  
  try {
    // Upload to Cloudinary
    console.log(`⏳ Uploading to Cloudinary...`);
    return await uploadToCloudinary(filePath);
  } catch (err) {
    console.error(`❌ Cloudinary upload failed: ${err.message}`);
    
    // We no longer use Dropbox as fallback, so we just throw the error
    if (enableDropboxFallback) {
      console.log(`⚠️ Dropbox fallback is no longer supported. Please update your code.`);
    }
    
    throw err;
  }
}

/**
 * Check if a file exists and is accessible
 * @param {string} filePath - Path to file
 * @returns {boolean} Whether the file exists and is accessible
 */
function fileExists(filePath) {
  try {
    fs.accessSync(filePath, fs.constants.F_OK | fs.constants.R_OK);
    return true;
  } catch (error) {
    return false;
  }
}

module.exports = {
  uploadFileWithFallbackStrategy,
  fileExists
};
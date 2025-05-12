/**
 * printfulUploader.js
 * 
 * This module handles direct file uploads to Printful's API.
 * It provides a reliable way to upload files with retry logic and error handling.
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');

// Configuration
require('dotenv').config();
const PRINTFUL_API_KEY = process.env.PRINTFUL_API_KEY;

// Create Axios instance for Printful API
const printfulApi = axios.create({
  baseURL: 'https://api.printful.com',
  headers: {
    'Authorization': `Bearer ${PRINTFUL_API_KEY}`
  }
});

/**
 * Upload file directly to Printful
 * @param {string} filePath - Path to local file
 * @param {number} maxRetries - Maximum number of retries
 * @param {number} retryDelay - Delay between retries in ms
 * @returns {Promise<string>} Printful file URL
 */
async function uploadFileToPrintful(filePath, maxRetries = 3, retryDelay = 2000) {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`⏳ Uploading file directly to Printful (attempt ${attempt}/${maxRetries})...`);
      
      // Get file stats for size information
      const stats = fs.statSync(filePath);
      console.log(`📊 File size: ${(stats.size / 1024).toFixed(2)} KB`);
      
      // Check if file size is within Printful's limits (typically 200MB)
      if (stats.size > 200 * 1024 * 1024) {
        throw new Error('File size exceeds Printful\'s 200MB limit');
      }
      
      const fileName = path.basename(filePath);
      
      // Create form data with file for multipart upload
      const form = new FormData();
      form.append('file', fs.createReadStream(filePath));
      form.append('type', 'print_file');
      
      // Upload to Printful using multipart/form-data
      const response = await axios.post('https://api.printful.com/files', form, {
        headers: {
          'Authorization': `Bearer ${PRINTFUL_API_KEY}`,
          ...form.getHeaders()
        }
      });
      
      if (response.data && response.data.result && response.data.result.url) {
        console.log(`✅ File uploaded directly to Printful: ${fileName}`);
        return response.data.result.url;
      } else {
        throw new Error('Invalid response from Printful API');
      }
    } catch (error) {
      lastError = error;
      
      // Check if this is a server error that might be temporary
      const isServerError = error.response && error.response.status >= 500;
      const isRateLimitError = error.response && error.response.status === 429;
      
      if ((isServerError || isRateLimitError) && attempt < maxRetries) {
        console.log(`⚠️ Temporary error: ${error.message}`);
        console.log(`⏳ Retrying in ${retryDelay / 1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        // Increase delay for next retry
        retryDelay *= 1.5;
      } else {
        console.error(`❌ Error uploading file to Printful:`, error.message);
        if (error.response) {
          console.error('❌ Server responded with:', error.response.status, error.response.data);
        }
        break;
      }
    }
  }
  
  // If we've exhausted all retries, throw the last error
  throw lastError;
}

/**
 * Check if Printful API is accessible
 * @returns {Promise<boolean>} Whether the API is accessible
 */
async function checkPrintfulApiAccess() {
  try {
    const response = await printfulApi.get('/stores');
    return response.status === 200;
  } catch (error) {
    console.error('❌ Error accessing Printful API:', error.message);
    return false;
  }
}

/**
 * Upload file to Printful using a URL
 * @param {string} fileUrl - URL of the file (can be a data URI)
 * @param {string} fileName - Name of the file
 * @returns {Promise<string>} Printful file URL
 */
async function uploadFileUrlToPrintful(fileUrl, fileName, maxRetries = 3, retryDelay = 2000) {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`⏳ Uploading file URL to Printful (attempt ${attempt}/${maxRetries})...`);
      
      // Upload file to Printful using URL
      const response = await printfulApi.post('/files', {
        url: fileUrl,
        type: 'default',
        filename: fileName,
        visible: true
      });
      
      if (response.data && response.data.result && response.data.result.url) {
        console.log(`✅ File uploaded directly to Printful: ${fileName}`);
        return response.data.result.url;
      } else {
        console.error('❌ Invalid response structure:', JSON.stringify(response.data));
        throw new Error('Invalid response from Printful file upload');
      }
    } catch (error) {
      lastError = error;
      
      // Check if this is a server error that might be temporary
      const isServerError = error.response && error.response.status >= 500;
      const isRateLimitError = error.response && error.response.status === 429;
      
      if ((isServerError || isRateLimitError) && attempt < maxRetries) {
        console.log(`⚠️ Temporary error: ${error.message}`);
        console.log(`⏳ Retrying in ${retryDelay / 1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        // Increase delay for next retry
        retryDelay *= 1.5;
      } else {
        console.error(`❌ Error uploading file to Printful:`, error.message);
        if (error.response) {
          console.error('❌ Server responded with:', error.response.status, error.response.data);
        }
        break;
      }
    }
  }
  
  // If we've exhausted all retries, throw the last error
  throw lastError;
}

module.exports = {
  uploadFileToPrintful,
  uploadFileUrlToPrintful,
  checkPrintfulApiAccess
};
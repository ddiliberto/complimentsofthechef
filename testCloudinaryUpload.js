/**
 * testCloudinaryUpload.js
 * 
 * This script tests the Cloudinary upload functionality.
 * It uploads a test image to Cloudinary and verifies the URL is returned.
 */

require('dotenv').config();
const path = require('path');
const fs = require('fs');
const { uploadToCloudinary } = require('./cloudinaryUploader');
const { uploadFileWithFallbackStrategy } = require('./fileUploader');

// Find a PNG file to test with
async function findTestImage() {
  const exportDir = path.join(__dirname, 'export');
  
  try {
    const files = await fs.promises.readdir(exportDir);
    const pngFiles = files.filter(file => file.toLowerCase().endsWith('.png'));
    
    if (pngFiles.length === 0) {
      console.error('❌ No PNG files found in the export directory');
      return null;
    }
    
    return path.join(exportDir, pngFiles[0]);
  } catch (error) {
    console.error('❌ Error reading export directory:', error.message);
    return null;
  }
}

// Test direct Cloudinary upload
async function testDirectCloudinaryUpload(filePath) {
  console.log(`\n🧪 Testing direct Cloudinary upload...`);
  try {
    const url = await uploadToCloudinary(filePath);
    console.log(`✅ Direct Cloudinary upload successful!`);
    console.log(`🔗 URL: ${url}`);
    return true;
  } catch (error) {
    console.error(`❌ Direct Cloudinary upload failed:`, error.message);
    return false;
  }
}

// Test upload through fileUploader
async function testFileUploaderStrategy(filePath) {
  console.log(`\n🧪 Testing fileUploader strategy...`);
  try {
    const url = await uploadFileWithFallbackStrategy(filePath);
    console.log(`✅ FileUploader strategy successful!`);
    console.log(`🔗 URL: ${url}`);
    return true;
  } catch (error) {
    console.error(`❌ FileUploader strategy failed:`, error.message);
    return false;
  }
}

// Main test function
async function runTests() {
  console.log(`🚀 Starting Cloudinary upload tests...`);
  
  // Check if Cloudinary credentials are set
  if (!process.env.CLOUDINARY_CLOUD_NAME || 
      !process.env.CLOUDINARY_API_KEY || 
      !process.env.CLOUDINARY_API_SECRET) {
    console.error(`❌ Cloudinary credentials not found in .env file`);
    console.log(`Please add the following to your .env file:`);
    console.log(`CLOUDINARY_CLOUD_NAME=your_cloud_name`);
    console.log(`CLOUDINARY_API_KEY=your_api_key`);
    console.log(`CLOUDINARY_API_SECRET=your_api_secret`);
    return;
  }
  
  // Find a test image
  const testImage = await findTestImage();
  if (!testImage) {
    console.log(`Please add a PNG image to the export directory for testing`);
    return;
  }
  
  console.log(`📁 Using test image: ${testImage}`);
  
  // Run tests
  const directResult = await testDirectCloudinaryUpload(testImage);
  const uploaderResult = await testFileUploaderStrategy(testImage);
  
  // Summary
  console.log(`\n📋 Test Summary:`);
  console.log(`Direct Cloudinary Upload: ${directResult ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`FileUploader Strategy: ${uploaderResult ? '✅ PASS' : '❌ FAIL'}`);
  
  if (directResult && uploaderResult) {
    console.log(`\n🎉 All tests passed! Cloudinary integration is working correctly.`);
  } else {
    console.log(`\n⚠️ Some tests failed. Please check the error messages above.`);
  }
}

// Run the tests
runTests().catch(error => {
  console.error(`❌ Unexpected error:`, error);
});
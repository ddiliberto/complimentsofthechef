/**
 * Test script for Dropbox token refresh implementation
 * 
 * This script tests the Dropbox token refresh functionality by:
 * 1. Initializing the token manager
 * 2. Getting a Dropbox client with auto-refresh capability
 * 3. Making a simple API call to test the connection
 */

require('dotenv').config();
const { getDropboxClient, initializeTokenManager } = require('./dropboxTokenManager');
const { uploadFileWithFallbackStrategy } = require('./fileUploader');
const path = require('path');
const fs = require('fs');

// Test file path (using an existing PNG file from the export directory)
const TEST_FILE_PATH = path.join(__dirname, 'export', 'PASTA.png');

/**
 * Test the Dropbox token manager
 */
async function testTokenManager() {
  console.log('🧪 Testing Dropbox token manager...');
  
  try {
    // Initialize the token manager
    console.log('⏳ Initializing token manager...');
    await initializeTokenManager();
    
    // Get a Dropbox client
    console.log('⏳ Getting Dropbox client...');
    const dbx = await getDropboxClient();
    
    // Test the connection with a simple API call
    console.log('⏳ Testing connection...');
    const accountInfo = await dbx.usersGetCurrentAccount();
    
    // Display account info
    const email = accountInfo?.email || 'unknown email';
    const displayName = accountInfo.name ?
      (accountInfo.name.display_name || accountInfo.name.familiar_name || accountInfo.name.given_name || 'Unknown') :
      'Unknown';
    
    console.log(`✅ Successfully connected to Dropbox as: ${displayName} (${email})`);
    return true;
  } catch (error) {
    console.error('❌ Error testing token manager:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
      console.error('Response status:', error.response.status);
    }
    return false;
  }
}

/**
 * Test the file upload strategy
 */
async function testFileUpload() {
  console.log('\n🧪 Testing file upload strategy...');
  
  // Check if test file exists
  if (!fs.existsSync(TEST_FILE_PATH)) {
    console.error(`❌ Test file not found: ${TEST_FILE_PATH}`);
    console.log('Please make sure you have at least one PNG file in the export directory.');
    return false;
  }
  
  try {
    // Test direct upload to Printful
    console.log('⏳ Testing direct upload to Printful...');
    console.log(`⏳ Uploading file: ${TEST_FILE_PATH}`);
    
    // Use the upload strategy with direct upload (no Dropbox fallback)
    const fileUrl = await uploadFileWithFallbackStrategy(TEST_FILE_PATH, false);
    
    console.log(`✅ File successfully uploaded: ${fileUrl}`);
    return true;
  } catch (error) {
    console.error('❌ Error testing file upload:', error.message);
    
    // Try with Dropbox fallback
    console.log('\n⏳ Testing upload with Dropbox fallback...');
    try {
      const fileUrl = await uploadFileWithFallbackStrategy(TEST_FILE_PATH, true);
      console.log(`✅ File successfully uploaded with fallback: ${fileUrl}`);
      return true;
    } catch (fallbackError) {
      console.error('❌ Error with fallback upload:', fallbackError.message);
      return false;
    }
  }
}

/**
 * Main test function
 */
async function runTests() {
  console.log('🚀 Starting Dropbox token refresh tests...');
  
  // Test token manager
  const tokenManagerSuccess = await testTokenManager();
  
  // Test file upload if token manager test passed
  let fileUploadSuccess = false;
  if (tokenManagerSuccess) {
    fileUploadSuccess = await testFileUpload();
  }
  
  // Print summary
  console.log('\n📊 Test Summary:');
  console.log(`Token Manager: ${tokenManagerSuccess ? '✅ Success' : '❌ Failed'}`);
  console.log(`File Upload: ${fileUploadSuccess ? '✅ Success' : '❌ Failed'}`);
  
  if (tokenManagerSuccess && fileUploadSuccess) {
    console.log('\n✨ All tests passed! The implementation is working correctly.');
  } else {
    console.log('\n⚠️ Some tests failed. Please check the error messages above.');
  }
}

// Run the tests
runTests().catch(error => {
  console.error('❌ Unhandled error:', error);
  process.exit(1);
});
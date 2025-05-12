/**
 * migrateDropboxToken.js
 * 
 * This script helps migrate from the legacy Dropbox access token to the OAuth 2.0 flow.
 * It will guide the user through setting up a Dropbox app and obtaining OAuth credentials.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { migrateFromLegacyToken, initializeTokenManager } = require('./dropboxTokenManager');

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

/**
 * Ask a question and get user input
 * @param {string} question - Question to ask
 * @returns {Promise<string>} User's answer
 */
function askQuestion(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

/**
 * Main migration function
 */
async function main() {
  console.log('\n🔄 Dropbox Token Migration Utility');
  console.log('===============================\n');
  console.log('This utility will help you migrate from the legacy Dropbox access token');
  console.log('to the more secure OAuth 2.0 flow with automatic token refresh.\n');

  // Check if we have the legacy token
  const legacyToken = process.env.DROPBOX_ACCESS_TOKEN;
  if (!legacyToken) {
    console.error('❌ No legacy Dropbox access token found in .env file.');
    console.log('Please make sure DROPBOX_ACCESS_TOKEN is set in your .env file.');
    rl.close();
    return;
  }

  console.log('✅ Found legacy Dropbox access token in .env file.');
  
  // Check if we have OAuth credentials
  const appKey = process.env.DROPBOX_APP_KEY;
  const appSecret = process.env.DROPBOX_APP_SECRET;
  
  if (!appKey || !appSecret || appKey === 'your_dropbox_app_key' || appSecret === 'your_dropbox_app_secret') {
    console.log('\n⚠️ Dropbox OAuth credentials not found or not configured.');
    console.log('\nTo set up OAuth, you need to create a Dropbox app:');
    console.log('1. Go to https://www.dropbox.com/developers/apps');
    console.log('2. Click "Create app"');
    console.log('3. Select "Scoped access"');
    console.log('4. Select "Full Dropbox" access');
    console.log('5. Give your app a name (e.g., "Printful Uploader")');
    console.log('6. Click "Create app"');
    console.log('7. In the settings tab, add "http://localhost:3000/oauth-callback" to the OAuth 2 redirect URIs');
    console.log('8. Note your App key and App secret\n');

    const setupNow = await askQuestion('Would you like to set up OAuth credentials now? (y/n): ');
    if (setupNow.toLowerCase() !== 'y') {
      console.log('\n⚠️ Migration aborted. You can run this script again when you\'re ready to set up OAuth.');
      rl.close();
      return;
    }

    // Get OAuth credentials from user
    const newAppKey = await askQuestion('\nEnter your Dropbox App key: ');
    const newAppSecret = await askQuestion('Enter your Dropbox App secret: ');
    
    // Update .env file with new credentials
    let envContent = fs.readFileSync('.env', 'utf8');
    envContent = envContent.replace(/DROPBOX_APP_KEY=.*$/m, `DROPBOX_APP_KEY=${newAppKey}`);
    envContent = envContent.replace(/DROPBOX_APP_SECRET=.*$/m, `DROPBOX_APP_SECRET=${newAppSecret}`);
    
    // Generate a random encryption key if not set
    if (!process.env.TOKEN_ENCRYPTION_KEY || process.env.TOKEN_ENCRYPTION_KEY === 'your_encryption_key_for_token_storage') {
      const crypto = require('crypto');
      const encryptionKey = crypto.randomBytes(32).toString('hex');
      envContent = envContent.replace(/TOKEN_ENCRYPTION_KEY=.*$/m, `TOKEN_ENCRYPTION_KEY=${encryptionKey}`);
      console.log('\n✅ Generated a secure encryption key for token storage.');
    }
    
    fs.writeFileSync('.env', envContent);
    console.log('\n✅ Updated .env file with OAuth credentials.');
    
    // Reload environment variables
    require('dotenv').config();
  }

  console.log('\n🔄 Starting migration from legacy token to OAuth...');
  
  try {
    // Try to use the legacy token to initialize OAuth
    const success = await migrateFromLegacyToken(legacyToken);
    
    if (success) {
      console.log('\n✅ Successfully migrated to OAuth flow!');
      console.log('Your Dropbox integration now uses OAuth 2.0 with automatic token refresh.');
      console.log('You no longer need to manually update your access token when it expires.');
    } else {
      console.log('\n⚠️ Migration partially completed.');
      console.log('You will need to complete the OAuth authorization flow when you run your application.');
    }
  } catch (error) {
    console.error('\n❌ Error during migration:', error.message);
    console.log('Please try running your application directly, which will guide you through the OAuth setup.');
  }
  
  rl.close();
}

// Run the migration
main().catch(error => {
  console.error('❌ Unhandled error:', error);
  rl.close();
  process.exit(1);
});
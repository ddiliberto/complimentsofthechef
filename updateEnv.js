/**
 * updateEnv.js
 * 
 * This script updates the .env file with Cloudinary credentials
 * and removes any Dropbox-related environment variables.
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const ENV_FILE = path.join(__dirname, '.env');

// Cloudinary credentials from the migration plan
const CLOUDINARY_CREDENTIALS = {
  CLOUDINARY_CLOUD_NAME: 'dw7k1nob9',
  CLOUDINARY_API_KEY: '122433767661295',
  CLOUDINARY_API_SECRET: 'J2_BLqLM8WNAio6KG_RVomSbkW8'
};

// Dropbox-related environment variables to remove
const DROPBOX_VARS = [
  'DROPBOX_APP_KEY',
  'DROPBOX_APP_SECRET',
  'DROPBOX_ACCESS_TOKEN',
  'DROPBOX_REFRESH_TOKEN',
  'DROPBOX_FOLDER_PATH'
];

/**
 * Read the current .env file
 * @returns {Promise<Object>} Environment variables
 */
async function readEnvFile() {
  try {
    if (!fs.existsSync(ENV_FILE)) {
      console.log(`⚠️ No .env file found. Creating a new one.`);
      return {};
    }
    
    const content = fs.readFileSync(ENV_FILE, 'utf8');
    const lines = content.split('\n');
    const env = {};
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine && !trimmedLine.startsWith('#')) {
        const match = trimmedLine.match(/^([^=]+)=(.*)$/);
        if (match) {
          const key = match[1].trim();
          const value = match[2].trim();
          env[key] = value;
        }
      }
    }
    
    return env;
  } catch (error) {
    console.error(`❌ Error reading .env file:`, error.message);
    return {};
  }
}

/**
 * Write environment variables to .env file
 * @param {Object} env - Environment variables
 */
function writeEnvFile(env) {
  try {
    const content = Object.entries(env)
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');
    
    fs.writeFileSync(ENV_FILE, content);
    console.log(`✅ .env file updated successfully`);
  } catch (error) {
    console.error(`❌ Error writing .env file:`, error.message);
  }
}

/**
 * Update the .env file with Cloudinary credentials
 */
async function updateEnvFile() {
  console.log(`🔄 Updating .env file with Cloudinary credentials...`);
  
  // Read current .env file
  const env = await readEnvFile();
  
  // Remove Dropbox-related variables
  for (const key of DROPBOX_VARS) {
    if (env[key]) {
      console.log(`🗑️ Removing ${key}`);
      delete env[key];
    }
  }
  
  // Add Cloudinary credentials
  for (const [key, value] of Object.entries(CLOUDINARY_CREDENTIALS)) {
    if (!env[key]) {
      console.log(`➕ Adding ${key}`);
      env[key] = value;
    } else if (env[key] !== value) {
      console.log(`🔄 Updating ${key}`);
      env[key] = value;
    } else {
      console.log(`✓ ${key} already set correctly`);
    }
  }
  
  // Write updated .env file
  writeEnvFile(env);
  
  console.log(`\n🎉 .env file has been updated with Cloudinary credentials`);
  console.log(`🚀 You can now run your application with Cloudinary integration`);
}

// Run the update
updateEnvFile().catch(error => {
  console.error(`❌ Unexpected error:`, error);
});
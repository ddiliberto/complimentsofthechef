/**
 * dropboxTokenManager.js
 * 
 * This module handles Dropbox OAuth 2.0 authentication with automatic token refresh.
 * It securely stores refresh tokens and automatically refreshes access tokens when they expire.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Dropbox } = require('dropbox');
const axios = require('axios');
const readline = require('readline');

// Configuration
require('dotenv').config();
const DROPBOX_APP_KEY = process.env.DROPBOX_APP_KEY;
const DROPBOX_APP_SECRET = process.env.DROPBOX_APP_SECRET;
const TOKEN_STORAGE_PATH = path.join(__dirname, '.tokens');
// Create a 32-byte key by hashing the original key
function createKey(key) {
  return crypto.createHash('sha256').update(String(key)).digest();
}
const ENCRYPTION_KEY = createKey(process.env.TOKEN_ENCRYPTION_KEY || 'default-encryption-key');

// Ensure token storage directory exists
if (!fs.existsSync(TOKEN_STORAGE_PATH)) {
  fs.mkdirSync(TOKEN_STORAGE_PATH, { recursive: true });
}

/**
 * Encrypt text using AES-256-CBC
 * @param {string} text - Text to encrypt
 * @returns {string} Encrypted text
 */
function encrypt(text) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

/**
 * Decrypt text using AES-256-CBC
 * @param {string} text - Text to decrypt
 * @returns {string} Decrypted text
 */
function decrypt(text) {
  const parts = text.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const encryptedText = Buffer.from(parts[1], 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
}

/**
 * Save tokens to encrypted storage
 * @param {Object} tokens - Token object to save
 */
function saveTokens(tokens) {
  const encryptedTokens = encrypt(JSON.stringify(tokens));
  fs.writeFileSync(path.join(TOKEN_STORAGE_PATH, 'dropbox_tokens.enc'), encryptedTokens);
}

/**
 * Load tokens from encrypted storage
 * @returns {Object|null} Token object or null if not found
 */
function loadTokens() {
  try {
    const encryptedTokens = fs.readFileSync(path.join(TOKEN_STORAGE_PATH, 'dropbox_tokens.enc'), 'utf8');
    return JSON.parse(decrypt(encryptedTokens));
  } catch (error) {
    return null;
  }
}

/**
 * Prompt for authorization code
 * @returns {Promise<string>} Authorization code
 */
async function promptForCode() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question('Enter the authorization code: ', (code) => {
      rl.close();
      resolve(code);
    });
  });
}

/**
 * Initialize OAuth flow
 * @returns {Promise<Object>} Token object
 */
async function initializeOAuthFlow() {
  console.log('Initializing Dropbox OAuth flow...');
  console.log(`\n1. Visit this URL in your browser:`);
  // Use the actual app key provided by the user
  console.log(`\nhttps://www.dropbox.com/oauth2/authorize?client_id=pg8ctv2m70yul5j&response_type=code&token_access_type=offline\n`);
  console.log('2. Click "Allow" (you might need to log in first)');
  console.log('3. Copy the authorization code');
  
  const code = await promptForCode();
  return await exchangeCodeForTokens(code);
}

/**
 * Exchange authorization code for tokens
 * @param {string} code - Authorization code
 * @returns {Promise<Object>} Token object
 */
async function exchangeCodeForTokens(code) {
  try {
    const params = new URLSearchParams();
    params.append('code', code);
    params.append('grant_type', 'authorization_code');
    params.append('client_id', 'pg8ctv2m70yul5j');
    params.append('client_secret', DROPBOX_APP_SECRET);

    const response = await axios.post('https://api.dropboxapi.com/oauth2/token', params);
    
    const tokens = {
      access_token: response.data.access_token,
      refresh_token: response.data.refresh_token,
      expires_at: Date.now() + (response.data.expires_in * 1000)
    };
    
    saveTokens(tokens);
    console.log('✅ Successfully obtained and saved tokens');
    return tokens;
  } catch (error) {
    console.error('❌ Error exchanging code for tokens:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
      console.error('Response status:', error.response.status);
    }
    throw error;
  }
}

/**
 * Refresh access token using refresh token
 * @param {string} refreshToken - Refresh token
 * @returns {Promise<Object>} Updated token object
 */
async function refreshAccessToken(refreshToken) {
  try {
    const params = new URLSearchParams();
    params.append('refresh_token', refreshToken);
    params.append('grant_type', 'refresh_token');
    params.append('client_id', 'pg8ctv2m70yul5j');
    params.append('client_secret', DROPBOX_APP_SECRET);

    const response = await axios.post('https://api.dropboxapi.com/oauth2/token', params);
    
    const tokens = {
      access_token: response.data.access_token,
      refresh_token: refreshToken, // Keep the same refresh token
      expires_at: Date.now() + (response.data.expires_in * 1000)
    };
    
    saveTokens(tokens);
    console.log('✅ Successfully refreshed access token');
    return tokens;
  } catch (error) {
    console.error('❌ Error refreshing access token:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
      console.error('Response status:', error.response.status);
    }
    throw error;
  }
}

/**
 * Get a valid Dropbox client with auto-refresh capability
 * @returns {Promise<Dropbox>} Dropbox client
 */
async function getDropboxClient() {
  let tokens = loadTokens();
  
  // If no tokens or refresh token is missing, initialize OAuth flow
  if (!tokens || !tokens.refresh_token) {
    tokens = await initializeOAuthFlow();
  }
  
  // If access token is expired, refresh it
  if (Date.now() >= tokens.expires_at) {
    console.log('Access token expired, refreshing...');
    tokens = await refreshAccessToken(tokens.refresh_token);
  }
  
  // Create Dropbox client with the access token
  const dbx = new Dropbox({ accessToken: tokens.access_token });
  
  // Add auto-refresh capability to the client
  const originalRequest = dbx.request;
  dbx.request = async function(...args) {
    try {
      return await originalRequest.apply(this, args);
    } catch (error) {
      if (error.status === 401) {
        console.log('Token expired during request, refreshing...');
        tokens = await refreshAccessToken(tokens.refresh_token);
        this.setAccessToken(tokens.access_token);
        return await originalRequest.apply(this, args);
      }
      throw error;
    }
  };
  
  return dbx;
}

/**
 * Initialize the token manager
 * This function should be called once to set up the OAuth flow
 */
async function initializeTokenManager() {
  try {
    // Check if we already have tokens
    const tokens = loadTokens();
    if (tokens && tokens.refresh_token) {
      console.log('✅ Existing tokens found');
      
      // Check if access token is expired
      if (Date.now() >= tokens.expires_at) {
        console.log('Access token expired, refreshing...');
        await refreshAccessToken(tokens.refresh_token);
      }
      
      return true;
    } else {
      // No tokens, start OAuth flow
      await initializeOAuthFlow();
      return true;
    }
  } catch (error) {
    console.error('❌ Error initializing token manager:', error.message);
    return false;
  }
}

/**
 * Migrate from legacy token to OAuth refresh token
 * @param {string} legacyToken - Legacy access token from .env
 * @returns {Promise<boolean>} Success status
 */
async function migrateFromLegacyToken(legacyToken) {
  try {
    console.log('🔄 Migrating from legacy token to OAuth refresh token...');
    
    // Create a temporary client with the legacy token
    const tempDbx = new Dropbox({ accessToken: legacyToken });
    
    // Check if the token is valid
    try {
      await tempDbx.usersGetCurrentAccount();
      console.log('✅ Legacy token is valid');
    } catch (error) {
      console.error('❌ Legacy token is invalid:', error.message);
      console.log('Please start the OAuth flow to get new tokens');
      return false;
    }
    
    // Since we can't convert a legacy token to a refresh token,
    // we need to start the OAuth flow
    console.log('⚠️ Legacy token cannot be converted to a refresh token');
    console.log('Starting OAuth flow to get new tokens...');
    
    await initializeOAuthFlow();
    return true;
  } catch (error) {
    console.error('❌ Error migrating from legacy token:', error.message);
    return false;
  }
}

module.exports = {
  getDropboxClient,
  initializeTokenManager,
  migrateFromLegacyToken
};
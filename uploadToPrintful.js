/**
 * uploadToPrintful.js
 * 
 * This script completes the end-to-end pipeline by:
 * 1. Processing all PNG files in the export/ directory
 * 2. Using generateListingFromOpenRouter.js to create content for each one with best-seller format
 * 3. Uploading PNG files to Printful with proper positioning
 * 4. Creating draft listings on Etsy through Printful's API
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const { Dropbox } = require('dropbox');
const generateListing = require('./generateListingFromOpenRouter');

// Configuration
const PRINTFUL_API_KEY = process.env.PRINTFUL_API_KEY;
const PRINTFUL_STORE_ID = process.env.PRINTFUL_STORE_ID;
const DROPBOX_ACCESS_TOKEN = process.env.DROPBOX_ACCESS_TOKEN;
const DROPBOX_FOLDER_PATH = process.env.DROPBOX_FOLDER_PATH || '/PrintfulImages';
const EXPORT_DIR = path.join(__dirname, 'export');
const EXPORT_MOCKUPS_DIR = path.join(__dirname, 'export-mockups');
const GILDAN_18000_PRODUCT_ID = 146; // Gildan 18000 Heavy Blend Crewneck Sweatshirt

// Initialize Dropbox client
const dropbox = new Dropbox({ accessToken: DROPBOX_ACCESS_TOKEN });

// Command line arguments
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run') || args.includes('-d');

// Check for limit argument (--limit=N or -l=N)
let LIMIT = Infinity;
const limitArg = args.find(arg => arg.startsWith('--limit=') || arg.startsWith('-l='));
if (limitArg) {
  const limitValue = limitArg.split('=')[1];
  LIMIT = parseInt(limitValue, 10);
  if (isNaN(LIMIT) || LIMIT <= 0) {
    LIMIT = Infinity;
    console.warn('⚠️ Invalid limit value. Processing all files.');
  }
}

// We'll fetch these dynamically from the Printful API
let VARIANT_IDS = {};

// Create Axios instance for Printful API
const printfulApi = axios.create({
  baseURL: 'https://api.printful.com',
  headers: {
    'Authorization': `Bearer ${PRINTFUL_API_KEY}`,
    'Content-Type': 'application/json'
  }
});

/**
 * Get all PNG files from the export directory
 * @returns {Promise<string[]>} Array of file paths
 */
async function getPngFilesFromExport() {
  try {
    const files = await fs.promises.readdir(EXPORT_DIR);
    return files
      .filter(file => file.toLowerCase().endsWith('.png'))
      .map(file => path.join(EXPORT_DIR, file));
  } catch (error) {
    console.error('❌ Error reading export directory:', error.message);
    throw error;
  }
}

/**
 * Extract word from file path
 * @param {string} filePath - Path to PNG file
 * @returns {string} Extracted word
 */
function extractWordFromFilePath(filePath) {
  const fileName = path.basename(filePath, '.png');
  return fileName;
}

/**
 * Upload file to Dropbox
 * @param {string} filePath - Path to local file
 * @returns {Promise<string>} Dropbox file path
 */
async function uploadFileToDropbox(filePath) {
  try {
    const fileName = path.basename(filePath);
    
    // Log the access token (first 10 chars only for security)
    const tokenPreview = DROPBOX_ACCESS_TOKEN.substring(0, 10) + '...';
    console.log(`🔑 Using Dropbox access token: ${tokenPreview}`);
    
    // Make sure the folder path is properly formatted
    // Remove trailing slash if present
    const folderPath = DROPBOX_FOLDER_PATH.endsWith('/') ?
      DROPBOX_FOLDER_PATH.slice(0, -1) : DROPBOX_FOLDER_PATH;
    
    let dropboxFilePath = `/${fileName}`; // Start with root path as default
    
    console.log(`⏳ Attempting to upload ${fileName} to Dropbox...`);
    
    // First try to authenticate with Dropbox
    console.log(`⏳ Testing authentication with Dropbox...`);
    try {
      const accountInfo = await dropbox.usersGetCurrentAccount();
      console.log(`✅ Authentication successful, connected as: ${accountInfo?.email || 'unknown user'}`);
      
      // Now try the actual folder path
      try {
        console.log(`⏳ Checking if folder exists: ${folderPath}`);
        await dropbox.filesGetMetadata({ path: folderPath });
        console.log(`✅ Folder exists: ${folderPath}`);
        dropboxFilePath = `${folderPath}/${fileName}`;
      } catch (folderError) {
        console.error(`❌ Error checking folder:`, folderError);
        if (folderError.status === 409 || folderError.status === 404) {
          console.log(`⚠️ Folder doesn't exist, will use root folder instead`);
        } else {
          console.error(`❌ Unexpected error checking folder, will use root folder:`, folderError);
        }
      }
    } catch (authError) {
      console.error(`❌ Authentication error:`, authError);
      console.error(`❌ This suggests an issue with the access token. Please check it's valid and has the correct permissions.`);
      throw new Error(`Dropbox authentication failed: ${authError.message}`);
    }
    
    // Read the file as a buffer
    const fileBuffer = fs.readFileSync(filePath);
    
    console.log(`⏳ File size: ${(fileBuffer.length / 1024).toFixed(2)} KB`);
    
    // Upload the file to Dropbox with detailed error handling
    console.log(`⏳ Uploading to path: ${dropboxFilePath}`);
    try {
      const response = await dropbox.filesUpload({
        path: dropboxFilePath,
        contents: fileBuffer,
        mode: { '.tag': 'overwrite' }
      });
      
      console.log(`✅ File uploaded to Dropbox: ${response.path_display || dropboxFilePath}`);
      return response.path_display || dropboxFilePath;
    } catch (uploadError) {
      console.error(`❌ Error during upload:`, uploadError);
      
      if (uploadError.error && uploadError.error.error_summary) {
        console.error(`❌ Error summary: ${uploadError.error.error_summary}`);
      }
      
      // If we're not already trying the root path, try it as fallback
      if (dropboxFilePath !== `/${fileName}`) {
        console.log(`⚠️ Trying to upload to root folder as fallback`);
        try {
          const rootPath = `/${fileName}`;
          const rootResponse = await dropbox.filesUpload({
            path: rootPath,
            contents: fileBuffer,
            mode: { '.tag': 'overwrite' }
          });
          
          console.log(`✅ File uploaded to Dropbox root: ${rootResponse.path_display || rootPath}`);
          return rootResponse.path_display || rootPath;
        } catch (rootUploadError) {
          console.error(`❌ Root upload also failed:`, rootUploadError);
          throw rootUploadError;
        }
      } else {
        throw uploadError;
      }
    }
  } catch (error) {
    console.error(`❌ Error uploading file to Dropbox:`, error);
    console.error(`❌ Error details:`, JSON.stringify(error, null, 2));
    throw error;
  }
}

/**
 * Create a shared link for a Dropbox file
 * @param {string} dropboxFilePath - Path to file in Dropbox
 * @returns {Promise<string>} Shared link URL
 */
async function createSharedLink(dropboxFilePath) {
  console.log(`⏳ Creating shared link for ${dropboxFilePath}...`);

  try {
    const response = await dropbox.sharingCreateSharedLinkWithSettings({
      path: dropboxFilePath,
      settings: {
        requested_visibility: { '.tag': 'public' }
      }
    });

    const url = response?.result?.url || response?.url;
    if (!url) throw new Error('No URL returned from Dropbox link creation');

    const directLink = url
      .replace('www.dropbox.com', 'dl.dropboxusercontent.com')
      .replace('?dl=0', '');

    console.log(`✅ Shared link created: ${directLink}`);
    return directLink;

  } catch (error) {
    const isConflict = error?.error?.error_summary?.includes('shared_link_already_exists');

    if (isConflict) {
      console.warn(`⚠️ Shared link already exists — switching to force refresh...`);

      // HACK: Delete and re-create the link
      try {
        // List existing links for this file
        const { links } = await dropbox.sharingListSharedLinks({
          path: dropboxFilePath,
          direct_only: true
        });

        if (links.length > 0) {
          const existingId = links[0].id;
          await dropbox.sharingRevokeSharedLink({ url: links[0].url });
          console.log(`🔁 Revoked existing link: ${existingId}`);
        }

        // Try again
        const retryResponse = await dropbox.sharingCreateSharedLinkWithSettings({
          path: dropboxFilePath,
          settings: {
            requested_visibility: { '.tag': 'public' }
          }
        });

        const retryUrl = retryResponse?.result?.url || retryResponse?.url;
        if (!retryUrl) throw new Error('No URL returned on retry');

        const directLink = retryUrl
          .replace('www.dropbox.com', 'dl.dropboxusercontent.com')
          .replace('?dl=0', '');

        console.log(`✅ New shared link created: ${directLink}`);
        return directLink;

      } catch (fallbackError) {
        console.error(`❌ Fallback link creation failed:`, fallbackError.message);
        throw fallbackError;
      }
    }

    console.error(`❌ Dropbox error: ${error.message}`);
    throw error;
  }
}

/**
 * Upload file to Printful with retries
 * @param {string} filePath - Path to file
 * @param {number} maxRetries - Maximum number of retries
 * @param {number} retryDelay - Delay between retries in ms
 * @returns {Promise<string>} File URL
 */
async function uploadFileToPrintful(filePath, isDryRun = DRY_RUN, maxRetries = 3, retryDelay = 2000) {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`⏳ Uploading file to Printful (attempt ${attempt}/${maxRetries})...`);
      
      // Get file stats for size information
      const stats = fs.statSync(filePath);
      console.log(`📊 File size: ${(stats.size / 1024).toFixed(2)} KB`);
      
      const fileName = path.basename(filePath);
      
      // In dry run mode, we would upload the file to Dropbox
      // and then provide the URL to Printful
      if (isDryRun) {
        console.log(`🔍 DRY RUN: Would upload ${fileName} to Dropbox and then add to Printful`);
        return `https://example.com/mockups/${fileName}`;
      }
      
      // Step 1: Upload the file to Dropbox
      const dropboxFilePath = await uploadFileToDropbox(filePath);
      
      // Step 2: Create a shared link for the file
      const sharedLink = await createSharedLink(dropboxFilePath);
      
      // Step 3: Add the file to Printful using the shared link
      console.log(`⏳ Adding ${fileName} to Printful file library using Dropbox link...`);
      
      try {
        const response = await printfulApi.post('/files', {
          url: sharedLink,
          type: 'default',
          filename: fileName,
          visible: true
        });
        
        if (response.data && response.data.result && response.data.result.url) {
          console.log(`✅ File added to Printful library: ${fileName}`);
          return response.data.result.url;
        } else {
          console.error('❌ Invalid response structure:', JSON.stringify(response.data));
          throw new Error('Invalid response from Printful file upload');
        }
      } catch (apiError) {
        if (apiError.response) {
          console.error('❌ Server responded with error:', apiError.response.status);
          console.error('❌ Error data:', JSON.stringify(apiError.response.data));
          throw new Error(`Server error: ${apiError.response.status} - ${JSON.stringify(apiError.response.data)}`);
        } else {
          throw apiError;
        }
      }
    } catch (error) {
      lastError = error;
      console.error(`❌ Error uploading file ${filePath} (attempt ${attempt}/${maxRetries}):`, error.message);
      
      if (attempt < maxRetries) {
        console.log(`⏳ Retrying in ${retryDelay / 1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        // Increase delay for next retry
        retryDelay *= 1.5;
      }
    }
  }
  
  // If we've exhausted all retries, throw the last error
  throw lastError;
}

/**
 * Get printfile information for a product
 * @param {number} productId - Printful product ID
 * @returns {Promise<Object>} Printfile information
 */
// Removed mockup generation functionality
/*
async function getPrintfileInfo(productId) {
  try {
    const response = await printfulApi.get(`/mockup-generator/printfiles/${productId}`);
    return response.data.result;
  } catch (error) {
    console.error(`❌ Error getting printfile info for product ${productId}:`, error.message);
    throw error;
  }
}
*/

/**
 * Create mockup generation task - REMOVED
 */
/*
async function createMockupGenerationTask(productId, fileUrl, variantIds) {
  try {
    // Get printfile info to determine dimensions
    const printfileInfo = await getPrintfileInfo(productId);
    
    // Find front placement printfile
    const frontPlacement = printfileInfo.available_placements.front;
    if (!frontPlacement) {
      throw new Error('Front placement not available for this product');
    }
    
    // Get the first printfile (assuming it's for the front placement)
    const printfile = printfileInfo.printfiles[0];
    if (!printfile) {
      throw new Error('No printfiles found for this product');
    }
    
    // Create mockup generation task
    const response = await printfulApi.post(`/mockup-generator/create-task/${productId}`, {
      variant_ids: variantIds,
      format: 'png',
      files: [
        {
          placement: 'front',
          image_url: fileUrl,
          position: {
            area_width: printfile.width,
            area_height: printfile.height,
            width: printfile.width,       // Full width of the printable area
            height: printfile.width / 2,  // Proportional height (half of width for a wider look)
            top: 0,                       // Position at the top
            left: 0,                      // Align to left edge
            limit_to_print_area: true
          }
        }
      ],
      option_groups: ['Front'], // Limit to front view mockups
    });
    
    if (response.data && response.data.result && response.data.result.task_key) {
      console.log(`✅ Mockup generation task created`);
      return response.data.result.task_key;
    } else {
      throw new Error('Invalid response from mockup generation task creation');
    }
  } catch (error) {
    console.error(`❌ Error creating mockup generation task:`, error.message);
    throw error;
  }
}
*/

/**
 * Check mockup task status - REMOVED
 */
/*
async function checkMockupTaskStatus(taskKey) {
  try {
    const response = await printfulApi.get(`/mockup-generator/task?task_key=${taskKey}`);
    return response.data.result;
  } catch (error) {
    console.error(`❌ Error checking mockup task status:`, error.message);
    throw error;
  }
}
*/

/**
 * Wait for mockup generation to complete - REMOVED
 */
/*
async function waitForMockupGeneration(taskKey, maxAttempts = 10, initialDelay = 10000) {
  let attempts = 0;
  let delay = initialDelay;
  
  while (attempts < maxAttempts) {
    // Wait for the specified delay
    await new Promise(resolve => setTimeout(resolve, delay));
    
    // Check task status
    const taskResult = await checkMockupTaskStatus(taskKey);
    
    if (taskResult.status === 'completed') {
      console.log(`✅ Mockup generation completed`);
      return taskResult;
    } else if (taskResult.status === 'failed') {
      throw new Error(`Mockup generation failed: ${taskResult.error || 'Unknown error'}`);
    }
    
    // Increase delay with exponential backoff (max 30 seconds)
    delay = Math.min(delay * 1.5, 30000);
    attempts++;
    
    console.log(`⏳ Waiting for mockup generation... (attempt ${attempts}/${maxAttempts})`);
  }
  
  throw new Error(`Mockup generation timed out after ${maxAttempts} attempts`);
}
*/

/**
 * Create product with Etsy sync
 * @param {string} word - Product word
 * @param {Object} listingContent - Listing content from OpenRouter
 * @param {Object} mockupResult - Mockup generation result
 * @returns {Promise<Object>} Created product
 */
async function createProductWithEtsySync(word, listingContent, manualMockup) {
  try {
    // Extract mockup URL - simplified for direct access
    const mockupUrl = manualMockup.mockups[0].mockup_url;
    const mockupFiles = manualMockup.mockups[0].mockup_files || [];
    
    console.log(`⏳ Creating product with ${mockupFiles.length} custom mockups`);
    
    // Prepare sync variants
    const syncVariants = Object.entries(VARIANT_IDS).map(([colorSize, variantId]) => {
      const [color, size] = colorSize.split('-');
      return {
        variant_id: variantId,
        retail_price: '29.99', // Set your retail price
        is_enabled: true
      };
    });
    
    // Create product with best-seller format
    const response = await printfulApi.post('/store/products', {
      sync_product: {
        name: `${word} Sweatshirt - Cute Oversized Unisex Crewneck`,
        thumbnail: mockupUrl, // Use the direct mockup URL
        is_ignored: false
      },
      sync_variants: syncVariants,
      retail_costs: {
        shipping: '5.00' // Set your shipping cost
      },
      etsy: {
        title: listingContent.title,
        description: listingContent.description,
        tags: listingContent.tags,
        state: 'draft', // Set to draft initially
        who_made: 'i_did',
        when_made: 'made_to_order',
        shipping_template_id: 1, // You'll need to get your actual shipping template ID
        shop_section_id: 1, // You'll need to get your actual shop section ID
        non_taxable: false,
        is_customizable: false,
        image_ids: [] // Will be populated by Printful
      }
    });
    
    console.log(`✅ Product created: ${listingContent.title}`);
    
    // If we have custom mockups, upload them and attach to the product
    if (mockupFiles.length > 0) {
      console.log(`⏳ Uploading ${mockupFiles.length} custom mockups...`);
      
      const productId = response.data.result.id;
      
      for (const mockupFile of mockupFiles) {
        try {
          // Extract color from filename (assuming format: word-COLOR.png)
          const fileName = path.basename(mockupFile);
          const colorMatch = fileName.match(/-([A-Z]+)\.png$/);
          const color = colorMatch ? colorMatch[1].toLowerCase() : null;
          
          console.log(`⏳ Uploading mockup: ${fileName} (color: ${color || 'unknown'})`);
          
          // Upload the mockup file to Printful
          const form = new FormData();
          form.append('file', fs.createReadStream(mockupFile));
          form.append('type', 'mockup');
          
          const fileResponse = await printfulApi.post('/files', form, {
            headers: {
              ...form.getHeaders()
            }
          });
          
          const fileId = fileResponse.data.result.id;
          console.log(`✅ Mockup uploaded: ${fileName} (ID: ${fileId})`);
          
          // Find matching variants for this color
          if (color) {
            const matchingVariants = Object.entries(VARIANT_IDS)
              .filter(([colorSize]) => colorSize.toLowerCase().startsWith(color.toLowerCase()))
              .map(([_, variantId]) => variantId);
            
            if (matchingVariants.length > 0) {
              console.log(`📊 Found ${matchingVariants.length} matching variants for color ${color}`);
              
              // Attach the mockup to each matching variant
              for (const variantId of matchingVariants) {
                try {
                  await printfulApi.post(`/store/products/${productId}/sync-variants/${variantId}/mockup`, {
                    mockup_id: fileId,
                    placement: 'front'
                  });
                  console.log(`✅ Attached mockup to variant ${variantId}`);
                } catch (attachError) {
                  console.error(`❌ Error attaching mockup to variant ${variantId}:`, attachError.message);
                }
              }
            } else {
              console.log(`⚠️ No matching variants found for color ${color}`);
            }
          }
        } catch (mockupError) {
          console.error(`❌ Error processing mockup ${mockupFile}:`, mockupError.message);
        }
      }
    }
    
    return response.data.result;
  } catch (error) {
    console.error(`❌ Error creating product:`, error.message);
    throw error;
  }
}

/**
 * Process a single file
 * @param {string} filePath - Path to PNG file
 * @returns {Promise<void>}
 */
async function processFile(filePath, isDryRun = DRY_RUN) {
  const word = extractWordFromFilePath(filePath);
  console.log(`\n🔄 Processing: ${word}`);
  
  try {
    // Step 1: Generate listing content with best-seller format
    console.log(`⏳ Generating listing content for ${word}...`);
    const listingContent = await generateListing(word);
    
    // Ensure the content follows the best-seller format
    if (!listingContent.description.includes('DETAILS') ||
        !listingContent.description.includes('FAST PROCESSING') ||
        !listingContent.description.includes('SATISFACTION GUARANTEE')) {
      console.log(`⚠️ Warning: Generated content may not follow the best-seller format. Check the output.`);
    }
    
    console.log(`✅ Listing content generated`);
    
    if (isDryRun) {
      console.log(`🔍 DRY RUN: Would upload file to Printful: ${filePath}`);
      console.log(`🔍 DRY RUN: Would create product with Etsy sync using:`);
      console.log(`   - Title: ${listingContent.title}`);
      console.log(`   - Tags: ${listingContent.tags.join(', ')}`);
      console.log(`✅ Successfully processed ${word} (DRY RUN)`);
      return { dryRun: true, word, listingContent };
    }
    
    // Step 2: Upload file to Printful
    console.log(`⏳ Uploading file to Printful...`);
    let fileUrl;
    
    let manualMockup;
    try {
      // First, upload the original design file to Printful
      fileUrl = await uploadFileToPrintful(filePath, isDryRun);
      
      // Check if we need to generate mockups with Photoshop
      const mockupDir = path.join(EXPORT_MOCKUPS_DIR, word);
      if (!fs.existsSync(mockupDir) || fs.readdirSync(mockupDir).length === 0) {
        console.log(`⏳ No mockups found for ${word}, generating with Photoshop...`);
        
        if (isDryRun) {
          console.log(`🔍 DRY RUN: Would generate mockups with Photoshop for ${word}`);
        } else {
          try {
            // Run the Photoshop mockup generation script
            console.log(`⏳ Running Photoshop mockup generation script...`);
            const { stdout, stderr } = await execPromise('node ' + path.join(__dirname, 'runExportMockups.js'));
            
            if (stdout) console.log(`📝 Photoshop output: ${stdout}`);
            if (stderr) console.log(`⚠️ Photoshop warnings: ${stderr}`);
            
            console.log(`✅ Mockups generated with Photoshop for ${word}`);
            
            // Wait a moment for file system to update
            await new Promise(resolve => setTimeout(resolve, 1000));
          } catch (mockupError) {
            console.error(`❌ Error generating mockups: ${mockupError.message}`);
            console.error(`❌ Error details: ${mockupError.stderr || mockupError.stdout || 'No additional details'}`);
          }
        }
      } else {
        console.log(`✅ Found existing mockups for ${word}`);
      }
      
      // Look for mockups in the export-mockups directory
      const mockupFiles = [];
      if (fs.existsSync(mockupDir)) {
        const files = fs.readdirSync(mockupDir);
        for (const file of files) {
          if (file.endsWith('.png')) {
            mockupFiles.push(path.join(mockupDir, file));
          }
        }
      }
      
      // Create a mockup data structure with the available mockups
      manualMockup = {
        mockups: mockupFiles.length > 0
          ? [{ mockup_url: fileUrl, mockup_files: mockupFiles }]
          : [{ mockup_url: fileUrl }]
      };
      
      console.log(`📊 Found ${mockupFiles.length} mockup files for ${word}`);
    } catch (uploadError) {
      console.error(`❌ Error uploading to Printful: ${uploadError.message}`);
      
      // Fallback: Use the filename as a URL (for future self-hosted mockups)
      const fileName = path.basename(filePath);
      console.log(`⚠️ Using fallback URL based on filename: ${fileName}`);
      fileUrl = `https://your-future-storage.example.com/mockups/${fileName}`;
      
      // Create a simplified mockup data structure with no mockup files
      manualMockup = {
        mockups: [{ mockup_url: fileUrl }]
      };
    }
    
    // Step 5: Create product with Etsy sync
    console.log(`⏳ Creating product with Etsy sync...`);
    const product = await createProductWithEtsySync(word, listingContent, manualMockup);
    
    console.log(`✅ Successfully processed ${word}`);
    return product;
  } catch (error) {
    console.error(`❌ Error processing ${word}:`, error.message);
    // Continue with next file
    return null;
  }
}

/**
 * Main function
 */
/**
 * Get variant IDs for Gildan 18000 sweatshirt
 * @returns {Promise<Object>} Variant IDs
 */
async function getVariantIds() {
  try {
    console.log(`⏳ Getting variant IDs for Gildan 18000 sweatshirt...`);
    
    // Get product information
    const response = await printfulApi.get(`/products/${GILDAN_18000_PRODUCT_ID}`);
    const variants = response.data.result.variants;
    
    // Create a map of color-size to variant ID
    const variantIds = {};
    for (const variant of variants) {
      const color = variant.color.toLowerCase();
      const size = variant.size;
      const key = `${color}-${size}`;
      variantIds[key] = variant.id;
      console.log(`  - Found variant: ${color} ${size} (ID: ${variant.id})`);
    }
    
    console.log(`✅ Found ${Object.keys(variantIds).length} variants`);
    return variantIds;
  } catch (error) {
    console.error(`❌ Error getting variant IDs:`, error.message);
    console.log(`⚠️ Using default variant IDs`);
    
    // Return default variant IDs as fallback
    return {
      'white-S': 4781,
      'white-M': 4782,
      'white-L': 4783,
      'white-XL': 4784,
      'white-2XL': 4785,
      'black-S': 4786,
      'black-M': 4787,
      'black-L': 4788,
      'black-XL': 4789,
      'black-2XL': 4790,
    };
  }
}

/**
 * Get store information from Printful API
 * @returns {Promise<Object>} Store information
 */
async function getStoreInfo() {
  try {
    const response = await axios.get('https://api.printful.com/stores', {
      headers: {
        'Authorization': `Bearer ${PRINTFUL_API_KEY}`
      }
    });
    
    if (response.data && response.data.result && response.data.result.length > 0) {
      const store = response.data.result[0]; // Use the first store
      console.log(`✅ Found store: ${store.name} (ID: ${store.id})`);
      return store;
    } else {
      throw new Error('No stores found in Printful account');
    }
  } catch (error) {
    console.error(`❌ Error getting store information:`, error.message);
    throw error;
  }
}

/**
 * Main function to process files and upload to Printful
 * @param {Object} options - Options for the upload process
 * @param {boolean} options.dryRun - Run in dry-run mode (no actual API calls)
 * @param {number} options.limit - Limit the number of files to process
 * @returns {Promise<Array>} Results of all processed files
 */
async function main(options = {}) {
  try {
    console.log('🚀 Starting uploadToPrintful.js');
    
    // Override command-line arguments with options if provided
    const isDryRun = options.dryRun !== undefined ? options.dryRun : DRY_RUN;
    const fileLimit = options.limit !== undefined ? options.limit : LIMIT;
    
    // Create export-mockups directory if it doesn't exist
    if (!fs.existsSync(EXPORT_MOCKUPS_DIR)) {
      fs.mkdirSync(EXPORT_MOCKUPS_DIR, { recursive: true });
      console.log(`📁 Created export-mockups directory`);
    }
    
    if (isDryRun) {
      console.log('🔍 DRY RUN MODE: No actual API calls will be made to Printful or Dropbox');
    } else {
      // Check if API keys are set
      if (!PRINTFUL_API_KEY) {
        throw new Error('PRINTFUL_API_KEY is not set in .env file');
      }
      
      if (!DROPBOX_ACCESS_TOKEN) {
        throw new Error('DROPBOX_ACCESS_TOKEN is not set in .env file');
      }
      
      // Check if store ID is set, if not, try to get it from the API
      if (!PRINTFUL_STORE_ID || PRINTFUL_STORE_ID === 'your-store-id-here') {
        console.log('⚠️ PRINTFUL_STORE_ID is not set in .env file, attempting to get it from the API...');
        try {
          const storeInfo = await getStoreInfo();
          process.env.PRINTFUL_STORE_ID = storeInfo.id.toString();
          console.log(`✅ Using store ID: ${storeInfo.id}`);
        } catch (error) {
          console.error('❌ Failed to get store ID from the API. Please set PRINTFUL_STORE_ID in .env file.');
          if (!isDryRun) {
            throw new Error('PRINTFUL_STORE_ID is required for non-dry-run mode');
          }
        }
      }
      
      // Verify Dropbox connection
      try {
        console.log('⏳ Verifying Dropbox connection...');
        const accountInfo = await dropbox.usersGetCurrentAccount();
        console.log('✅ Dropbox account info:', JSON.stringify(accountInfo, null, 2));
        
        // Check if we have the expected account info structure
        if (accountInfo) {
          const email = accountInfo?.email || 'unknown email';
          const displayName = accountInfo.name ?
            (accountInfo.name.display_name || accountInfo.name.familiar_name || accountInfo.name.given_name || 'Unknown') :
            'Unknown';
          console.log(`✅ Connected to Dropbox as: ${displayName} (${email})`);
        } else {
          console.log(`✅ Connected to Dropbox (account details not available)`);
        }
      } catch (error) {
        console.error('❌ Error connecting to Dropbox:', error.message);
        console.error('❌ Error details:', error);
        
        if (isDryRun) {
          console.log('⚠️ Continuing in dry run mode despite Dropbox connection issues');
        } else {
          throw new Error('Failed to connect to Dropbox. Please check your access token.');
        }
      }
    }
    
    // Get all PNG files from export directory
    let files = await getPngFilesFromExport();
    console.log(`📁 Found ${files.length} PNG files in export directory`);
    
    // Apply limit if specified
    if (fileLimit < files.length) {
      files = files.slice(0, fileLimit);
      console.log(`🔍 Processing only the first ${fileLimit} files due to limit option`);
    }
    
    // Get variant IDs if not in dry run mode
    if (!isDryRun) {
      VARIANT_IDS = await getVariantIds();
    }
    
    // Process each file
    const results = [];
    for (const file of files) {
      // Pass isDryRun to processFile
      const result = await processFile(file, isDryRun);
      if (result) {
        results.push(result);
      }
    }
    
    // Print summary
    console.log('\n📊 Upload Summary:');
    console.log(`✅ Successfully processed: ${results.length}/${files.length}`);
    console.log(`❌ Failed: ${files.length - results.length}/${files.length}`);
    
    console.log('\n✨ Done!');
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Unhandled error:', error);
    process.exit(1);
  });
}

module.exports = {
  processFile,
  main,
  uploadFileToDropbox,
  createSharedLink
};
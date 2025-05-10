/**
 * uploadToPrintful.js
 * 
 * This script completes the end-to-end pipeline by:
 * 1. Processing all PNG files in the export/ directory
 * 2. Using generateListingFromOpenRouter.js to create content for each one
 * 3. Using the Printful Mockup Generator API to generate mockups
 * 4. Creating draft listings on Etsy through Printful's API
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');
const generateListing = require('./generateListingFromOpenRouter');

// Configuration
const PRINTFUL_API_KEY = process.env.PRINTFUL_API_KEY;
const PRINTFUL_STORE_ID = process.env.PRINTFUL_STORE_ID;
const EXPORT_DIR = path.join(__dirname, 'export');
const GILDAN_18000_PRODUCT_ID = 146; // Gildan 18000 Heavy Blend Crewneck Sweatshirt

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

// Variant IDs for different sizes and colors
// These will need to be updated with actual variant IDs from Printful API
const VARIANT_IDS = {
  // Example format: 'color-size': variantId
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
 * Upload file to Printful
 * @param {string} filePath - Path to file
 * @returns {Promise<string>} File URL
 */
async function uploadFileToPrintful(filePath) {
  try {
    const formData = new FormData();
    formData.append('file', fs.createReadStream(filePath));
    
    const response = await axios.post('https://api.printful.com/files', formData, {
      headers: {
        ...formData.getHeaders(),
        'Authorization': `Bearer ${PRINTFUL_API_KEY}`
      }
    });
    
    if (response.data && response.data.result && response.data.result.url) {
      console.log(`✅ File uploaded: ${filePath}`);
      return response.data.result.url;
    } else {
      throw new Error('Invalid response from Printful file upload');
    }
  } catch (error) {
    console.error(`❌ Error uploading file ${filePath}:`, error.message);
    throw error;
  }
}

/**
 * Get printfile information for a product
 * @param {number} productId - Printful product ID
 * @returns {Promise<Object>} Printfile information
 */
async function getPrintfileInfo(productId) {
  try {
    const response = await printfulApi.get(`/mockup-generator/printfiles/${productId}`);
    return response.data.result;
  } catch (error) {
    console.error(`❌ Error getting printfile info for product ${productId}:`, error.message);
    throw error;
  }
}

/**
 * Create mockup generation task
 * @param {number} productId - Printful product ID
 * @param {string} fileUrl - URL of uploaded file
 * @param {number[]} variantIds - Array of variant IDs
 * @returns {Promise<string>} Task key
 */
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
            width: printfile.width,
            height: printfile.width, // Make it square
            top: (printfile.height - printfile.width) / 2, // Center vertically
            left: 0
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

/**
 * Check mockup task status
 * @param {string} taskKey - Task key
 * @returns {Promise<Object>} Task result
 */
async function checkMockupTaskStatus(taskKey) {
  try {
    const response = await printfulApi.get(`/mockup-generator/task?task_key=${taskKey}`);
    return response.data.result;
  } catch (error) {
    console.error(`❌ Error checking mockup task status:`, error.message);
    throw error;
  }
}

/**
 * Wait for mockup generation to complete
 * @param {string} taskKey - Task key
 * @param {number} maxAttempts - Maximum number of attempts
 * @param {number} initialDelay - Initial delay in ms
 * @returns {Promise<Object>} Completed task result
 */
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

/**
 * Create product with Etsy sync
 * @param {string} word - Product word
 * @param {Object} listingContent - Listing content from OpenRouter
 * @param {Object} mockupResult - Mockup generation result
 * @returns {Promise<Object>} Created product
 */
async function createProductWithEtsySync(word, listingContent, mockupResult) {
  try {
    // Extract mockup URLs
    const mockupUrls = mockupResult.mockups.map(mockup => mockup.mockup_url);
    
    // Prepare sync variants
    const syncVariants = Object.entries(VARIANT_IDS).map(([colorSize, variantId]) => {
      const [color, size] = colorSize.split('-');
      return {
        variant_id: variantId,
        retail_price: '29.99', // Set your retail price
        is_enabled: true
      };
    });
    
    // Create product
    const response = await printfulApi.post('/store/products', {
      sync_product: {
        name: listingContent.title,
        thumbnail: mockupUrls[0], // Use first mockup as thumbnail
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
async function processFile(filePath) {
  const word = extractWordFromFilePath(filePath);
  console.log(`\n🔄 Processing: ${word}`);
  
  try {
    // Step 1: Generate listing content
    console.log(`⏳ Generating listing content for ${word}...`);
    const listingContent = await generateListing(word);
    console.log(`✅ Listing content generated`);
    
    if (DRY_RUN) {
      console.log(`🔍 DRY RUN: Would upload file to Printful: ${filePath}`);
      console.log(`🔍 DRY RUN: Would create mockup generation task`);
      console.log(`🔍 DRY RUN: Would wait for mockup generation to complete`);
      console.log(`🔍 DRY RUN: Would create product with Etsy sync using:`);
      console.log(`   - Title: ${listingContent.title}`);
      console.log(`   - Tags: ${listingContent.tags.join(', ')}`);
      console.log(`✅ Successfully processed ${word} (DRY RUN)`);
      return { dryRun: true, word, listingContent };
    }
    
    // Step 2: Upload file to Printful
    console.log(`⏳ Uploading file to Printful...`);
    const fileUrl = await uploadFileToPrintful(filePath);
    
    // Step 3: Create mockup generation task
    console.log(`⏳ Creating mockup generation task...`);
    const variantIds = Object.values(VARIANT_IDS);
    const taskKey = await createMockupGenerationTask(GILDAN_18000_PRODUCT_ID, fileUrl, variantIds);
    
    // Step 4: Wait for mockup generation to complete
    console.log(`⏳ Waiting for mockup generation to complete...`);
    const mockupResult = await waitForMockupGeneration(taskKey);
    
    // Step 5: Create product with Etsy sync
    console.log(`⏳ Creating product with Etsy sync...`);
    const product = await createProductWithEtsySync(word, listingContent, mockupResult);
    
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
async function main() {
  try {
    console.log('🚀 Starting uploadToPrintful.js');
    
    if (DRY_RUN) {
      console.log('🔍 DRY RUN MODE: No actual API calls will be made to Printful');
    } else {
      // Check if API key and store ID are set
      if (!PRINTFUL_API_KEY) {
        throw new Error('PRINTFUL_API_KEY is not set in .env file');
      }
      
      if (!PRINTFUL_STORE_ID) {
        throw new Error('PRINTFUL_STORE_ID is not set in .env file');
      }
    }
    
    // Get all PNG files from export directory
    let files = await getPngFilesFromExport();
    console.log(`📁 Found ${files.length} PNG files in export directory`);
    
    // Apply limit if specified
    if (LIMIT < files.length) {
      files = files.slice(0, LIMIT);
      console.log(`🔍 Processing only the first ${LIMIT} files due to --limit option`);
    }
    
    // Process each file
    const results = [];
    for (const file of files) {
      const result = await processFile(file);
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
  main
};
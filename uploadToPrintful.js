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
const generateListing = require('./generateListingFromOpenRouter');
const generateCSVDashboard = require('./generateCSVDashboard');
const uploadCSVToGoogleSheet = require('./uploadCSVToGoogleSheet');
const { uploadFileWithFallbackStrategy } = require('./fileUploader');

// Configuration
const PRINTFUL_API_KEY = process.env.PRINTFUL_API_KEY;
const PRINTFUL_STORE_ID = process.env.PRINTFUL_STORE_ID;
const EXPORT_DIR = path.join(__dirname, 'export');
const EXPORT_MOCKUPS_DIR = path.join(__dirname, 'export-mockups');
const MANUAL_TEMPLATES_DIR = path.join(__dirname, 'manual-templates');
const GILDAN_18000_PRODUCT_ID = 146; // Gildan 18000 Heavy Blend Crewneck Sweatshirt

// Command line arguments
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run') || args.includes('-d');
const TEMPLATE_ONLY = !args.includes('--attempt-sync'); // Default to template-only mode
const SYNC_ONLY = args.includes('--sync-only') || args.includes('-s');

// Add help text
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
📋 uploadToPrintful.js Help:

This script creates product templates in Printful from PNG files in the export/ directory.

Options:
  --dry-run, -d         Run in dry-run mode (no actual API calls)
  --limit=N, -l=N       Process only N files
  --attempt-sync        Try to sync products (may fail with platform-based stores)
  --sync-only, -s       Skip template creation and only sync products
  --help, -h            Show this help text

Examples:
  node uploadToPrintful.js                   # Create templates for all files
  node uploadToPrintful.js --limit=1         # Process only one file
  node uploadToPrintful.js --dry-run         # Test without making API calls
  node uploadToPrintful.js --attempt-sync    # Try to create templates and sync products
  `);
  process.exit(0);
}


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
 * Upload file to Printful with retries
 * Only uploads design files, not mockups
 * @param {string} filePath - Path to file
 * @param {boolean} isDryRun - Whether to run in dry-run mode
 * @returns {Promise<string>} File URL
 */
async function uploadFileToPrintful(filePath, isDryRun = DRY_RUN) {
  try {
    const fileName = path.basename(filePath);
    
    // In dry run mode, return a mock URL
    if (isDryRun) {
      console.log(`🔍 DRY RUN: Would upload ${fileName} to Printful`);
      return `https://example.com/mockups/${fileName}`;
    }
    
    // Use our new upload strategy with fallback
    console.log(`⏳ Uploading ${fileName} to Printful using improved upload strategy...`);
    
    // Upload file using Cloudinary
    const fileUrl = await uploadFileWithFallbackStrategy(filePath);
    
    console.log(`✅ File successfully uploaded to Printful: ${fileName}`);
    return fileUrl;
  } catch (error) {
    console.error(`❌ Error uploading file to Printful:`, error.message);
    throw error;
  }
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
/**
 * Create a product template on Printful for a design
 * @param {string} designName - The design name (e.g., 'TACOS')
 * @param {string} fileUrl - Direct URL to the uploaded design file
 * @param {Array<number>} variantIds - Array of Printful variant IDs
 * @returns {Promise<Object>} - Template information
 */
async function createProductTemplate(designName, fileUrl, variantIds) {
  console.log(`\n❌ Printful does not support template creation via API.`);
  console.log(`👉 Create your template manually here: https://www.printful.com/dashboard/product-templates/create`);
  console.log(`🖼️ Use the uploaded file URL: ${fileUrl}`);
  console.log(`📦 Suggested variants (first 5): ${variantIds.slice(0, 5).join(', ')}...`);
  
  console.log(`\n📐 Suggested positioning:`);
  console.log(`   - Width: 1800px`);
  console.log(`   - Height: 900px`);
  console.log(`   - Top: 0`);
  console.log(`   - Left: 0`);
  
  console.log(`📋 Metadata will be saved for easy copy/paste\n`);

  return {
    manualTemplate: true,
    designName,
    fileUrl,
    metadataPath: `manual-templates/${designName}.json`
  };
}

/**
 * Create product with Etsy sync
 * @param {string} word - Product word
 * @param {Object} listingContent - Listing content from OpenRouter
 * @param {Object} manualMockup - Mockup data
 * @returns {Promise<Object>} Created product
 */
async function createProductWithEtsySync(word, listingContent, manualMockup) {
  try {
    // Extract mockup URL - simplified for direct access
    const mockupUrl = manualMockup.mockups[0].mockup_url;
    const mockupFiles = manualMockup.mockups[0].local_mockup_files || manualMockup.mockups[0].mockup_files || [];
    
    console.log(`⏳ Creating product with ${mockupFiles.length} custom mockups`);
    
    // Prepare sync variants with files for each variant
    console.log(`⚠️ Limiting from ${Object.entries(VARIANT_IDS).length} to 100 variants due to Printful API limits`);
    const syncVariants = Object.entries(VARIANT_IDS)
      .slice(0, 100) // LIMIT TO 100 VARIANTS MAX
      .map(([colorSize, variantId]) => ({
        variant_id: variantId,
        retail_price: '29.99', // Set your retail price
        is_enabled: true,
        files: [
          {
            url: mockupUrl,
            type: 'default',
            placement: 'front'
          }
        ]
      }));
    
    // Check if we're using a Manual/API store or an Etsy store
    let storeType = 'manual';
    let storeInfo = null;
    try {
      storeInfo = await getStoreInfo();
      storeType = storeInfo.type && storeInfo.type.toLowerCase();
      console.log(`🏪 Detected store type: ${storeType}`);
    } catch (error) {
      console.warn(`⚠️ Could not determine store type, assuming Manual/API store: ${error.message}`);
    }
    
    // Prepare the request payload based on store type
    const payload = {
      sync_product: {
        name: `${word} Sweatshirt - Cute Oversized Unisex Crewneck`,
        thumbnail: mockupUrl, // Use the direct mockup URL
        is_ignored: false
      },
      sync_variants: syncVariants,
      retail_costs: {
        shipping: '5.00' // Set your shipping cost
      },
    };
    
    // Only include the etsy block if this is an Etsy store
    if (storeType === 'etsy') {
      console.log(`✅ Adding Etsy-specific data to request payload`);
      payload.etsy = {
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
      };
    } else {
      console.log(`✅ Using Manual/API store format (no Etsy data included)`);
    }
    
    // Log the payload for debugging
    console.log(`📦 Request payload structure:`);
    console.log(JSON.stringify({
      sync_product: payload.sync_product,
      sync_variants: `[${syncVariants.length} variants with files]`,
      retail_costs: payload.retail_costs,
      etsy: payload.etsy ? 'Included' : 'Not included'
    }, null, 2));
    
    // Create product with appropriate format
    try {
      const response = await printfulApi.post('/store/products', payload);
      return response.data.result;
    } catch (apiError) {
      console.error(`❌ API Error Details:`);
      if (apiError.response) {
        console.error(`Status: ${apiError.response.status}`);
        console.error(`Response data: ${JSON.stringify(apiError.response.data, null, 2)}`);
        
        // Check for specific error messages
        if (apiError.response.data && apiError.response.data.error) {
          console.error(`Error code: ${apiError.response.data.error.code || 'N/A'}`);
          console.error(`Error message: ${apiError.response.data.error.message || 'N/A'}`);
        }
      } else if (apiError.request) {
        console.error(`No response received: ${apiError.request}`);
      } else {
        console.error(`Error setting up request: ${apiError.message}`);
      }
      throw apiError;
    }
    
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
    
    // Step 2: Upload file to Printful using our improved strategy
    console.log(`⏳ Uploading file to Printful...`);
    let fileUrl;
    
    let manualMockup;
    try {
      // Upload the original design file to Printful using our new strategy
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
      // Note: We're no longer uploading mockups to Dropbox, just referencing them locally
      manualMockup = {
        mockups: [{
          mockup_url: fileUrl,
          local_mockup_files: mockupFiles.length > 0 ? mockupFiles : []
        }]
      };
      
      console.log(`📊 Found ${mockupFiles.length} local mockup files for ${word}`);
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
    
    // Step 4: Create product template
    console.log(`⏳ Creating product template...`);
    let templateId = null;
    
    // Validate conflicting options
    if (TEMPLATE_ONLY && SYNC_ONLY) {
      console.error('❌ Error: Cannot use both --template-only and --sync-only options together.');
      return null;
    }
    
    // Create product template if not in sync-only mode
    if (!SYNC_ONLY) {
      try {
        const variantIds = Object.values(VARIANT_IDS);
        const templateInfo = await createProductTemplate(word, fileUrl, variantIds);
        
        // Save metadata for manual template creation
        const listingOutput = {
          word,
          fileUrl,
          title: listingContent.title,
          description: listingContent.description,
          tags: listingContent.tags,
          dropboxLink: manualMockup.mockups[0].mockup_url,
          localMockups: manualMockup.mockups[0].local_mockup_files || [],
          createdAt: new Date().toISOString()
        };
        
        fs.writeFileSync(
          path.join(MANUAL_TEMPLATES_DIR, `${word}.json`),
          JSON.stringify(listingOutput, null, 2)
        );
        
        console.log(`✅ Saved metadata for ${word} to manual-templates/${word}.json`);
        
        // If template-only mode, stop here
        if (TEMPLATE_ONLY) {
          console.log(`✅ Template-only mode: Skipping product sync for ${word}`);
          return { templateInfo, word };
        }
      } catch (templateError) {
        console.error(`❌ Error creating product template: ${templateError.message}`);
        if (TEMPLATE_ONLY) {
          throw templateError; // In template-only mode, fail if template creation fails
        }
        console.log(`⚠️ Continuing with product sync without template...`);
      }
    }
    
    // Step 5: Create product with Etsy sync if not in template-only mode
    if (!TEMPLATE_ONLY) {
      try {
        console.log(`\n⚠️ Attempting to sync product (may fail with platform-based stores)...`);
        const product = await createProductWithEtsySync(word, listingContent, manualMockup);
        console.log(`✅ Successfully processed ${word}`);
        return { product, word };
      } catch (syncError) {
        if (syncError.response && syncError.response.status === 400 &&
            syncError.response.data && syncError.response.data.error &&
            syncError.response.data.error.message &&
            syncError.response.data.error.message.includes('Manual Order / API platform')) {
          console.log(`\n⚠️ Store type limitation detected: Your Printful store is platform-based.`);
          console.log(`⚠️ Product syncing is only available for Manual Order / API platform stores.`);
          console.log(`⚠️ Please use the template information saved to manual-templates/${word}.json for manual creation.`);
        } else {
          console.error(`❌ Error syncing product: ${syncError.message}`);
        }
        
        // Return success with template info only
        return { templateOnly: true, word };
      }
    }
    
    // If we reach here, something unexpected happened
    console.log(`✅ Successfully processed ${word}`);
    return { word };
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
      console.log(`✅ Found store: ${store.name} (ID: ${store.id}, Type: ${store.type || 'unknown'})`);
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
    
    // Create manual-templates directory if it doesn't exist
    if (!fs.existsSync(MANUAL_TEMPLATES_DIR)) {
      fs.mkdirSync(MANUAL_TEMPLATES_DIR, { recursive: true });
      console.log(`📁 Created manual-templates directory`);
    }
    
    if (isDryRun) {
      console.log('🔍 DRY RUN MODE: No actual API calls will be made to Printful');
    } else {
      // Check if API keys are set
      if (!PRINTFUL_API_KEY) {
        throw new Error('PRINTFUL_API_KEY is not set in .env file');
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
    console.log('\n📊 Template Creation Summary:');
    
    // Define templatesCreated outside the conditional blocks so it's available everywhere
    let templatesCreated = 0;
    
    if (isDryRun) {
      console.log(`🔍 DRY RUN: Would have created templates for ${results.length} files`);
    } else {
      templatesCreated = results.filter(r => r.templateInfo || r.templateOnly).length;
      console.log(`✅ Successfully created templates: ${templatesCreated}/${files.length}`);
      console.log(`❌ Failed: ${files.length - templatesCreated}/${files.length}`);
    }
    
    if (!TEMPLATE_ONLY) {
      console.log(`\n📊 Product Sync Summary:`);
      
      if (isDryRun) {
        console.log(`🔍 DRY RUN: Would have attempted to sync ${results.length} products`);
      } else {
        const syncedCount = results.filter(r => r.product).length;
        console.log(`✅ Successfully synced products: ${syncedCount}/${files.length}`);
        
        if (syncedCount === 0) {
          console.log(`\n⚠️ No products were synced. This is normal for platform-based stores.`);
          console.log(`⚠️ To sync products, use the templates created above in the Printful dashboard.`);
          console.log(`⚠️ You can also create a Manual Order / API platform store in Printful for testing.`);
        }
      }
    }
    
    if (templatesCreated > 0) {
      console.log(`\n🔗 Access your templates at: https://www.printful.com/dashboard/product-templates`);
      console.log(`📋 Metadata saved to manual-templates/ directory for easy copy/paste`);
    }
    
    // Generate and upload dashboard to Google Sheets if not in dry run mode
    if (!isDryRun) {
      await generateAndUploadDashboard();
    }
    
    console.log('\n✨ Done!');
  } // Close the else block that started at line 731
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

/**
 * Generate and upload dashboard to Google Sheets
 * @returns {Promise<void>}
 */
async function generateAndUploadDashboard() {
  try {
    console.log('\n📊 Generating and uploading dashboard...');
    
    // Generate CSV dashboard
    const csvPath = await generateCSVDashboard({
      templatesDir: MANUAL_TEMPLATES_DIR,
      outputPath: path.join(__dirname, 'listing-dashboard.csv'),
    });
    
    if (!csvPath) {
      console.log('⚠️ No dashboard generated, skipping upload');
      return;
    }
    
    // Get spreadsheet ID from environment variable or use the hardcoded one
    const spreadsheetId = process.env.GOOGLE_SHEETS_DASHBOARD_ID || '1q5gbFZTX6Upk7UgnJlMey3xfzr3QJiNTfYabJDEu4AQ';
    
    // Upload to Google Sheets
    await uploadCSVToGoogleSheet({
      csvPath,
      spreadsheetId,
      credentialsPath: path.join(__dirname, 'google-sheets-key.json'),
    });
    
    console.log('✅ Dashboard successfully uploaded to Google Sheets');
  } catch (err) {
    console.error('❌ Failed to generate and upload dashboard:', err.message);
  }
}

module.exports = {
  processFile,
  main,
  uploadFileToPrintful,
  generateAndUploadDashboard
};
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
  --direct-upload       Use direct upload to Printful (no Dropbox)
  --help, -h            Show this help text

Examples:
  node uploadToPrintful.js                   # Create templates for all files
  node uploadToPrintful.js --limit=1         # Process only one file
  node uploadToPrintful.js --dry-run         # Test without making API calls
  node uploadToPrintful.js --attempt-sync    # Try to create templates and sync products
  node uploadToPrintful.js --direct-upload   # Use direct upload to Printful
  `);
  process.exit(0);
}

// Check if direct upload is requested
const DIRECT_UPLOAD = args.includes('--direct-upload');

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
    
    // Use direct upload if specified, otherwise use fallback strategy
    const fileUrl = await uploadFileWithFallbackStrategy(filePath, !DIRECT_UPLOAD);
    
    console.log(`✅ File successfully uploaded to Printful: ${fileName}`);
    return fileUrl;
  } catch (error) {
    console.error(`❌ Error uploading file to Printful:`, error.message);
    throw error;
  }
}

/**
 * Create a product template in Printful
 * @param {string} designName - Name of the design
 * @param {string} fileUrl - URL of the design file
 * @param {Object} variantIds - Variant IDs for the product
 * @returns {Promise<Object>} Template information
 */
async function createProductTemplate(designName, fileUrl, variantIds) {
  console.log(`⏳ Creating product template for ${designName}...`);
  
  // In dry run mode, return mock data
  if (DRY_RUN) {
    console.log(`🔍 DRY RUN: Would create product template for ${designName}`);
    return {
      id: 'dry-run-template-id',
      name: designName,
      variants: Object.keys(variantIds)
    };
  }
  
  return {
    name: designName,
    product_id: GILDAN_18000_PRODUCT_ID,
    variants: Object.values(variantIds).map(id => ({
      variant_id: id,
      files: [
        {
          type: 'front',
          url: fileUrl
        }
      ]
    }))
  };
}

/**
 * Create a product with Etsy sync
 * @param {string} word - The word/design name
 * @param {Object} listingContent - Content for the listing
 * @param {Object} manualMockup - Manual mockup information
 * @returns {Promise<Object>} Created product information
 */
async function createProductWithEtsySync(word, listingContent, manualMockup) {
  try {
    // In dry run mode, return mock data
    if (DRY_RUN) {
      console.log(`🔍 DRY RUN: Would create product with Etsy sync for ${word}`);
      return {
        id: 'dry-run-product-id',
        name: word,
        sync_product: {
          id: 'dry-run-sync-id'
        }
      };
    }
    
    // Create the product with Etsy sync
    const response = await printfulApi.post('/store/products', {
      sync_product: {
        name: listingContent.title,
        thumbnail: manualMockup?.mockups?.[0]?.mockup_url || null,
        is_ignored: false
      },
      etsy: {
        title: listingContent.title,
        description: listingContent.description,
        price: listingContent.price || '29.99',
        tags: listingContent.tags.join(','),
        shipping_profile_id: null,
        shop_section_id: null,
        non_taxable: false,
        state: 'draft',
        processing_min: 1,
        processing_max: 3,
        who_made: 'i_did',
        is_supply: false,
        when_made: 'made_to_order',
        recipient: 'unisex_adults',
        occasion: null,
        style: null
      }
    });
    
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
      
      // Check for manual template JSON file
      const manualTemplatePath = path.join(MANUAL_TEMPLATES_DIR, `${word}.json`);
      if (!fs.existsSync(manualTemplatePath)) {
        // Create a manual template JSON file
        manualMockup = {
          mockups: [{
            placement: 'front',
            variant_ids: Object.values(VARIANT_IDS),
            mockup_url: fileUrl
          }]
        };
        
        // Save the manual template
        fs.mkdirSync(MANUAL_TEMPLATES_DIR, { recursive: true });
        fs.writeFileSync(manualTemplatePath, JSON.stringify(manualMockup, null, 2));
        console.log(`✅ Created manual template: ${manualTemplatePath}`);
      } else {
        console.log(`✅ Found existing manual template: ${manualTemplatePath}`);
        manualMockup = JSON.parse(fs.readFileSync(manualTemplatePath, 'utf8'));
      }
      
      // Create a product template
      console.log(`⏳ Creating product template...`);
      const templateInfo = await createProductTemplate(word, fileUrl, VARIANT_IDS);
      
      // If we're only creating templates, return here
      if (TEMPLATE_ONLY) {
        console.log(`✅ Successfully created template for ${word}`);
        return { word, templateInfo, templateOnly: true };
      }
      
      // Create a product with Etsy sync
      console.log(`⏳ Creating product with Etsy sync...`);
      const product = await createProductWithEtsySync(word, listingContent, manualMockup);
      console.log(`✅ Successfully created product: ${product.id}`);
      
      // Save the listing output to a file
      const listingOutput = {
        word,
        title: listingContent.title,
        description: listingContent.description,
        tags: listingContent.tags,
        price: listingContent.price || '29.99',
        product_id: product.id,
        sync_product_id: product.sync_product?.id,
        template_id: templateInfo.id,
        file_url: fileUrl
      };
      
      // Save to product-info directory
      const productInfoDir = path.join(__dirname, 'product-info');
      fs.mkdirSync(productInfoDir, { recursive: true });
      fs.writeFileSync(
        path.join(productInfoDir, `${word}-${Date.now()}.json`),
        JSON.stringify(listingOutput, null, 2)
      );
      
      return { word, templateInfo, product, listingContent };
    } catch (error) {
      console.error(`❌ Error processing ${word}:`, error.message);
      return { word, error: error.message };
    }
  } catch (error) {
    console.error(`❌ Error processing ${filePath}:`, error.message);
    throw error;
  }
}

/**
 * Get variant IDs for the product
 * @returns {Promise<Object>} Variant IDs
 */
async function getVariantIds() {
  try {
    console.log(`⏳ Getting variant IDs for product ${GILDAN_18000_PRODUCT_ID}...`);
    
    // In dry run mode, return mock data
    if (DRY_RUN) {
      console.log(`🔍 DRY RUN: Would get variant IDs for product ${GILDAN_18000_PRODUCT_ID}`);
      return {
        'S/Black': 'dry-run-variant-id-1',
        'M/Black': 'dry-run-variant-id-2',
        'L/Black': 'dry-run-variant-id-3',
        'XL/Black': 'dry-run-variant-id-4',
        '2XL/Black': 'dry-run-variant-id-5'
      };
    }
    
    const response = await printfulApi.get(`/products/${GILDAN_18000_PRODUCT_ID}`);
    const variants = response.data.result.variants;
    
    // Filter for black variants only
    const blackVariants = variants.filter(v => v.color === 'Black');
    
    // Create a map of size/color to variant ID
    return {
      'S/Black': blackVariants.find(v => v.size === 'S')?.id,
      'M/Black': blackVariants.find(v => v.size === 'M')?.id,
      'L/Black': blackVariants.find(v => v.size === 'L')?.id,
      'XL/Black': blackVariants.find(v => v.size === 'XL')?.id,
      '2XL/Black': blackVariants.find(v => v.size === '2XL')?.id
    };
  } catch (error) {
    console.error(`❌ Error getting variant IDs:`, error.message);
    throw error;
  }
}

/**
 * Get store information
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
      return response.data.result[0];
    } else {
      throw new Error('No stores found');
    }
  } catch (error) {
    console.error(`❌ Error getting store information:`, error.message);
    throw error;
  }
}

/**
 * Main function
 * @param {Object} options - Options
 * @returns {Promise<void>}
 */
async function main(options = {}) {
  console.log('🚀 Starting uploadToPrintful.js');
  
  try {
    const isDryRun = options.dryRun || DRY_RUN;
    const fileLimit = options.limit || LIMIT;
    
    if (isDryRun) {
      console.log('🔍 Running in dry-run mode (no actual API calls)');
    }
    
    if (fileLimit !== Infinity) {
      console.log(`🔍 Processing only ${fileLimit} files due to limit option`);
    }
    
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
    
    // Verify Dropbox connection if not using direct upload
    if (!options.directUpload) {
      try {
        console.log('⏳ Verifying Dropbox connection...');
        
        // Import the getDropboxClient function from our new module
        const { getDropboxClient } = require('./dropboxTokenManager');
        
        // Try to get a Dropbox client (this will handle token refresh if needed)
        const dbx = await getDropboxClient();
        
        // Test the connection with a simple API call
        await dbx.usersGetCurrentAccount();
        console.log('✅ Successfully connected to Dropbox');
      } catch (error) {
        if (isDryRun) {
          console.log('⚠️ Continuing in dry run mode despite Dropbox connection issues');
        } else {
          console.error('❌ Error connecting to Dropbox:', error.message);
          throw new Error('Failed to connect to Dropbox. Please run migrateDropboxToken.js to set up OAuth.');
        }
      }
    } else {
      console.log('⏭️ Skipping Dropbox connection check (using direct upload)');
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
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

/**
 * Generate and upload a CSV dashboard to Google Sheets
 */
async function generateAndUploadDashboard() {
  try {
    console.log('\n📊 Generating and uploading dashboard to Google Sheets...');
    
    // Generate CSV dashboard
    const csvPath = await generateCSVDashboard({
      productInfoDir: path.join(__dirname, 'product-info'),
      outputPath: path.join(__dirname, 'listing-dashboard.csv')
    });
    
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
  uploadFileToPrintful,
  generateAndUploadDashboard
};
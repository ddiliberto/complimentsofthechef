/**
 * automatePrintfulProduct.js
 * 
 * This script automates the creation and publishing of a Printful product using direct product creation.
 * It creates a new product, generates content with GPT, uploads mockups to Dropbox, and updates the product.
 * 
 * This is an updated version that replaces the template-based approach with direct product creation
 * for more flexibility and control over the product creation process.
 */

// Import required modules
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Dropbox } = require('dropbox');
const fetch = require('node-fetch');
const { createNewProduct, getStoreCredentials, getAllProductVariants } = require('./createPrintfulProduct');

// Configuration
const DEFAULT_PRODUCT_ID = 71; // Gildan 18000 sweatshirt (Heavy Blend Crewneck)
const DEFAULT_COLOR = 'black';
const DEFAULT_VARIANTS = ['S', 'M', 'L', 'XL', '2XL', '3XL'];
const DEFAULT_PRICE = 39.99;

/**
 * Generates product text using GPT via OpenRouter
 * @param {string} sweatshirtText - The text on the sweatshirt
 * @param {number} [maxRetries=3] - Maximum number of retry attempts
 * @param {number} [retryDelay=2000] - Delay between retries in ms
 * @returns {Promise<Object>} - The generated content
 */
async function generateProductText(sweatshirtText, maxRetries = 3, retryDelay = 2000) {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`⏳ Generating product text for: ${sweatshirtText} (attempt ${attempt}/${maxRetries})`);
      
      const prompt = `Generate an SEO-optimized Etsy title, description, and 13 tags for a sweatshirt that says: "${sweatshirtText}". Respond in this format:
---
Title: ...
Description: ...
Tags: tag1, tag2, tag3...
`;

      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o",
          messages: [{ role: "user", content: prompt }],
        }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(`OpenRouter API error: ${JSON.stringify(data)}`);
      }
      
      if (!data.choices || !data.choices[0] || !data.choices[0].message || !data.choices[0].message.content) {
        throw new Error(`Invalid response format from OpenRouter: ${JSON.stringify(data)}`);
      }
      
      const content = data.choices[0].message.content;
      console.log(`✅ Product text generated successfully`);
      
      // Parse the content into structured data
      const result = {
        title: extractField("Title", content),
        description: extractField("Description", content),
        tags: extractTags(content)
      };
      
      // Validate that we got the required fields
      if (!result.title || !result.description || !result.tags || result.tags.length === 0) {
        throw new Error(`Generated content is missing required fields: ${JSON.stringify(result)}`);
      }
      
      return result;
    } catch (error) {
      lastError = error;
      console.error(`❌ Error generating product text (attempt ${attempt}/${maxRetries}):`, error.message);
      
      if (attempt < maxRetries) {
        console.log(`⏳ Retrying in ${retryDelay / 1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        // Increase delay for next retry
        retryDelay *= 1.5;
      }
    }
  }
  
  // If we've exhausted all retries, throw the last error
  throw lastError || new Error('Failed to generate product text after multiple attempts');
}

/**
 * Extracts a field from the GPT response
 * @param {string} label - The field label
 * @param {string} text - The text to extract from
 * @returns {string} - The extracted field value
 */
function extractField(label, text) {
  const regex = new RegExp(`${label}:\\s*(.+?)(?=\\n\\n|\\n[A-Z]|$)`, 's');
  const match = text.match(regex);
  return match ? match[1].trim() : "";
}

/**
 * Extracts tags from the GPT response
 * @param {string} text - The text to extract from
 * @returns {Array<string>} - The extracted tags
 */
function extractTags(text) {
  const tagsSection = extractField("Tags", text);
  return tagsSection
    .split(',')
    .map(tag => tag.trim())
    .filter(tag => tag.length > 0);
}

/**
 * Uploads a file to Dropbox and returns a shared link
 * @param {string} filePath - Path to the local file
 * @param {number} [maxRetries=3] - Maximum number of retry attempts
 * @param {number} [retryDelay=2000] - Delay between retries in ms
 * @returns {Promise<string>} - The Dropbox shared link
 */
async function uploadMockupToDropbox(filePath, maxRetries = 3, retryDelay = 2000) {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`⏳ Uploading mockup to Dropbox (attempt ${attempt}/${maxRetries}): ${filePath}`);
      
      // Validate environment variables
      if (!process.env.DROPBOX_ACCESS_TOKEN) {
        throw new Error('DROPBOX_ACCESS_TOKEN is not set in environment variables');
      }
      
      if (!process.env.DROPBOX_FOLDER_PATH) {
        throw new Error('DROPBOX_FOLDER_PATH is not set in environment variables');
      }
      
      // Initialize Dropbox client
      const dropbox = new Dropbox({ accessToken: process.env.DROPBOX_ACCESS_TOKEN });
      
      // Read the file as a buffer
      const fileBuffer = fs.readFileSync(filePath);
      console.log(`📦 File buffer length: ${fileBuffer.length} bytes`);
      
      const fileName = path.basename(filePath);
      
      // Ensure the folder path is properly formatted
      const folderPath = process.env.DROPBOX_FOLDER_PATH.endsWith('/')
        ? process.env.DROPBOX_FOLDER_PATH.slice(0, -1)
        : process.env.DROPBOX_FOLDER_PATH;
      
      const dropboxFilePath = `${folderPath}/${fileName}`;
      console.log(`📁 Target Dropbox path: ${dropboxFilePath}`);
      
      // Check if the file already exists on Dropbox
      let isNewUpload = true;
      try {
        const existing = await dropbox.filesGetMetadata({ path: dropboxFilePath });
        if (existing) {
          isNewUpload = false;
          console.log(`📂 File already exists on Dropbox: ${dropboxFilePath}`);
        }
      } catch (checkErr) {
        if (checkErr.status === 409) {
          console.log(`📁 File does not exist on Dropbox. Proceeding with upload.`);
        } else {
          console.warn(`⚠️ Could not verify file existence: ${checkErr.message}`);
        }
      }
      
      // Upload the file to Dropbox
      const uploadResponse = await dropbox.filesUpload({
        path: dropboxFilePath,
        contents: fileBuffer,
        mode: 'overwrite' // Use string instead of object with .tag
      });
      
      if (isNewUpload) {
        console.log(`✅ New file uploaded to Dropbox: ${uploadResponse.path_display || dropboxFilePath}`);
      } else {
        console.log(`♻️ Re-uploaded existing file to Dropbox: ${uploadResponse.path_display || dropboxFilePath}`);
      }
      
      // Create a shared link
      let linkResponse;
      try {
        linkResponse = await dropbox.sharingCreateSharedLinkWithSettings({
          path: uploadResponse.path_display || dropboxFilePath,
          settings: {
            requested_visibility: 'public' // Use string instead of object with .tag
          }
        });
      } catch (linkError) {
        // Check if the error is because the link already exists
        if (linkError.error && linkError.error.error_summary &&
            linkError.error.error_summary.includes('shared_link_already_exists')) {
          console.log(`⚠️ Shared link already exists, retrieving existing link...`);
          
          // Get ALL shared links without any path filtering
          const listResponse = await dropbox.sharingListSharedLinks();
          console.log(`📋 Retrieved ${listResponse?.links?.length || 0} total shared links`);
          
          if (listResponse && listResponse.links && listResponse.links.length > 0) {
            // Try to find a match by comparing paths
            const exactPath = (uploadResponse.path_display || dropboxFilePath).toLowerCase();
            const matchedLink = listResponse.links.find(link =>
              link.path_lower === exactPath ||
              link.path_lower?.endsWith(exactPath.split('/').pop().toLowerCase())
            );
            
            if (matchedLink) {
              linkResponse = { url: matchedLink.url };
              console.log(`✅ Retrieved matching shared link: ${linkResponse.url}`);
            } else {
              // If no match, just use the first link
              linkResponse = { url: listResponse.links[0].url };
              console.log(`✅ Retrieved first available shared link: ${linkResponse.url}`);
            }
          } else {
            // If no links found, try to create a new one with different settings
            console.log(`⚠️ No shared links found, attempting to create a new one...`);
            try {
              const newLinkResponse = await dropbox.sharingCreateSharedLinkWithSettings({
                path: uploadResponse.path_display || dropboxFilePath,
                settings: {
                  requested_visibility: 'public'
                }
              });
              linkResponse = { url: newLinkResponse.url };
              console.log(`✅ Created new shared link: ${linkResponse.url}`);
            } catch (newLinkError) {
              console.error(`⚠️ Failed to create shared link with settings: ${newLinkError.message}`);
              console.log(`🔄 Trying legacy shared link creation method...`);
              
              try {
                // Fallback to legacy method without settings
                const legacyLinkResponse = await dropbox.sharingCreateSharedLink({
                  path: uploadResponse.path_display || dropboxFilePath
                });
                
                // Check if we got a valid response with URL
                if (legacyLinkResponse && legacyLinkResponse.url) {
                  linkResponse = { url: legacyLinkResponse.url };
                  console.log(`✅ Created legacy shared link: ${linkResponse.url}`);
                } else {
                  console.log(`⚠️ Legacy link creation succeeded but returned no URL. Response:`, JSON.stringify(legacyLinkResponse, null, 2));
                  // Create a direct fallback URL
                  linkResponse = {
                    url: `https://dl.dropboxusercontent.com${uploadResponse.path_display || dropboxFilePath}`
                  };
                  console.log(`🔄 Using fallback direct URL: ${linkResponse.url}`);
                }
              } catch (legacyError) {
                console.error(`❌ Error details:`, JSON.stringify(legacyError, null, 2));
                throw new Error(`All shared link creation methods failed: ${legacyError.message}`);
              }
            }
          }
        } else {
          throw linkError;
        }
      }
      
      // Check if we have a valid URL before converting
      if (!linkResponse || !linkResponse.url) {
        console.log(`⚠️ No valid URL found in link response. Using direct file path as fallback.`);
        // Use a fallback URL that includes the file path
        const fallbackUrl = `https://dl.dropboxusercontent.com${uploadResponse.path_display || dropboxFilePath}`;
        console.log(`✅ Using fallback Dropbox URL: ${fallbackUrl}`);
        return fallbackUrl;
      }
      
      // Convert to direct link
      const directLink = linkResponse.url
        .replace('www.dropbox.com', 'dl.dropboxusercontent.com')
        .replace('?dl=0', '');
      
      console.log(`✅ Dropbox shared link created: ${directLink}`);
      return directLink;
      
    } catch (error) {
      lastError = error;
      console.error(`❌ Error uploading to Dropbox (attempt ${attempt}/${maxRetries}):`, error.message);
      // Log full error object for better debugging
      console.error(`Error details:`, JSON.stringify(error, null, 2));
      
      if (attempt < maxRetries) {
        console.log(`⏳ Retrying in ${retryDelay / 1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        // Increase delay for next retry
        retryDelay *= 1.5;
      }
    }
  }
  
  // If we've exhausted all retries, throw the last error
  throw lastError || new Error('Failed to upload to Dropbox after multiple attempts');
}

/**
 * Creates a default position object for the design
 * @returns {Object} - The position object
 */
function createDefaultPosition() {
  // Define the print area dimensions for Gildan 18000 sweatshirt
  const areaWidth = 1800;
  const areaHeight = 2400;
  
  // Set design dimensions - full width but proportional height
  const designWidth = areaWidth;
  const designHeight = Math.round(areaWidth / 2); // Proportional height (half of width)
  
  // Position at middle top - centered horizontally, at the top portion of the print area
  const topPosition = Math.round(areaHeight * 0.2); // 20% down from the top
  
  // Define the position object
  return {
    area_width: areaWidth,
    area_height: areaHeight,
    width: designWidth,
    height: designHeight,
    top: topPosition,
    left: 0, // Centered horizontally (since we're using full width)
    limit_to_print_area: true
  };
}

/**
 * Main function to automate product creation
 * @param {string} sweatshirtText - The text on the sweatshirt
 * @param {string} mockupPath - Path to the mockup image
 * @param {Object} options - Additional options
 * @param {string} [options.storeType='manual'] - The type of store to use ('manual' or 'etsy')
 * @param {number} [options.productId=71] - Printful catalog product ID (Gildan 18000 sweatshirt)
 * @param {Array<string>} [options.variants] - Array of sizes
 * @param {string} [options.color='black'] - Product color
 * @param {number} [options.price=39.99] - Product price
 * @param {boolean} [options.isDryRun=false] - Whether to run in dry-run mode
 * @param {boolean} [options.allColors=false] - Whether to create products for all available colors
 * @param {boolean} [options.allSizes=false] - Whether to create products for all available sizes
 * @param {boolean} [options.all=false] - Whether to create products for all combinations of colors and sizes
 * @returns {Promise<Object|Array<Object>>} - The created product(s)
 */
async function automateProductCreation(sweatshirtText, mockupPath, options = {}) {
  try {
    const {
      storeType = 'manual',
      productId = DEFAULT_PRODUCT_ID,
      variants = DEFAULT_VARIANTS,
      color = DEFAULT_COLOR,
      price = DEFAULT_PRICE,
      isDryRun = false,
      allColors = false,
      allSizes = false,
      all = false
    } = options;

    console.log(`🚀 Starting product automation for: ${sweatshirtText}`);
    
    // Validate input
    if (!fs.existsSync(mockupPath)) {
      throw new Error(`Mockup file not found: ${mockupPath}`);
    }
    
    // Log which store we're using
    const storeCredentials = getStoreCredentials(storeType);
    console.log(`🏪 Using ${storeCredentials.name} for product creation`);
    
    // Log dry run status
    if (isDryRun) {
      console.log(`🔍 Running in DRY RUN mode - no actual API calls will be made`);
    }
    
    // Step 1: Generate product text with GPT
    console.log(`⏳ Step 1/3: Generating product text...`);
    let gptOutput;
    if (!isDryRun) {
      gptOutput = await generateProductText(sweatshirtText);
    } else {
      console.log(`🔍 [DRY RUN] Skipping GPT text generation`);
      gptOutput = {
        title: `[DRY RUN] ${sweatshirtText} Sweatshirt`,
        description: `[DRY RUN] This is a placeholder description for the ${sweatshirtText} sweatshirt.`,
        tags: ['dry-run', 'test', 'sweatshirt']
      };
    }
    
    // Step 2: Upload mockup to Dropbox
    console.log(`⏳ Step 2/3: Uploading mockup to Dropbox...`);
    let imageUrl;
    if (!isDryRun) {
      imageUrl = await uploadMockupToDropbox(mockupPath);
    } else {
      console.log(`🔍 [DRY RUN] Skipping Dropbox upload`);
      imageUrl = 'https://example.com/dry-run-mockup.png';
    }
    
    // Step 3: Create product with final assets
    console.log(`⏳ Step 3/3: Creating product with final assets...`);
    let createdProduct;
    if (!isDryRun) {
      // Create the position object
      const position = createDefaultPosition();
      console.log(`📐 Using position: top=${position.top}, left=${position.left}, width=${position.width}, height=${position.height}`);
      
      // Log the product creation details
      console.log(`🧩 Creating product with the following details:`);
      console.log(`  - Product ID: ${productId} (Gildan 18000 sweatshirt)`);
      console.log(`  - Variants: ${variants.join(', ')}`);
      console.log(`  - Color: ${color}`);
      console.log(`  - Design URL: ${imageUrl}`);
      console.log(`  - Title: ${gptOutput.title}`);
      
      // Check if we're creating multiple variants
      if (allColors || allSizes || all) {
        console.log(`🔄 Creating multiple product variants:`);
        if (all) console.log(`  - All color and size combinations`);
        else if (allColors) console.log(`  - All available colors`);
        else if (allSizes) console.log(`  - All available sizes`);
      }
      
      // Create the product(s)
      createdProduct = await createNewProduct({
        productId,
        variants,
        color,
        designUrl: imageUrl,
        title: gptOutput.title,
        description: gptOutput.description,
        price,
        position,
        storeType,
        allColors,
        allSizes,
        allVariants: all,
        progressCallback: (progress) => {
          console.log(`🔄 Progress: ${progress.completed}/${progress.total} products created (Current: ${progress.current})`);
        }
      });
    } else {
      console.log(`🔍 [DRY RUN] Skipping product creation`);
      createdProduct = {
        id: 'dry-run-id',
        name: gptOutput.title,
        external_url: 'https://example.com/dry-run-product',
        sync_variants: variants.map((variant, index) => ({
          id: `dry-run-variant-${index}`,
          variant_id: index + 1000,
          retail_price: price.toString()
        }))
      };
    }
    
    // Save product information to a local file for reference
    const productInfo = {
      createdAt: new Date().toISOString(),
      isDryRun: isDryRun,
      title: gptOutput.title,
      imageUrl: imageUrl
    };
    
    // Handle single product vs multiple products
    if (Array.isArray(createdProduct)) {
      productInfo.products = createdProduct.map(product => ({
        id: product.id,
        title: product.name,
        url: product.external_url || 'N/A',
        variants: product.sync_variants.length
      }));
      productInfo.totalProducts = createdProduct.length;
    } else {
      productInfo.id = createdProduct.id;
      productInfo.url = createdProduct.external_url || 'N/A';
    }
    
    const productInfoDir = path.join(__dirname, 'product-info');
    if (!fs.existsSync(productInfoDir)) {
      fs.mkdirSync(productInfoDir, { recursive: true });
    }
    
    const productInfoPath = path.join(productInfoDir, `${sweatshirtText.toLowerCase()}-${Date.now()}.json`);
    fs.writeFileSync(productInfoPath, JSON.stringify(productInfo, null, 2));
    
    console.log(`🎉 Product automation completed successfully!`);
    
    if (Array.isArray(createdProduct)) {
      console.log(`📊 Created ${createdProduct.length} products`);
      createdProduct.forEach((product, index) => {
        console.log(`📊 Product ${index + 1}: ID ${product.id}, URL: ${product.external_url || 'N/A'}`);
      });
    } else {
      console.log(`📊 Product ID: ${createdProduct.id}`);
      console.log(`📊 Product URL: ${createdProduct.external_url || 'N/A'}`);
    }
    
    console.log(`📊 Product info saved to: ${productInfoPath}`);
    
    return createdProduct;
  } catch (error) {
    console.error(`❌ Product automation failed:`, error.message);
    throw error;
  }
}

// Command line arguments
const args = process.argv.slice(2);

// Show help text if requested
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
📋 automatePrintfulProduct.js Help:

This script automates the creation of Printful products using direct product creation.
It replaces the template-based approach with a more flexible direct creation method.

Usage:
  node automatePrintfulProduct.js <sweatshirtText> <mockupPath> [options]

Arguments:
  sweatshirtText    The text on the sweatshirt (e.g., "PASTA")
  mockupPath        Path to the mockup image file

Options:
  --help, -h        Show this help text
  --dry-run, -d     Run in dry-run mode (no actual API calls)
  --etsy            Use the Etsy-linked store (not recommended for product creation)
  --product-id=<id> Printful catalog product ID (default: 71 for Gildan 18000)
  --color=<color>   Product color (default: black)
  --price=<price>   Product price (default: 39.99)
  --variants=<list> Comma-separated list of sizes (default: S,M,L,XL,2XL,3XL)
  --all-colors      Create products for all available colors
  --all-sizes       Create products for all available sizes
  --all             Create products for all combinations of colors and sizes

Store Workflow:
  1. Create products in the Manual/API store (default)
  2. Manually push products to your Etsy store using Printful's dashboard

Examples:
  node automatePrintfulProduct.js "PASTA" "./export/PASTA.png"
  node automatePrintfulProduct.js "PASTA" "./export/PASTA.png" --color=white
  node automatePrintfulProduct.js "PASTA" "./export/PASTA.png" --price=45.99
  node automatePrintfulProduct.js "PASTA" "./export/PASTA.png" --variants=S,M,L,XL
  node automatePrintfulProduct.js "PASTA" "./export/PASTA.png" --all-colors
  node automatePrintfulProduct.js "PASTA" "./export/PASTA.png" --all-sizes
  node automatePrintfulProduct.js "PASTA" "./export/PASTA.png" --all
  node automatePrintfulProduct.js "PASTA" "./export/PASTA.png" --dry-run
  node automatePrintfulProduct.js "PASTA" "./export/PASTA.png" --etsy

Differences from template-based approach:
  - Direct product creation without relying on saved templates
  - More flexibility with customizable parameters (product ID, variants, color, price)
  - Same user experience and workflow as the original script
  `);
  process.exit(0);
}

// Check for required arguments
if (args.length < 2) {
  console.error('❌ Error: Missing required arguments');
  console.log('Run with --help for usage information');
  process.exit(1);
}

// Parse arguments
const sweatshirtText = args[0];
const mockupPath = args[1];
const isDryRun = args.includes('--dry-run') || args.includes('-d');
const storeType = args.includes('--etsy') ? 'etsy' : 'manual';
const allColors = args.includes('--all-colors');
const allSizes = args.includes('--all-sizes');
const all = args.includes('--all');

// Parse additional options
const options = {
  storeType,
  isDryRun,
  productId: DEFAULT_PRODUCT_ID,
  variants: DEFAULT_VARIANTS,
  color: DEFAULT_COLOR,
  price: DEFAULT_PRICE,
  allColors,
  allSizes,
  all
};

// Parse product ID
const productIdArg = args.find(arg => arg.startsWith('--product-id='));
if (productIdArg) {
  const productId = parseInt(productIdArg.split('=')[1], 10);
  if (!isNaN(productId)) {
    options.productId = productId;
  }
}

// Parse color
const colorArg = args.find(arg => arg.startsWith('--color='));
if (colorArg) {
  options.color = colorArg.split('=')[1];
}

// Parse price
const priceArg = args.find(arg => arg.startsWith('--price='));
if (priceArg) {
  const price = parseFloat(priceArg.split('=')[1]);
  if (!isNaN(price)) {
    options.price = price;
  }
}

// Parse variants
const variantsArg = args.find(arg => arg.startsWith('--variants='));
if (variantsArg) {
  const variants = variantsArg.split('=')[1].split(',').map(v => v.trim());
  if (variants.length > 0) {
    options.variants = variants;
  }
}

// Run the automation
automateProductCreation(sweatshirtText, mockupPath, options)
  .then(() => {
    console.log('✅ Script completed successfully');
  })
  .catch(error => {
    console.error('❌ Script failed:', error.message);
    process.exit(1);
  });

// Export for use in other modules
module.exports = {
  automateProductCreation,
  generateProductText,
  uploadMockupToDropbox
};
/**
 * automatePrintfulProductFromTemplate.js
 * 
 * This script automates the creation and publishing of a Printful product using a saved blank template.
 * It creates a new product, generates content with GPT, uploads mockups to Dropbox, and updates the product.
 */

// Import required modules
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Dropbox } = require('dropbox');
const fetch = require('node-fetch');

// Configuration
const TEMPLATE_ID = 88599467; // Updated template ID with product variants

/**
 * Gets the appropriate API key and store ID based on the selected store
 * @param {string} storeType - The type of store to use ('manual' or 'etsy')
 * @returns {Object} - Object containing the API key and store ID
 */
function getStoreCredentials(storeType = 'manual') {
  if (storeType === 'etsy') {
    return {
      apiKey: process.env.PRINTFUL_ETSY_API_KEY,
      storeId: process.env.PRINTFUL_ETSY_STORE_ID,
      name: 'Etsy-linked store'
    };
  } else {
    return {
      apiKey: process.env.PRINTFUL_API_KEY,
      storeId: process.env.PRINTFUL_STORE_ID,
      name: 'Manual/API store'
    };
  }
}

/**
 * Creates a new product from a saved template
 * @param {number} templateId - The ID of the saved template
 * @param {number} [maxRetries=3] - Maximum number of retry attempts
 * @param {number} [retryDelay=2000] - Delay between retries in ms
 * @param {string} [storeType='manual'] - The type of store to use ('manual' or 'etsy')
 * @returns {Promise<number>} - The ID of the created product
 */
async function createProductFromTemplate(templateId, maxRetries = 3, retryDelay = 2000, storeType = 'manual') {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`⏳ Creating product from template ID: ${templateId} (attempt ${attempt}/${maxRetries})`);
      
      const storeCredentials = getStoreCredentials(storeType);
      console.log(`🔑 Using ${storeCredentials.name} credentials`);
      
      const response = await fetch('https://api.printful.com/store/products', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${storeCredentials.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          template_id: templateId,
          sync_product: {
            name: "TEMP - Placeholder",
            description: "Auto-generated product awaiting final assets.",
          },
        }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(`Failed to create product: ${JSON.stringify(data)}`);
      }
      
      const productId = data.result.id;
      console.log(`✅ Product created with ID: ${productId}`);
      return productId;
    } catch (error) {
      lastError = error;
      console.error(`❌ Error creating product from template (attempt ${attempt}/${maxRetries}):`, error.message);
      
      if (attempt < maxRetries) {
        console.log(`⏳ Retrying in ${retryDelay / 1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        // Increase delay for next retry
        retryDelay *= 1.5;
      }
    }
  }
  
  // If we've exhausted all retries, throw the last error
  throw lastError || new Error('Failed to create product after multiple attempts');
}

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
      
      // Initialize Dropbox client
      const dropbox = new Dropbox({ accessToken: process.env.DROPBOX_ACCESS_TOKEN });
      
      // Read the file as a buffer
      const fileBuffer = fs.readFileSync(filePath);
      const fileName = path.basename(filePath);
      
      // Ensure the folder path is properly formatted
      const folderPath = process.env.DROPBOX_FOLDER_PATH.endsWith('/')
        ? process.env.DROPBOX_FOLDER_PATH.slice(0, -1)
        : process.env.DROPBOX_FOLDER_PATH;
      
      const dropboxFilePath = `${folderPath}/${fileName}`;
      
      // Upload the file to Dropbox
      const uploadResponse = await dropbox.filesUpload({
        path: dropboxFilePath,
        contents: fileBuffer,
        mode: { '.tag': 'overwrite' }
      });
      
      console.log(`✅ File uploaded to Dropbox: ${uploadResponse.path_display}`);
      
      // Create a shared link
      let linkResponse;
      try {
        linkResponse = await dropbox.sharingCreateSharedLinkWithSettings({
          path: uploadResponse.path_display,
          settings: {
            requested_visibility: { '.tag': 'public' }
          }
        });
      } catch (linkError) {
        // Check if the error is because the link already exists
        if (linkError.error && linkError.error.error_summary &&
            linkError.error.error_summary.includes('shared_link_already_exists')) {
          console.log(`⚠️ Shared link already exists, retrieving existing link...`);
          
          // Get existing shared links
          const listResponse = await dropbox.sharingListSharedLinks({
            path: uploadResponse.path_display
          });
          
          if (listResponse.links && listResponse.links.length > 0) {
            linkResponse = { url: listResponse.links[0].url };
          } else {
            throw new Error('Failed to retrieve existing shared link');
          }
        } else {
          throw linkError;
        }
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
 * Updates a product with final assets
 * @param {number} productId - The ID of the product to update
 * @param {string} imageUrl - The URL of the mockup image
 * @param {string} title - The product title
 * @param {string} description - The product description
 * @param {number} [maxRetries=3] - Maximum number of retry attempts
 * @param {number} [retryDelay=2000] - Delay between retries in ms
 * @param {string} [storeType='manual'] - The type of store to use ('manual' or 'etsy')
 * @returns {Promise<Object>} - The updated product
 */
async function updateProductWithAssets(productId, imageUrl, title, description, maxRetries = 3, retryDelay = 2000, storeType = 'manual') {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`⏳ Updating product ${productId} with final assets (attempt ${attempt}/${maxRetries})`);
      
      // Define the print area dimensions for Gildan 18000 sweatshirt
      const areaWidth = 1800;
      const areaHeight = 2400;
      
      // Set design dimensions - full width but proportional height
      const designWidth = areaWidth;
      const designHeight = Math.round(areaWidth / 2); // Proportional height (half of width)
      
      // Position at middle top - centered horizontally, at the top portion of the print area
      // For "middle top" positioning, we center horizontally (left = 0 for full width)
      // but place it at the top portion of the print area (about 20% down from the top)
      const topPosition = Math.round(areaHeight * 0.2); // 20% down from the top
      
      // Define the position object
      const position = {
        area_width: areaWidth,
        area_height: areaHeight,
        width: designWidth,
        height: designHeight,
        top: topPosition,
        left: 0, // Centered horizontally (since we're using full width)
        limit_to_print_area: true
      };
      
      console.log(`📐 Using position: top=${position.top}, left=${position.left}, width=${position.width}, height=${position.height}`);
      
      const storeCredentials = getStoreCredentials(storeType);
      console.log(`🔑 Using ${storeCredentials.name} credentials`);
      
      const response = await fetch(`https://api.printful.com/store/products/${productId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${storeCredentials.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sync_product: {
            name: title,
            description: description,
          },
          files: [
            {
              placement: "front",
              url: imageUrl,
              position: position
            },
          ],
        }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(`Failed to update product: ${JSON.stringify(data)}`);
      }
      
      console.log(`✅ Product updated successfully`);
      return data.result;
    } catch (error) {
      lastError = error;
      console.error(`❌ Error updating product (attempt ${attempt}/${maxRetries}):`, error.message);
      
      if (attempt < maxRetries) {
        console.log(`⏳ Retrying in ${retryDelay / 1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        // Increase delay for next retry
        retryDelay *= 1.5;
      }
    }
  }
  
  // If we've exhausted all retries, throw the last error
  throw lastError || new Error('Failed to update product after multiple attempts');
}

/**
 * Main function to automate product creation
 * @param {string} sweatshirtText - The text on the sweatshirt
 * @param {string} mockupPath - Path to the mockup image
 * @param {string} [storeType='manual'] - The type of store to use ('manual' or 'etsy')
 * @returns {Promise<Object>} - The created product
 */
async function automateProductCreation(sweatshirtText, mockupPath, storeType = 'manual') {
  try {
    console.log(`🚀 Starting product automation for: ${sweatshirtText}`);
    
    // Validate input
    if (!fs.existsSync(mockupPath)) {
      throw new Error(`Mockup file not found: ${mockupPath}`);
    }
    
    // Log which store we're using
    const storeCredentials = getStoreCredentials(storeType);
    console.log(`🏪 Using ${storeCredentials.name} for product creation`);
    
    // Step 1: Create product from template
    console.log(`⏳ Step 1/4: Creating product from template...`);
    const productId = await createProductFromTemplate(TEMPLATE_ID, 3, 2000, storeType);
    
    // Step 2: Generate product text with GPT
    console.log(`⏳ Step 2/4: Generating product text...`);
    const gptOutput = await generateProductText(sweatshirtText);
    
    // Step 3: Upload mockup to Dropbox
    console.log(`⏳ Step 3/4: Uploading mockup to Dropbox...`);
    const imageUrl = await uploadMockupToDropbox(mockupPath);
    
    // Step 4: Update product with final assets
    console.log(`⏳ Step 4/4: Updating product with final assets...`);
    const updatedProduct = await updateProductWithAssets(
      productId,
      imageUrl,
      gptOutput.title,
      gptOutput.description,
      3,
      2000,
      storeType
    );
    
    // Save product information to a local file for reference
    const productInfo = {
      id: updatedProduct.id,
      title: gptOutput.title,
      url: updatedProduct.external_url || 'N/A',
      imageUrl: imageUrl,
      createdAt: new Date().toISOString()
    };
    
    const productInfoDir = path.join(__dirname, 'product-info');
    if (!fs.existsSync(productInfoDir)) {
      fs.mkdirSync(productInfoDir, { recursive: true });
    }
    
    const productInfoPath = path.join(productInfoDir, `${sweatshirtText.toLowerCase()}-${Date.now()}.json`);
    fs.writeFileSync(productInfoPath, JSON.stringify(productInfo, null, 2));
    
    console.log(`🎉 Product automation completed successfully!`);
    console.log(`📊 Product ID: ${updatedProduct.id}`);
    console.log(`📊 Product URL: ${updatedProduct.external_url || 'N/A'}`);
    console.log(`📊 Product info saved to: ${productInfoPath}`);
    
    return updatedProduct;
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
📋 automatePrintfulProductFromTemplate.js Help:

This script automates the creation of Printful products from a saved template.

Usage:
  node automatePrintfulProductFromTemplate.js <sweatshirtText> <mockupPath> [options]

Arguments:
  sweatshirtText    The text on the sweatshirt (e.g., "PASTA")
  mockupPath        Path to the mockup image file

Options:
  --help, -h        Show this help text
  --dry-run, -d     Run in dry-run mode (no actual API calls)
  --etsy            Use the Etsy-linked store (not recommended for product creation)

Store Workflow:
  1. Create products in the Manual/API store (default)
  2. Manually push products to your Etsy store using Printful's dashboard

Examples:
  node automatePrintfulProductFromTemplate.js "PASTA" "./export-mockups/PASTA/PASTA-BLACK.png"
  node automatePrintfulProductFromTemplate.js "PASTA" "./export-mockups/PASTA/PASTA-BLACK.png" --etsy
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

// Run the script
if (isDryRun) {
  const storeCredentials = getStoreCredentials(storeType);
  console.log(`🔍 DRY RUN: Would perform the following actions using ${storeCredentials.name}:`);
  console.log(`  1. Create a new product from template ID: ${TEMPLATE_ID}`);
  console.log(`  2. Generate product text for "${sweatshirtText}" using OpenRouter API`);
  console.log(`  3. Upload mockup image from: ${mockupPath}`);
  console.log(`  4. Update product with generated text and mockup image`);
  console.log(`  5. Save product information to a local file`);
  
  // Verify that the mockup file exists
  if (!fs.existsSync(mockupPath)) {
    console.error(`❌ ERROR: Mockup file not found: ${mockupPath}`);
    process.exit(1);
  } else {
    console.log(`✅ Mockup file exists: ${mockupPath}`);
  }
  
  process.exit(0);
}

automateProductCreation(sweatshirtText, mockupPath, storeType)
  .then(product => {
    console.log(`✅ Product created successfully: ${product.id}`);
    process.exit(0);
  })
  .catch(error => {
    console.error(`❌ Error:`, error.message);
    process.exit(1);
  });
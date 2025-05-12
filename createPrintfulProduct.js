/**
 * createPrintfulProduct.js
 * 
 * This script provides functionality for direct product creation using the Printful API
 * without relying on saved templates. It allows for more flexible product creation with
 * customizable parameters.
 */

// Import required modules
require('dotenv').config();
const fetch = require('node-fetch');

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
 * Creates a new product directly using the Printful API
 * @param {Object} options - Product creation options
 * @param {number} options.productId - Printful catalog product ID (e.g., 4012 for Gildan 18000)
 * @param {Array<string>} options.variants - Array of sizes (e.g., ['S', 'M', 'L'])
 * @param {string} options.color - Product color (e.g., 'black', 'white')
 * @param {string} options.designUrl - URL to the design image
 * @param {string} options.title - Product title
 * @param {string} options.description - Product description
 * @param {number} options.price - Product price
 * @param {Object} [options.position] - Optional position settings for the design
 * @param {string} [options.storeType='manual'] - The type of store to use ('manual' or 'etsy')
 * @param {number} [options.maxRetries=3] - Maximum number of retry attempts
 * @param {number} [options.retryDelay=2000] - Delay between retries in ms
 * @param {boolean} [options.allColors=false] - Whether to create products for all available colors
 * @param {boolean} [options.allSizes=false] - Whether to create products for all available sizes
 * @param {boolean} [options.allVariants=false] - Whether to create products for all combinations of colors and sizes
 * @param {function} [options.progressCallback] - Optional callback function for progress updates
 * @returns {Promise<Object|Array<Object>>} - The created product(s)
 */
async function createNewProduct({
  productId,
  variants,
  color,
  designUrl,
  title,
  description,
  price,
  position = null,
  storeType = 'manual',
  maxRetries = 3,
  retryDelay = 2000,
  allColors = false,
  allSizes = false,
  allVariants = false,
  progressCallback = null
}) {
  // Default position if not provided
  if (!position) {
    // Define the print area dimensions for standard products
    const areaWidth = 1800;
    const areaHeight = 2400;
    
    // Set design dimensions - full width but proportional height
    const designWidth = areaWidth;
    const designHeight = Math.round(areaWidth / 2); // Proportional height (half of width)
    
    // Position at middle top - centered horizontally, at the top portion of the print area
    const topPosition = Math.round(areaHeight * 0.2); // 20% down from the top
    
    position = {
      area_width: areaWidth,
      area_height: areaHeight,
      width: designWidth,
      height: designHeight,
      top: topPosition,
      left: 0, // Centered horizontally (since we're using full width)
      limit_to_print_area: true
    };
  }
  
  // If creating all variants, we need to fetch all available variants first
  if (allColors || allSizes || allVariants) {
    console.log(`🔍 Fetching all available variants for product ID: ${productId}`);
    const { variants: allProductVariants, colors: availableColors, sizes: availableSizes } =
      await getAllProductVariants(productId, storeType);
    
    // Determine which colors and sizes to use
    const colorsToUse = allColors || allVariants ? availableColors : [color];
    const sizesToUse = allSizes || allVariants ? availableSizes : variants;
    
    console.log(`🎨 Creating products for colors: ${colorsToUse.join(', ')}`);
    console.log(`📏 Creating products for sizes: ${sizesToUse.join(', ')}`);
    
    // Create products for each color
    const createdProducts = [];
    let totalProducts = colorsToUse.length;
    let completedProducts = 0;
    
    for (const currentColor of colorsToUse) {
      try {
        // Update product title with color if creating multiple colors
        const colorTitle = colorsToUse.length > 1 ? `${title} - ${currentColor}` : title;
        
        // Create the product for this color
        console.log(`⏳ Creating product for color: ${currentColor} (${completedProducts + 1}/${totalProducts})`);
        
        const product = await createSingleProduct({
          productId,
          variants: sizesToUse,
          color: currentColor,
          designUrl,
          title: colorTitle,
          description,
          price,
          position,
          storeType,
          maxRetries,
          retryDelay,
          allProductVariants
        });
        
        createdProducts.push(product);
        completedProducts++;
        
        // Call progress callback if provided
        if (progressCallback && typeof progressCallback === 'function') {
          progressCallback({
            completed: completedProducts,
            total: totalProducts,
            current: currentColor,
            products: createdProducts
          });
        }
        
        // Add a delay between product creations to avoid rate limiting
        if (completedProducts < totalProducts) {
          console.log(`⏳ Waiting before creating next product to avoid rate limiting...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      } catch (error) {
        console.error(`❌ Error creating product for color ${currentColor}:`, error.message);
        // Continue with next color instead of failing the entire batch
      }
    }
    
    console.log(`✅ Created ${createdProducts.length} products successfully`);
    return createdProducts;
  } else {
    // Create a single product with the specified color and variants
    return await createSingleProduct({
      productId,
      variants,
      color,
      designUrl,
      title,
      description,
      price,
      position,
      storeType,
      maxRetries,
      retryDelay
    });
  }
}

/**
 * Creates a single product with the specified options
 * @param {Object} options - Product creation options
 * @returns {Promise<Object>} - The created product
 * @private
 */
async function createSingleProduct({
  productId,
  variants,
  color,
  designUrl,
  title,
  description,
  price,
  position,
  storeType = 'manual',
  maxRetries = 3,
  retryDelay = 2000,
  allProductVariants = null
}) {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`⏳ Creating new product: ${title} (attempt ${attempt}/${maxRetries})`);
      
      const storeCredentials = getStoreCredentials(storeType);
      console.log(`🔑 Using ${storeCredentials.name} credentials`);
      
      // Validate required parameters
      if (!productId) throw new Error('Product ID is required');
      if (!variants || !Array.isArray(variants) || variants.length === 0) {
        throw new Error('Variants must be a non-empty array');
      }
      if (!color) throw new Error('Color is required');
      if (!designUrl) throw new Error('Design URL is required');
      if (!title) throw new Error('Title is required');
      if (!description) throw new Error('Description is required');
      if (!price || isNaN(price)) throw new Error('Price must be a valid number');
      
      console.log(`📐 Using position: top=${position.top}, left=${position.left}, width=${position.width}, height=${position.height}`);
      
      // Build the variant data
      const syncVariants = [];
      
      for (const size of variants) {
        let variantId;
        
        // If we have all product variants, use findVariantId to get the correct variant ID
        if (allProductVariants) {
          variantId = findVariantId(allProductVariants, size, color);
          if (!variantId) {
            console.warn(`⚠️ Could not find variant ID for size ${size}, color ${color}. Skipping this variant.`);
            continue;
          }
        } else {
          // Otherwise use the getVariantId function
          try {
            variantId = getVariantId(productId, size, color);
          } catch (error) {
            console.warn(`⚠️ ${error.message}. Skipping this variant.`);
            continue;
          }
        }
        
        syncVariants.push({
          retail_price: price.toString(),
          variant_id: variantId,
          files: [
            {
              url: designUrl,
              type: 'front',
              position
            }
          ]
        });
      }
      
      // If no valid variants were found, throw an error
      if (syncVariants.length === 0) {
        throw new Error(`No valid variants found for product ID ${productId}, color ${color}`);
      }
      
      // Create the request payload
      const payload = {
        sync_product: {
          name: title,
          description: description,
          thumbnail: designUrl
        },
        sync_variants: syncVariants
      };
      
      console.log(`📦 Creating product with ${syncVariants.length} variants`);
      
      // Make the API request
      const response = await fetch('https://api.printful.com/store/products', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${storeCredentials.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(`Failed to create product: ${JSON.stringify(data)}`);
      }
      
      console.log(`✅ Product created successfully with ID: ${data.result.id}`);
      return data.result;
    } catch (error) {
      lastError = error;
      console.error(`❌ Error creating product (attempt ${attempt}/${maxRetries}):`, error.message);
      
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
 * Helper function to get the variant ID for a specific product, size, and color
 * Note: In a production environment, you would want to fetch these dynamically
 * from the Printful API using the catalog endpoints
 * 
 * @param {number} productId - Printful catalog product ID
 * @param {string} size - Size variant (e.g., 'S', 'M', 'L')
 * @param {string} color - Color variant (e.g., 'black', 'white')
 * @returns {number} - The variant ID
 */
function getVariantId(productId, size, color) {
  // This is a simplified example for Gildan 18000 sweatshirt
  // In a real implementation, you would fetch these from the Printful API
  // or maintain a mapping of product variants
  
  // Example mapping for Gildan 18000 (productId: 71)
  if (productId === 71) {
    const variantMap = {
      'black': {
        'S': 4012,
        'M': 4013,
        'L': 4014,
        'XL': 4015,
        '2XL': 4017,
        '3XL': 4018
      },
      'white': {
        'S': 4019,
        'M': 4020,
        'L': 4021,
        'XL': 4022,
        '2XL': 4023,
        '3XL': 4024
      },
      // Add more colors as needed
    };
    
    // Normalize color to lowercase for case-insensitive matching
    const normalizedColor = color.toLowerCase();
    
    if (variantMap[normalizedColor] && variantMap[normalizedColor][size]) {
      return variantMap[normalizedColor][size];
    }
  }
  
  throw new Error(`Variant not found for product ${productId}, size ${size}, color ${color}`);
}

/**
 * Fetches available variants for a product from the Printful API
 * This is useful for getting accurate variant IDs
 *
 * @param {number} productId - Printful catalog product ID
 * @param {string} [storeType='manual'] - The type of store to use
 * @returns {Promise<Array>} - Array of available variants
 */
async function getProductVariants(productId, storeType = 'manual') {
  try {
    console.log(`⏳ Fetching variants for product ID: ${productId}`);
    
    const storeCredentials = getStoreCredentials(storeType);
    
    const response = await fetch(`https://api.printful.com/products/${productId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${storeCredentials.apiKey}`,
      },
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(`Failed to fetch product variants: ${JSON.stringify(data)}`);
    }
    
    console.log(`✅ Retrieved ${data.result.variants.length} variants for product ID: ${productId}`);
    return data.result.variants;
  } catch (error) {
    console.error(`❌ Error fetching product variants:`, error.message);
    throw error;
  }
}

/**
 * Extracts unique colors from product variants
 *
 * @param {Array} variants - Array of product variants from the Printful API
 * @returns {Array<string>} - Array of unique color names
 */
function extractUniqueColors(variants) {
  const colorSet = new Set();
  
  variants.forEach(variant => {
    // Extract color from variant name or color property
    const colorInfo = variant.color || '';
    if (colorInfo) {
      colorSet.add(colorInfo.toLowerCase());
    }
  });
  
  return Array.from(colorSet);
}

/**
 * Extracts unique sizes from product variants
 *
 * @param {Array} variants - Array of product variants from the Printful API
 * @returns {Array<string>} - Array of unique size names
 */
function extractUniqueSizes(variants) {
  const sizeSet = new Set();
  
  variants.forEach(variant => {
    // Extract size from variant name or size property
    const sizeInfo = variant.size || '';
    if (sizeInfo) {
      sizeSet.add(sizeInfo);
    }
  });
  
  return Array.from(sizeSet);
}

/**
 * Fetches all available variants (colors and sizes) for a product
 *
 * @param {number} productId - Printful catalog product ID
 * @param {string} [storeType='manual'] - The type of store to use
 * @returns {Promise<Object>} - Object containing colors, sizes, and all variants
 */
async function getAllProductVariants(productId, storeType = 'manual') {
  try {
    console.log(`⏳ Fetching all available variants for product ID: ${productId}`);
    
    // Get all variants for the product
    const variants = await getProductVariants(productId, storeType);
    
    // Extract unique colors and sizes
    const colors = extractUniqueColors(variants);
    const sizes = extractUniqueSizes(variants);
    
    console.log(`✅ Found ${colors.length} colors and ${sizes.length} sizes for product ID: ${productId}`);
    console.log(`🎨 Colors: ${colors.join(', ')}`);
    console.log(`📏 Sizes: ${sizes.join(', ')}`);
    
    return {
      variants,
      colors,
      sizes
    };
  } catch (error) {
    console.error(`❌ Error fetching all product variants:`, error.message);
    throw error;
  }
}

/**
 * Finds the variant ID for a specific product, size, and color combination
 *
 * @param {Array} variants - Array of product variants from the Printful API
 * @param {string} size - Size variant (e.g., 'S', 'M', 'L')
 * @param {string} color - Color variant (e.g., 'black', 'white')
 * @returns {number|null} - The variant ID or null if not found
 */
function findVariantId(variants, size, color) {
  // Normalize color to lowercase for case-insensitive matching
  const normalizedColor = color.toLowerCase();
  
  // Find the matching variant
  const matchingVariant = variants.find(variant => {
    const variantColor = (variant.color || '').toLowerCase();
    const variantSize = variant.size || '';
    
    return variantColor === normalizedColor && variantSize === size;
  });
  
  return matchingVariant ? matchingVariant.id : null;
}

/**
 * Example usage of the createNewProduct function
 */
async function example() {
  try {
    const product = await createNewProduct({
      productId: 71, // Gildan 18000 sweatshirt
      variants: ['S', 'M', 'L', 'XL'],
      color: 'black',
      designUrl: 'https://example.com/design.png',
      title: 'Example Sweatshirt',
      description: 'This is an example sweatshirt created with the Printful API',
      price: 39.99
    });
    
    console.log('Product created:', product);
  } catch (error) {
    console.error('Failed to create product:', error);
  }
}

// Export the functions for use in other modules
module.exports = {
  createNewProduct,
  getProductVariants,
  getAllProductVariants,
  getVariantId,
  getStoreCredentials,
  extractUniqueColors,
  extractUniqueSizes,
  findVariantId
};

// If this script is run directly (not imported), run the example
if (require.main === module) {
  // Check for command line arguments
  const args = process.argv.slice(2);
  
  // Show help text if requested
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
📋 createPrintfulProduct.js Help:

This script provides functionality for direct product creation using the Printful API.

Usage:
  node createPrintfulProduct.js [options]

Options:
  --help, -h        Show this help text
  --example, -e     Run the example product creation

Examples:
  node createPrintfulProduct.js --example
  
You can also import this module in your own scripts:

const { createNewProduct } = require('./createPrintfulProduct');

async function main() {
  const product = await createNewProduct({
    productId: 71,
    variants: ['S', 'M', 'L', 'XL'],
    color: 'black',
    designUrl: 'https://example.com/design.png',
    title: 'Example Sweatshirt',
    description: 'This is an example sweatshirt',
    price: 39.99
  });
}
    `);
  } else if (args.includes('--example') || args.includes('-e')) {
    // Run the example
    example();
  } else {
    console.log('Run with --help for usage information or --example to run the example');
  }
}
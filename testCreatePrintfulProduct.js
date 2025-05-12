/**
 * testCreatePrintfulProduct.js
 * 
 * This script tests the createNewProduct function from createPrintfulProduct.js
 * by making an actual API call to Printful with sample data.
 * 
 * Usage:
 *   node testCreatePrintfulProduct.js [options]
 * 
 * Options:
 *   --productId=<id>       Printful catalog product ID (default: 4012 for Gildan 18000)
 *   --title=<title>        Product title
 *   --description=<desc>   Product description
 *   --price=<price>        Product price
 *   --color=<color>        Product color (default: black)
 *   --designUrl=<url>      URL to the design image
 *   --variants=<variants>  Comma-separated list of sizes (default: S,M,L,XL)
 *   --storeType=<type>     Store type to use (manual or etsy, default: manual)
 *   --verbose              Enable verbose logging
 *   --help                 Show help information
 */

// Import required modules
require('dotenv').config();
const { createNewProduct, getProductVariants, getAllProductVariants } = require('./createPrintfulProduct');
const chalk = require('chalk'); // For colored console output

// Default test values
const DEFAULT_TEST_VALUES = {
  productId: 71, // Gildan 18000 sweatshirt
  variants: ['S', 'M', 'L', 'XL'],
  color: 'black',
  designUrl: 'https://placekitten.com/800/800', // Placeholder image for testing
  title: 'Test Gildan 18000 Sweatshirt',
  description: 'This is a test sweatshirt created via the Printful API',
  price: 39.99,
  storeType: 'manual',
  verbose: false,
  allColors: false,
  allSizes: false,
  allVariants: false
};

/**
 * Parse command line arguments
 * @returns {Object} Parsed arguments
 */
function parseCommandLineArgs() {
  const args = process.argv.slice(2);
  const parsedArgs = { ...DEFAULT_TEST_VALUES };
  
  for (const arg of args) {
    if (arg === '--help' || arg === '-h') {
      showHelp();
      process.exit(0);
    } else if (arg === '--verbose' || arg === '-v') {
      parsedArgs.verbose = true;
    } else if (arg === '--all-colors') {
      parsedArgs.allColors = true;
    } else if (arg === '--all-sizes') {
      parsedArgs.allSizes = true;
    } else if (arg === '--all-variants' || arg === '--all') {
      parsedArgs.allVariants = true;
    } else if (arg.startsWith('--')) {
      const [key, value] = arg.slice(2).split('=');
      if (value === undefined) {
        console.warn(chalk.yellow(`Warning: Argument ${arg} has no value and will be ignored`));
        continue;
      }
      
      switch (key) {
        case 'productId':
          parsedArgs.productId = parseInt(value, 10);
          break;
        case 'price':
          parsedArgs.price = parseFloat(value);
          break;
        case 'variants':
          parsedArgs.variants = value.split(',').map(v => v.trim());
          break;
        case 'color':
        case 'designUrl':
        case 'title':
        case 'description':
        case 'storeType':
          parsedArgs[key] = value;
          break;
        default:
          console.warn(chalk.yellow(`Warning: Unknown argument ${key} will be ignored`));
      }
    }
  }
  
  return parsedArgs;
}

/**
 * Display help information
 */
function showHelp() {
  console.log(`
${chalk.bold('📋 testCreatePrintfulProduct.js Help:')}

This script tests the createNewProduct function by making an actual API call to Printful.

${chalk.bold('Usage:')}
  node testCreatePrintfulProduct.js [options]

${chalk.bold('Options:')}
  --productId=<id>       Printful catalog product ID (default: 4012 for Gildan 18000)
  --title=<title>        Product title
  --description=<desc>   Product description
  --price=<price>        Product price
  --color=<color>        Product color (default: black)
  --designUrl=<url>      URL to the design image
  --variants=<variants>  Comma-separated list of sizes (default: S,M,L,XL)
  --storeType=<type>     Store type to use (manual or etsy, default: manual)
  --all-colors           Create products for all available colors
  --all-sizes            Create products for all available sizes
  --all-variants, --all  Create products for all combinations of colors and sizes
  --verbose, -v          Enable verbose logging
  --help, -h             Show this help information

${chalk.bold('Examples:')}
  node testCreatePrintfulProduct.js
  node testCreatePrintfulProduct.js --color=white --price=45.99
  node testCreatePrintfulProduct.js --designUrl=https://example.com/mydesign.png --variants=S,M,L
  node testCreatePrintfulProduct.js --all-colors
  node testCreatePrintfulProduct.js --all-sizes
  node testCreatePrintfulProduct.js --all-variants
  `);
}

/**
 * Validate test configuration
 * @param {Object} config - Test configuration
 * @returns {boolean} True if valid, false otherwise
 */
function validateConfig(config) {
  let isValid = true;
  const errors = [];
  
  // Check for required environment variables
  if (!process.env.PRINTFUL_API_KEY) {
    errors.push('PRINTFUL_API_KEY is not set in environment variables');
    isValid = false;
  }
  
  if (config.storeType === 'etsy' && !process.env.PRINTFUL_ETSY_API_KEY) {
    errors.push('PRINTFUL_ETSY_API_KEY is not set in environment variables');
    isValid = false;
  }
  
  // Validate configuration values
  if (!config.productId || isNaN(config.productId)) {
    errors.push('Product ID must be a valid number');
    isValid = false;
  }
  
  if (!config.variants || !Array.isArray(config.variants) || config.variants.length === 0) {
    errors.push('Variants must be a non-empty array');
    isValid = false;
  }
  
  if (!config.color) {
    errors.push('Color is required');
    isValid = false;
  }
  
  if (!config.designUrl) {
    errors.push('Design URL is required');
    isValid = false;
  }
  
  if (!config.title) {
    errors.push('Title is required');
    isValid = false;
  }
  
  if (!config.description) {
    errors.push('Description is required');
    isValid = false;
  }
  
  if (!config.price || isNaN(config.price)) {
    errors.push('Price must be a valid number');
    isValid = false;
  }
  
  if (errors.length > 0) {
    console.error(chalk.red('❌ Configuration validation failed:'));
    errors.forEach(error => console.error(chalk.red(`  - ${error}`)));
  }
  
  return isValid;
}

/**
 * Format and print the product data in a readable way
 * @param {Object} product - The product data returned from the API
 * @param {boolean} verbose - Whether to show verbose output
 */
function printProductData(product, verbose) {
  console.log('\n' + chalk.green.bold('✅ Product created successfully!'));
  console.log(chalk.bold('\nProduct Details:'));
  console.log(`  ${chalk.cyan('ID:')} ${product.id}`);
  console.log(`  ${chalk.cyan('Name:')} ${product.name}`);
  console.log(`  ${chalk.cyan('External ID:')} ${product.external_id}`);
  
  console.log(chalk.bold('\nVariants:'));
  product.sync_variants.forEach((variant, index) => {
    console.log(`  ${chalk.cyan(`Variant ${index + 1}:`)}`);
    console.log(`    ${chalk.cyan('ID:')} ${variant.id}`);
    console.log(`    ${chalk.cyan('Variant ID:')} ${variant.variant_id}`);
    console.log(`    ${chalk.cyan('Price:')} $${variant.retail_price}`);
  });
  
  if (verbose) {
    console.log(chalk.bold('\nFull Response:'));
    console.log(JSON.stringify(product, null, 2));
  }
  
  console.log('\n' + chalk.green.bold('🎉 Test completed successfully!'));
}

/**
 * Validate the response from Printful
 * @param {Object} product - The product data returned from the API
 * @returns {boolean} True if valid, false otherwise
 */
function validateResponse(product) {
  let isValid = true;
  const errors = [];
  
  // Basic validation checks
  if (!product.id) {
    errors.push('Product ID is missing from response');
    isValid = false;
  }
  
  if (!product.name) {
    errors.push('Product name is missing from response');
    isValid = false;
  }
  
  if (!product.sync_variants || !Array.isArray(product.sync_variants) || product.sync_variants.length === 0) {
    errors.push('Product variants are missing or empty in response');
    isValid = false;
  } else {
    // Check each variant
    product.sync_variants.forEach((variant, index) => {
      if (!variant.id) {
        errors.push(`Variant ${index + 1} is missing ID`);
        isValid = false;
      }
      
      if (!variant.variant_id) {
        errors.push(`Variant ${index + 1} is missing variant_id`);
        isValid = false;
      }
      
      if (!variant.retail_price) {
        errors.push(`Variant ${index + 1} is missing retail_price`);
        isValid = false;
      }
    });
  }
  
  if (errors.length > 0) {
    console.error(chalk.red('❌ Response validation failed:'));
    errors.forEach(error => console.error(chalk.red(`  - ${error}`)));
  }
  
  return isValid;
}

/**
 * Main test function
 */
async function runTest() {
  try {
    console.log(chalk.bold('🧪 Starting Printful Product Creation Test'));
    
    // Parse command line arguments
    const config = parseCommandLineArgs();
    
    // Display test configuration
    console.log(chalk.bold('\nTest Configuration:'));
    console.log(`  ${chalk.cyan('Product ID:')} ${config.productId} (Gildan 18000 sweatshirt)`);
    console.log(`  ${chalk.cyan('Variants:')} ${config.variants.join(', ')}`);
    console.log(`  ${chalk.cyan('Color:')} ${config.color}`);
    console.log(`  ${chalk.cyan('Design URL:')} ${config.designUrl}`);
    console.log(`  ${chalk.cyan('Title:')} ${config.title}`);
    console.log(`  ${chalk.cyan('Description:')} ${config.description}`);
    console.log(`  ${chalk.cyan('Price:')} $${config.price}`);
    console.log(`  ${chalk.cyan('Store Type:')} ${config.storeType}`);
    console.log(`  ${chalk.cyan('All Colors:')} ${config.allColors ? 'Enabled' : 'Disabled'}`);
    console.log(`  ${chalk.cyan('All Sizes:')} ${config.allSizes ? 'Enabled' : 'Disabled'}`);
    console.log(`  ${chalk.cyan('All Variants:')} ${config.allVariants ? 'Enabled' : 'Disabled'}`);
    console.log(`  ${chalk.cyan('Verbose Mode:')} ${config.verbose ? 'Enabled' : 'Disabled'}`);
    
    // Validate configuration
    if (!validateConfig(config)) {
      process.exit(1);
    }
    
    console.log(chalk.bold('\n🔍 Fetching available variants for product...'));
    
    try {
      // Fetch available variants to verify the product exists
      const variants = await getProductVariants(config.productId, config.storeType);
      console.log(chalk.green(`✅ Found ${variants.length} variants for product ID ${config.productId}`));
      
      if (config.verbose) {
        console.log(chalk.bold('\nAvailable Variants:'));
        variants.forEach(variant => {
          console.log(`  - ${variant.name} (ID: ${variant.id})`);
        });
      }
    } catch (error) {
      console.warn(chalk.yellow(`⚠️ Could not fetch variants: ${error.message}`));
      console.log(chalk.yellow('⚠️ Continuing with test, but variant IDs might be incorrect'));
    }
    
    console.log(chalk.bold('\n🚀 Creating new product...'));
    
    // Create the product
    const product = await createNewProduct({
      productId: config.productId,
      variants: config.variants,
      color: config.color,
      designUrl: config.designUrl,
      title: config.title,
      description: config.description,
      price: config.price,
      storeType: config.storeType,
      allColors: config.allColors,
      allSizes: config.allSizes,
      allVariants: config.allVariants,
      progressCallback: (progress) => {
        console.log(chalk.blue(`🔄 Progress: ${progress.completed}/${progress.total} products created (Current: ${progress.current})`));
      }
    });
    
    // Validate the response and print the product data
    if (Array.isArray(product)) {
      console.log(chalk.green.bold(`✅ Created ${product.length} products successfully!`));
      
      product.forEach((p, index) => {
        console.log(chalk.bold(`\n${chalk.cyan(`Product ${index + 1}/${product.length}:`)}`));
        
        if (!validateResponse(p)) {
          console.warn(chalk.yellow(`⚠️ Response validation failed for product ${index + 1}, but product was created`));
        }
        
        printProductData(p, config.verbose);
      });
    } else {
      // Validate the response
      if (!validateResponse(product)) {
        console.warn(chalk.yellow('⚠️ Response validation failed, but product was created'));
      }
      
      // Print the product data
      printProductData(product, config.verbose);
    }
    
  } catch (error) {
    console.error(chalk.red(`❌ Test failed: ${error.message}`));
    
    if (error.response && error.response.data) {
      console.error(chalk.red('API Error Details:'));
      console.error(JSON.stringify(error.response.data, null, 2));
    }
    
    process.exit(1);
  }
}

// Run the test if this script is executed directly
if (require.main === module) {
  // Check if help was requested
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    showHelp();
  } else {
    runTest();
  }
}

// Export for use in other modules
module.exports = {
  runTest,
  validateConfig,
  validateResponse
};
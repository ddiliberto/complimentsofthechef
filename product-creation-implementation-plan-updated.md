# Product Creation Implementation Plan (Updated)

## Overview

This document outlines the implementation plan for step 5 of the printful-integration-plan.md: "Implement Product Creation". The goal is to enhance the current implementation by adding support for creating product templates before syncing products to Etsy.

## Current State

The current implementation in `uploadToPrintful.js` already:
1. Reads PNG files from the export/ directory
2. Generates listing content using OpenRouter
3. Uploads files to Printful
4. Creates sync products with Etsy integration

## Enhancements Needed

To follow best practices and allow for reusability, we need to:
1. Update the `.env` file with the actual Printful store ID
2. Implement a `createProductTemplate()` function to create reusable product templates
3. Update the `createProductWithEtsySync()` function to optionally use the created template
4. Modify the process flow to create a template before syncing the product
5. Position the design at the top center with full width

## Implementation Details

### 1. Update the .env file

Update the `.env` file with the actual Printful store ID:

```
PRINTFUL_STORE_ID=12830533
```

### 2. Implement createProductTemplate() Function with Top Center Full Width Positioning

Add this function to `uploadToPrintful.js` with updated positioning parameters:

```javascript
/**
 * Create a product template on Printful for a design
 * @param {string} designName - The design name (e.g., 'TACOS')
 * @param {string} fileUrl - Direct URL to the uploaded design file
 * @param {Array<number>} variantIds - Array of Printful variant IDs
 * @returns {Promise<number>} - The created template ID
 */
async function createProductTemplate(designName, fileUrl, variantIds) {
  try {
    console.log(`⏳ Creating product template for: ${designName}`);

    // Get printfile dimensions for the Gildan 18000 sweatshirt
    // These values are based on the examples provided
    const areaWidth = 1800;
    const areaHeight = 2400;
    
    // Position the design at the top center with full width
    // Using full width (1800px) and proportional height
    const designWidth = areaWidth; // Full width
    const designHeight = Math.round(areaWidth / 2); // Proportional height (half of width)
    
    // Position at the top center (top: 0, left: 0)
    const position = {
      area_width: areaWidth,
      area_height: areaHeight,
      width: designWidth,
      height: designHeight,
      top: 0, // Position at the top
      left: 0, // Position at the left (since we're using full width)
      limit_to_print_area: true
    };

    console.log(`📐 Using position: top=${position.top}, left=${position.left}, width=${position.width}, height=${position.height}`);

    const response = await printfulApi.post('/product-templates', {
      variant_ids: variantIds,
      name: `${designName} Sweatshirt Template`,
      files: [
        {
          placement: 'front',
          url: fileUrl,
          position
        }
      ],
      options: [] // Optional: add Printful options (labels, embroidery, etc.)
    });

    const templateId = response.data?.result?.id;
    if (!templateId) {
      throw new Error('No template ID returned from Printful');
    }

    console.log(`✅ Template created with ID: ${templateId}`);
    return templateId;

  } catch (error) {
    console.error(`❌ Failed to create template for ${designName}:`, error.message);
    throw error;
  }
}
```

### 3. Update createProductWithEtsySync() Function

Modify the `createProductWithEtsySync()` function to accept an optional `templateId` parameter:

```javascript
/**
 * Create product with Etsy sync
 * @param {string} word - Product word
 * @param {Object} listingContent - Listing content from OpenRouter
 * @param {Object} manualMockup - Mockup generation result
 * @param {number} [templateId] - Optional template ID to use
 * @returns {Promise<Object>} Created product
 */
async function createProductWithEtsySync(word, listingContent, manualMockup, templateId = null) {
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
    const productData = {
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
    };
    
    // Add template_id if provided
    if (templateId) {
      productData.sync_product.template_id = templateId;
      console.log(`🔗 Using template ID: ${templateId} for product creation`);
    }
    
    const response = await printfulApi.post('/store/products', productData);
    
    console.log(`✅ Product created: ${listingContent.title}`);
    
    // Rest of the function remains the same...
    // (handling mockup files, etc.)
    
    return response.data.result;
  } catch (error) {
    console.error(`❌ Error creating product:`, error.message);
    throw error;
  }
}
```

### 4. Update the Process Flow

Modify the `processFile()` function to create a template before syncing the product:

```javascript
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
      console.log(`🔍 DRY RUN: Would create product template and sync with Etsy using:`);
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
      // ... (existing mockup generation code)
      
      // Look for mockups in the export-mockups directory
      // ... (existing mockup finding code)
      
      // Create a mockup data structure with the available mockups
      manualMockup = {
        mockups: mockupFiles.length > 0
          ? [{ mockup_url: fileUrl, mockup_files: mockupFiles }]
          : [{ mockup_url: fileUrl }]
      };
      
      console.log(`📊 Found ${mockupFiles.length} mockup files for ${word}`);
      
      // Step 3: Create product template
      console.log(`⏳ Creating product template...`);
      const variantIds = Object.values(VARIANT_IDS);
      let templateId = null;
      
      try {
        templateId = await createProductTemplate(word, fileUrl, variantIds);
        console.log(`✅ Product template created with ID: ${templateId}`);
      } catch (templateError) {
        console.error(`❌ Error creating product template: ${templateError.message}`);
        console.log(`⚠️ Continuing with product sync without template...`);
      }
      
      // Step 4: Create product with Etsy sync
      console.log(`⏳ Creating product with Etsy sync...`);
      const product = await createProductWithEtsySync(word, listingContent, manualMockup, templateId);
      
      console.log(`✅ Successfully processed ${word}`);
      return product;
    } catch (uploadError) {
      // ... (existing error handling code)
    }
  } catch (error) {
    console.error(`❌ Error processing ${word}:`, error.message);
    // Continue with next file
    return null;
  }
}
```

### 5. Add CLI Options for Template-Only and Sync-Only Modes

Add new command-line arguments to support template-only and sync-only modes:

```javascript
// Command line arguments
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run') || args.includes('-d');
const TEMPLATE_ONLY = args.includes('--template-only') || args.includes('-t');
const SYNC_ONLY = args.includes('--sync-only') || args.includes('-s');

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

// Validate conflicting options
if (TEMPLATE_ONLY && SYNC_ONLY) {
  console.error('❌ Error: Cannot use both --template-only and --sync-only options together.');
  process.exit(1);
}
```

Then update the `processFile()` function to respect these options:

```javascript
// Inside processFile(), after getting fileUrl:

// Create product template if not in sync-only mode
let templateId = null;
if (!SYNC_ONLY) {
  console.log(`⏳ Creating product template...`);
  const variantIds = Object.values(VARIANT_IDS);
  
  try {
    templateId = await createProductTemplate(word, fileUrl, variantIds);
    console.log(`✅ Product template created with ID: ${templateId}`);
    
    // If template-only mode, stop here
    if (TEMPLATE_ONLY) {
      console.log(`✅ Template-only mode: Skipping product sync for ${word}`);
      return { templateId, word };
    }
  } catch (templateError) {
    console.error(`❌ Error creating product template: ${templateError.message}`);
    if (TEMPLATE_ONLY) {
      throw templateError; // In template-only mode, fail if template creation fails
    }
    console.log(`⚠️ Continuing with product sync without template...`);
  }
}

// Create product with Etsy sync if not in template-only mode
if (!TEMPLATE_ONLY) {
  console.log(`⏳ Creating product with Etsy sync...`);
  const product = await createProductWithEtsySync(word, listingContent, manualMockup, templateId);
  console.log(`✅ Successfully processed ${word}`);
  return product;
}
```

## Testing Strategy

1. Test with a single file first using the `--limit=1` option
2. Verify that the product template is created correctly with the top center full width positioning
3. Verify that the sync product is created with the correct template ID
4. Test the `--template-only` and `--sync-only` options
5. Verify error handling when template creation fails

## Future Enhancements

1. Implement a caching mechanism to store template IDs for each design
2. Add support for different product types
3. Implement batch processing for improved efficiency
4. Add a web interface for monitoring uploads
5. Add support for updating existing templates and products

## Implementation Steps

1. Switch to Code mode to implement these changes
2. Update the `.env` file with the actual store ID
3. Add the `createProductTemplate()` function with top center full width positioning
4. Update the `createProductWithEtsySync()` function
5. Modify the process flow in `processFile()`
6. Add CLI options for template-only and sync-only modes
7. Test the implementation with a single file
8. Implement any necessary fixes or improvements
9. Test with multiple files
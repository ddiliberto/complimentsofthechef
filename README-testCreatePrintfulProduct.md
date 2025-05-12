# Test Printful Product Creation

This script tests the direct product creation functionality in `createPrintfulProduct.js` by making actual API calls to Printful.

## Prerequisites

- Node.js installed
- Printful API key set in `.env` file
- Required npm packages installed (`npm install`)

## Usage

Run the test script with default values:

```bash
npm run test:printful
```

Or directly:

```bash
node testCreatePrintfulProduct.js
```

## Command Line Options

You can customize the test by passing command line arguments:

```bash
# Test with a different product color
node testCreatePrintfulProduct.js --color=white

# Test with a custom design URL
node testCreatePrintfulProduct.js --designUrl=https://example.com/mydesign.png

# Test with specific variants and price
node testCreatePrintfulProduct.js --variants=S,M,L --price=45.99

# Test with the Etsy-linked store instead of the manual store
node testCreatePrintfulProduct.js --storeType=etsy

# Enable verbose output
node testCreatePrintfulProduct.js --verbose
```

## Available Options

- `--productId=<id>` - Printful catalog product ID (default: 4012 for Gildan 18000)
- `--title=<title>` - Product title
- `--description=<desc>` - Product description
- `--price=<price>` - Product price
- `--color=<color>` - Product color (default: black)
- `--designUrl=<url>` - URL to the design image
- `--variants=<variants>` - Comma-separated list of sizes (default: S,M,L,XL)
- `--storeType=<type>` - Store type to use (manual or etsy, default: manual)
- `--verbose` - Enable verbose logging
- `--help` - Show help information

## Example Output

When run successfully, the script will output information about the created product:

```
🧪 Starting Printful Product Creation Test

Test Configuration:
  Product ID: 4012 (Gildan 18000 sweatshirt)
  Variants: S, M, L, XL
  Color: black
  Design URL: https://placekitten.com/800/800
  Title: Test Gildan 18000 Sweatshirt
  Description: This is a test sweatshirt created via the Printful API
  Price: $39.99
  Store Type: manual
  Verbose Mode: Disabled

🔍 Fetching available variants for product...
✅ Found 24 variants for product ID 4012

🚀 Creating new product...
⏳ Creating new product: Test Gildan 18000 Sweatshirt (attempt 1/3)
🔑 Using Manual/API store credentials
📐 Using position: top=480, left=0, width=1800, height=900
📦 Creating product with 4 variants
✅ Product created successfully with ID: 123456789

Product Details:
  ID: 123456789
  Name: Test Gildan 18000 Sweatshirt
  External ID: custom-1620144000000

Variants:
  Variant 1:
    ID: 987654321
    Variant ID: 4013
    Price: $39.99
  Variant 2:
    ID: 987654322
    Variant ID: 4014
    Price: $39.99
  Variant 3:
    ID: 987654323
    Variant ID: 4015
    Price: $39.99
  Variant 4:
    ID: 987654324
    Variant ID: 4016
    Price: $39.99

🎉 Test completed successfully!
```

## Notes

- This script makes actual API calls to Printful and will create real products in your store
- Products created during testing may need to be manually deleted from your Printful dashboard
- The script includes retry logic to handle temporary API failures
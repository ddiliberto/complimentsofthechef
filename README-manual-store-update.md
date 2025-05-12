# Printful Manual Store Update

## Overview

The script has been updated to work with your new Manual/API Printful store. This update allows you to create products via the API in your Manual/API store, which can then be manually pushed to your Etsy store using Printful's dashboard tools.

## Changes Made

1. Updated the `.env` file to include both store credentials:
   - Original Etsy-linked store: `PRINTFUL_ETSY_API_KEY` and `PRINTFUL_ETSY_STORE_ID`
   - Manual/API store: `PRINTFUL_API_KEY` and `PRINTFUL_STORE_ID`

2. Enhanced the script to support multiple stores:
   - Added a `--etsy` flag to specify which store to use (defaults to Manual/API store)
   - Added store selection logic to use the appropriate API key
   - Updated error handling and documentation

## How to Use

### Creating Products (Default Workflow)

By default, the script will use your Manual/API store credentials:

```bash
node automatePrintfulProductFromTemplate.js "PASTA" "./export/PASTA.png"
```

This will:
1. Create a product in your Manual/API store
2. Generate content with GPT
3. Upload mockups to Dropbox
4. Update the product with the final assets

### Using with Etsy Store (Not Recommended for Creation)

If you need to interact with your Etsy-linked store, you can use the `--etsy` flag:

```bash
node automatePrintfulProductFromTemplate.js "PASTA" "./export/PASTA.png" --etsy
```

**Note:** This is not recommended for product creation as the Etsy-linked store doesn't support the product creation API endpoints.

## Workflow for Etsy Products

1. Create products in your Manual/API store using this script
2. Go to your Printful dashboard
3. Navigate to your Manual/API store ("Compliments API Staging")
4. Find the created product
5. Use Printful's dashboard tools to manually push the product to your Etsy store

## Testing the Changes

You can test the script with a dry run:

```bash
node automatePrintfulProductFromTemplate.js "PASTA" "./export/PASTA.png" --dry-run
```

This will show you what actions would be performed without making any actual API calls.
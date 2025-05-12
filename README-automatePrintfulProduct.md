# Printful Direct Product Creation Script

This script automates the creation and publishing of Printful products using direct product creation instead of templates. It provides more flexibility and control over the product creation process.

## Features

- Creates products directly without relying on saved templates
- Generates SEO-optimized title, description, and tags using GPT (via OpenRouter)
- Uploads mockup images to Dropbox
- Customizable parameters (product ID, variants, color, price)
- Positions the design at "middle top, front"
- Saves product information to a local file for reference

## Prerequisites

- Node.js installed
- API keys set up in `.env` file:
  - `PRINTFUL_API_KEY` - Your Printful API key
  - `OPENROUTER_API_KEY` - Your OpenRouter API key for GPT access
  - `DROPBOX_ACCESS_TOKEN` - Your Dropbox access token
  - `DROPBOX_FOLDER_PATH` - The folder path in Dropbox where images will be stored

## Installation

1. Make sure you have Node.js installed
2. Install the required dependencies:

```bash
npm install dotenv fs path dropbox node-fetch
```

3. Set up your `.env` file with the required API keys

## Usage

```bash
node automatePrintfulProduct.js <sweatshirtText> <mockupPath> [options]
```

### Arguments

- `sweatshirtText` - The text on the sweatshirt (e.g., "PASTA")
- `mockupPath` - Path to the mockup image file

### Options

- `--help`, `-h` - Show help text
- `--dry-run`, `-d` - Run in dry-run mode (no actual API calls)
- `--etsy` - Use the Etsy-linked store (not recommended for product creation)
- `--product-id=<id>` - Printful catalog product ID (default: 4012 for Gildan 18000)
- `--color=<color>` - Product color (default: black)
- `--price=<price>` - Product price (default: 39.99)
- `--variants=<list>` - Comma-separated list of sizes (default: S,M,L,XL,2XL,3XL)

### Examples

```bash
# Create a product with the text "PASTA" using the specified mockup
node automatePrintfulProduct.js "PASTA" "./export/PASTA.png"

# Create a product with a white sweatshirt
node automatePrintfulProduct.js "PASTA" "./export/PASTA.png" --color=white

# Create a product with a custom price
node automatePrintfulProduct.js "PASTA" "./export/PASTA.png" --price=45.99

# Create a product with specific size variants
node automatePrintfulProduct.js "PASTA" "./export/PASTA.png" --variants=S,M,L,XL

# Dry run to see what would happen without making API calls
node automatePrintfulProduct.js "PASTA" "./export/PASTA.png" --dry-run

# Show help text
node automatePrintfulProduct.js --help
```

## Differences from Template-Based Approach

The original `automatePrintfulProductFromTemplate.js` script relied on a saved template in Printful to create products. This new approach offers several advantages:

1. **No Template Dependency**: Creates products directly without requiring a pre-saved template
2. **More Flexibility**: Allows customization of product parameters like variants, colors, and prices
3. **Same User Experience**: Maintains the same command-line interface and workflow as the original script
4. **Additional Options**: Provides more command-line options for customization

## Error Handling

The script includes robust error handling with retry mechanisms for all API calls:

- Each API call will retry up to 3 times with exponential backoff
- Detailed error messages are provided for troubleshooting
- The script validates inputs before making API calls

## Output

The script saves product information to a local file in the `product-info` directory. The file is named using the format `{sweatshirtText}-{timestamp}.json` and contains:

- Product ID
- Title
- URL
- Image URL
- Creation timestamp
- Dry run status

## Workflow

1. The script generates SEO-optimized title, description, and tags using GPT
2. It uploads the mockup image to Dropbox
3. It creates the Printful product with the final image mockup and GPT-generated content
4. It saves the product information to a local file for reference

## Customization

You can customize the script by modifying the following:

- Default values at the top of the script (product ID, variants, color, price)
- Position parameters in the `createDefaultPosition` function to adjust the design placement
- Retry parameters for API calls to adjust the number of retries and delay between retries
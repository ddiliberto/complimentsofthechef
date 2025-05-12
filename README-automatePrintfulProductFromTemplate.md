# Printful Product Automation Script

This script automates the creation and publishing of Printful products using a saved blank template for the Gildan 18000 sweatshirt.

## Features

- Creates a new product from a saved template (ID: 85534641)
- Generates SEO-optimized title, description, and tags using GPT (via OpenRouter)
- Uploads mockup images to Dropbox
- Updates the Printful product with the final image mockup and GPT-generated content
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
node automatePrintfulProductFromTemplate.js <sweatshirtText> <mockupPath>
```

### Arguments

- `sweatshirtText` - The text on the sweatshirt (e.g., "PASTA")
- `mockupPath` - Path to the mockup image file

### Options

- `--help`, `-h` - Show help text
- `--dry-run`, `-d` - Run in dry-run mode (no actual API calls)

### Examples

```bash
# Create a product with the text "PASTA" using the specified mockup
node automatePrintfulProductFromTemplate.js "PASTA" "./export-mockups/PASTA/PASTA-BLACK.png"

# Dry run to see what would happen without making API calls
node automatePrintfulProductFromTemplate.js "PASTA" "./export-mockups/PASTA/PASTA-BLACK.png" --dry-run

# Show help text
node automatePrintfulProductFromTemplate.js --help
```

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

## Workflow

1. The script creates a new product from the saved template
2. It generates SEO-optimized title, description, and tags using GPT
3. It uploads the mockup image to Dropbox
4. It updates the Printful product with the final image mockup and GPT-generated content
5. It saves the product information to a local file for reference

## Customization

You can customize the script by modifying the following:

- `TEMPLATE_ID` - Change this to use a different template
- Position parameters in the `updateProductWithAssets` function to adjust the design placement
- Retry parameters for API calls to adjust the number of retries and delay between retries
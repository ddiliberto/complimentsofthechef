
# 🧵 Illustrator Automation to Etsy via Printful

An end-to-end Node.js and Illustrator JSX pipeline that:

1. Generates PNG sweatshirt graphics from one-word food names using Illustrator
2. Creates GPT-generated Etsy product listings using OpenRouter
3. Uploads designs to Printful and creates draft Etsy listings

---

## 📁 Project Structure

```bash
illustrator-automation/
├── export/                         # Output folder for PNGs
├── node_modules/
├── scripts/                        # (Reserved for reusable JSX and shell scripts)
├── .env                            # API keys for OpenRouter and Printful
├── exportText.jsx                 # Illustrator script for generating & exporting one word PNG
├── generate.js                    # Node script that reads words.csv, customizes exportText.jsx, and runs Illustrator
├── generateListingFromOpenRouter.js  # GPT wrapper that generates Etsy listing JSON using OpenRouter
├── uploadToPrintful.js           # Script to upload PNGs to Printful and create Etsy listings
├── template.ai                    # Illustrator template with a named text layer ("wordText")
├── words.csv                      # Input CSV (word, fill color, stroke color)
├── package.json
```

---

## 🛠 Setup

1. Clone the repo  
2. Run `npm install`  
3. Add your `.env` file:

```env
OPENROUTER_API_KEY=your-key-here
PRINTFUL_API_KEY=your-printful-api-key
PRINTFUL_STORE_ID=your-printful-store-id
```

4. Ensure Illustrator is installed and that you’re running on macOS (required for `osascript`).

---

## 🧠 Scripts Breakdown

### `exportText.jsx`

- Illustrator ExtendScript (JSX)
- Targets a text frame named `wordText`
- Updates the text content, fill, and stroke color
- Resizes the artboard to fit the text
- Exports a PNG to `~/Desktop/illustrator-automation/export/` (can be updated)

---

### `generate.js`

- Node script
- Reads each row from `words.csv`
- Injects content into a `.jsx` file
- Runs Illustrator via AppleScript:
  ```bash
  osascript -e 'tell application "Adobe Illustrator" to do javascript ...'
  ```

---

### `generateListingFromOpenRouter.js`

- Uses OpenRouter API to generate Etsy listing content
- For each word:
  - Sends a GPT-4 prompt to generate:
    - `title` (SEO optimized)
    - `description` (formatted with emojis and details)
    - `tags` (up to 13, Etsy-friendly)
- Returns JSON for integration into Printful product payloads

---

### `uploadToPrintful.js`

- Completes the end-to-end pipeline
- Processes all PNG files in the export/ directory
- Uses generateListingFromOpenRouter.js to create content for each design
- Uploads PNG files to Printful
- Generates mockups using Printful's Mockup Generator API
- Creates draft Etsy listings through Printful's API
- Handles errors and provides detailed logging

---

### `words.csv`

Defines all sweatshirt designs to generate.

Example:

| word       | fill     | stroke   |
|------------|----------|----------|
| TACOS      | #C8102E  | #C8102E  |
| CHURROS    | #9C6644  | #9C6644  |
| GUACAMOLE  | #76B947  | #76B947  |

---

## 🧩 Implementation Notes

- The complete end-to-end pipeline is now implemented
- The uploadToPrintful.js script handles:
  - Looping through the `export/` directory
  - Uploading each PNG to Printful
  - Using listing content from GPT
  - Creating products using Printful's API
  - Setting Etsy listings to `draft` status
- Error handling and logging are implemented throughout the pipeline
- This pipeline assumes a macOS environment for Illustrator scripting

---

## 💬 Example Commands

```bash
# 1. Generate designs from CSV
node generate.js

# 2. Generate listing content (optional, as uploadToPrintful.js will do this automatically)
node generateListingFromOpenRouter.js

# 3. Upload to Printful and create Etsy listings
node uploadToPrintful.js

# Additional options for uploadToPrintful.js:
# Dry run (simulate without making API calls)
node uploadToPrintful.js --dry-run

# Process only a limited number of files
node uploadToPrintful.js --limit=5

# Combine options
node uploadToPrintful.js --dry-run --limit=3
```

---

## 📦 Dependencies

- Node.js  
- Adobe Illustrator (macOS)  
- OpenRouter API
- Printful API
- Gildan 18000 support in Printful

---

Let me know if you’d like a CLI tool, a VSCode tasks file, or GitHub repo starter structure to go with this.

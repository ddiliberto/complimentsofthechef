# Google Sheets Dashboard Sync Implementation Plan

## Overview
This plan outlines the implementation of a Google Sheets Dashboard Sync feature for the uploadToPrintful.js pipeline. After processing product files, the system will automatically generate a CSV summary and upload it to a specified Google Sheet, serving as an internal reference for all "ready-to-go" listings.

## Prerequisites
- Google Cloud project with Google Sheets API enabled
- Service account with appropriate permissions
- Service account key JSON file (already in place: google-sheets-key.json)
- Target Google Sheet shared with the service account email

## Implementation Steps

### 1. Install Required Dependency
```bash
npm install googleapis
```

### 2. Create uploadCSVToGoogleSheet.js Module

```javascript
const fs = require('fs');
const { google } = require('googleapis');
const path = require('path');

/**
 * Uploads CSV data to a Google Sheet
 * @param {Object} options - Configuration options
 * @param {string} options.csvPath - Path to the CSV file
 * @param {string} options.spreadsheetId - Google Spreadsheet ID
 * @param {string} options.sheetName - Name of the sheet (default: 'Dashboard')
 * @param {string} options.credentialsPath - Path to the Google credentials JSON file
 * @returns {Promise<void>}
 */
async function uploadCSVToGoogleSheet({
  csvPath,
  spreadsheetId,
  sheetName = 'Dashboard',
  credentialsPath = 'google-sheets-key.json',
}) {
  try {
    // Initialize auth with service account
    const auth = new google.auth.GoogleAuth({
      keyFile: credentialsPath,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    // Create sheets client
    const sheets = google.sheets({ version: 'v4', auth });

    // Read CSV content
    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    
    // Parse CSV into rows and columns
    // This handles quoted fields properly
    const rows = csvContent
      .trim()
      .split('\n')
      .map((line) => line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(cell => cell.replace(/^"|"$/g, '')));

    // Update the sheet with the CSV data
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A1`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: rows },
    });

    console.log(`✅ Uploaded dashboard to Google Sheet: https://docs.google.com/spreadsheets/d/${spreadsheetId}`);
  } catch (err) {
    console.error('❌ Failed to upload CSV to Google Sheets:', err.message);
    throw err;
  }
}

module.exports = uploadCSVToGoogleSheet;
```

### 3. Create generateCSVDashboard.js Module

```javascript
const fs = require('fs');
const path = require('path');

/**
 * Generates a CSV dashboard from manual-templates JSON files
 * @param {Object} options - Configuration options
 * @param {string} options.templatesDir - Directory containing JSON templates
 * @param {string} options.outputPath - Path to save the CSV file
 * @returns {Promise<string>} - Path to the generated CSV file
 */
async function generateCSVDashboard({
  templatesDir = 'manual-templates',
  outputPath = 'listing-dashboard.csv',
}) {
  try {
    const dirPath = path.resolve(templatesDir);
    const files = fs.readdirSync(dirPath).filter(file => file.endsWith('.json'));
    
    if (files.length === 0) {
      console.log('⚠️ No template files found in directory:', dirPath);
      return null;
    }
    
    console.log(`⏳ Generating dashboard from ${files.length} template files...`);
    
    // Read all JSON files
    const templates = [];
    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      templates.push(data);
    }
    
    // Define CSV headers based on the fields in the JSON files
    // Using the first file to determine the structure
    const firstTemplate = templates[0];
    const headers = Object.keys(firstTemplate);
    
    // Create CSV content
    let csvContent = headers.map(header => `"${header}"`).join(',') + '\n';
    
    // Add each template as a row
    for (const template of templates) {
      const row = headers.map(header => {
        const value = template[header];
        
        // Handle different data types
        if (value === null || value === undefined) {
          return '""';
        } else if (Array.isArray(value)) {
          return `"${value.join(', ')}"`;
        } else if (typeof value === 'object') {
          return `"${JSON.stringify(value).replace(/"/g, '""')}"`;
        } else {
          return `"${String(value).replace(/"/g, '""')}"`;
        }
      }).join(',');
      
      csvContent += row + '\n';
    }
    
    // Write CSV to file
    fs.writeFileSync(outputPath, csvContent);
    console.log(`✅ Dashboard CSV generated: ${outputPath}`);
    
    return outputPath;
  } catch (err) {
    console.error('❌ Failed to generate CSV dashboard:', err.message);
    throw err;
  }
}

module.exports = generateCSVDashboard;
```

### 4. Integrate with uploadToPrintful.js

Add the following imports at the top of the file:

```javascript
const generateCSVDashboard = require('./generateCSVDashboard');
const uploadCSVToGoogleSheet = require('./uploadCSVToGoogleSheet');
```

Add a new function to handle the dashboard generation and upload:

```javascript
/**
 * Generate and upload dashboard to Google Sheets
 * @returns {Promise<void>}
 */
async function generateAndUploadDashboard() {
  try {
    console.log('\n📊 Generating and uploading dashboard...');
    
    // Generate CSV dashboard
    const csvPath = await generateCSVDashboard({
      templatesDir: MANUAL_TEMPLATES_DIR,
      outputPath: path.join(__dirname, 'listing-dashboard.csv'),
    });
    
    if (!csvPath) {
      console.log('⚠️ No dashboard generated, skipping upload');
      return;
    }
    
    // Get spreadsheet ID from environment variable or use the hardcoded one
    const spreadsheetId = process.env.GOOGLE_SHEETS_DASHBOARD_ID || '1q5gbFZTX6Upk7UgnJlMey3xfzr3QJiNTfYabJDEu4AQ';
    
    // Upload to Google Sheets
    await uploadCSVToGoogleSheet({
      csvPath,
      spreadsheetId,
      credentialsPath: path.join(__dirname, 'google-sheets-key.json'),
    });
    
    console.log('✅ Dashboard successfully uploaded to Google Sheets');
  } catch (err) {
    console.error('❌ Failed to generate and upload dashboard:', err.message);
  }
}
```

Call this function at the end of the main function, just before the "Done!" message:

```javascript
// Add this before the "Done!" message in the main function
if (!isDryRun) {
  await generateAndUploadDashboard();
}
```

### 5. Update .env File (Optional)

Add the Google Sheets Dashboard ID to the .env file:

```
GOOGLE_SHEETS_DASHBOARD_ID=1q5gbFZTX6Upk7UgnJlMey3xfzr3QJiNTfYabJDEu4AQ
```

This is optional since we're also hardcoding the ID in the code as a fallback.

## Testing Plan

1. Run the uploadToPrintful.js script with a few test files
2. Verify that the CSV dashboard is generated correctly
3. Verify that the dashboard is uploaded to the Google Sheet

## Next Steps

After reviewing this plan, we'll need to switch to Code mode to implement the actual code changes.
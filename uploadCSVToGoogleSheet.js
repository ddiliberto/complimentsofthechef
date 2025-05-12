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

    // Ensure the sheet exists
    try {
      console.log(`📄 Checking if sheet '${sheetName}' exists...`);
      const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
      const sheetExists = spreadsheet.data.sheets.some(
        s => s.properties.title === sheetName
      );

      if (!sheetExists) {
        console.log(`📄 Sheet '${sheetName}' not found, creating...`);
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: {
            requests: [
              {
                addSheet: {
                  properties: { title: sheetName }
                }
              }
            ]
          }
        });
        console.log(`✅ Created sheet '${sheetName}'`);
      } else {
        console.log(`✅ Sheet '${sheetName}' already exists`);
      }
    } catch (err) {
      console.error(`❌ Error checking/creating sheet: ${err.message}`);
      // Continue anyway, as the API might auto-create the sheet
    }

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
      range: `${sheetName}!A1`, // Keep the sheet name in the range, but ensure it exists first
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: rows },
    });

    console.log(`✅ Uploaded dashboard to Google Sheet: https://docs.google.com/spreadsheets/d/${spreadsheetId}`);
  } catch (err) {
    console.error('❌ Failed to upload CSV to Google Sheets:', err.message);
    throw err; // Re-throw the error so the calling function can handle it
  }
}

module.exports = uploadCSVToGoogleSheet;
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
    return null;
  }
}

module.exports = generateCSVDashboard;
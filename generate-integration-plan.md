# Plan for Integrating generate.js with exportMockups.jsx

## Current Workflow

1. **generate.js**:
   - Reads words.csv
   - For each word, creates a customized JSX script
   - Runs the script in Illustrator to generate PNG files
   - Uses asynchronous callbacks without tracking completion

2. **exportMockups.jsx**:
   - Processes all PNG files in the export/ directory
   - Creates mockups with different background colors
   - Must be manually run in Photoshop

## Integration Goals

1. Automatically run exportMockups.jsx after all Illustrator tasks in generate.js are complete
2. Maintain the existing functionality of both scripts
3. Provide clear logging and error handling

## Implementation Steps

### 1. Modify generate.js to Track Task Completion

```javascript
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

function hexToRgb(hex) {
  // Existing code...
}

async function main() {
  return new Promise((resolve, reject) => {
    const rows = [];
    const tasks = [];
    
    fs.createReadStream('words.csv')
      .pipe(csv())
      .on('data', (data) => rows.push(data))
      .on('end', async () => {
        try {
          // Process each row and collect promises
          for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const word = row.word.trim();
            const fill = hexToRgb(row.fill);
            const stroke = hexToRgb(row.stroke);
            
            // Create and write the script (existing code)
            const template = fs.readFileSync('scripts/baseTemplate.jsx', 'utf-8');
            const finalScript = template
              .replace(/{{WORD}}/g, word)
              .replace(/{{FILL_R}}/g, fill.r)
              .replace(/{{FILL_G}}/g, fill.g)
              .replace(/{{FILL_B}}/g, fill.b)
              .replace(/{{STROKE_R}}/g, stroke.r)
              .replace(/{{STROKE_G}}/g, stroke.g)
              .replace(/{{STROKE_B}}/g, stroke.b);
            
            const outputPath = `scripts/generated-${i}.jsx`;
            fs.writeFileSync(outputPath, finalScript);
            
            // Run Illustrator via AppleScript (as a promise)
            const command = `osascript -e 'tell application "Adobe Illustrator" to do javascript POSIX file "${path.resolve(outputPath)}"'`;
            const task = execPromise(command)
              .then(() => {
                console.log(`✅ Exported: ${word}`);
                return word;
              })
              .catch((err) => {
                console.error(`❌ Error exporting ${word}: ${err.message}`);
                throw err;
              });
            
            tasks.push(task);
          }
          
          // Wait for all Illustrator tasks to complete
          const results = await Promise.allSettled(tasks);
          const successful = results.filter(r => r.status === 'fulfilled').length;
          const failed = results.filter(r => r.status === 'rejected').length;
          
          console.log(`\n📊 Illustrator Export Summary:`);
          console.log(`✅ Successfully exported: ${successful}/${rows.length}`);
          console.log(`❌ Failed: ${failed}/${rows.length}`);
          
          resolve(results);
        } catch (error) {
          console.error('❌ Error in main process:', error);
          reject(error);
        }
      });
  });
}

### 2. Add Function to Run exportMockups.jsx in Photoshop

```javascript
async function runPhotoshopMockups() {
  console.log('\n🔄 Starting mockup generation in Photoshop...');
  
  try {
    // Check if export-mockups directory exists, create if not
    const exportMockupsDir = path.join(__dirname, 'export-mockups');
    if (!fs.existsSync(exportMockupsDir)) {
      fs.mkdirSync(exportMockupsDir);
      console.log(`📁 Created directory: ${exportMockupsDir}`);
    }
    
    // Run exportMockups.jsx in Photoshop
    const exportMockupsPath = path.resolve(__dirname, 'exportMockups.jsx');
    const command = `osascript -e 'tell application "Adobe Photoshop" to do javascript POSIX file "${exportMockupsPath}"'`;
    
    const { stdout, stderr } = await execPromise(command);
    
    if (stderr) {
      console.error(`⚠️ Photoshop stderr: ${stderr}`);
    }
    
    if (stdout) {
      console.log(`📝 Photoshop output: ${stdout}`);
    }
    
    console.log('✅ Mockup generation complete!');
    return true;
  } catch (error) {
    console.error(`❌ Error generating mockups: ${error.message}`);
    return false;
  }
}
```

### 3. Update the Main Execution Flow

```javascript
// Execute the full pipeline
async function runPipeline() {
  try {
    console.log('🚀 Starting Illustrator automation pipeline...');
    
    // Step 1: Generate PNGs with Illustrator
    console.log('\n📝 Generating PNGs with Illustrator...');
    await main();
    
    // Step 2: Generate mockups with Photoshop
    console.log('\n📝 Generating mockups with Photoshop...');
    await runPhotoshopMockups();
    
    console.log('\n✨ Pipeline completed successfully!');
  } catch (error) {
    console.error(`❌ Pipeline error: ${error.message}`);
    process.exit(1);
  }
}

// Run the pipeline
runPipeline();
```

## Potential Challenges and Solutions

1. **Timing Issues**:
   - Ensure adequate delays between Illustrator and Photoshop operations
   - Use Promise.allSettled to handle cases where some Illustrator tasks fail

2. **Application Availability**:
   - Check if Photoshop is running before attempting to execute the script
   - Add code to open Photoshop and the template PSD if needed

3. **Error Handling**:
   - Implement robust error handling for both Illustrator and Photoshop operations
   - Continue with mockup generation even if some Illustrator tasks fail

4. **Performance**:
   - Consider adding a --skip-mockups flag to skip mockup generation when not needed
   - Add progress indicators for long-running operations

## Testing Strategy

1. Test with a small subset of words first
2. Verify that all PNG files are generated correctly
3. Verify that mockups are generated for all successful PNG exports
4. Test error handling by intentionally causing failures
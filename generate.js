const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const { main: uploadToPrintful } = require('./uploadToPrintful');

// Command line arguments
const args = process.argv.slice(2);
const SKIP_MOCKUPS = args.includes('--skip-mockups');
const SKIP_UPLOAD = args.includes('--skip-upload');
const DRY_RUN = args.includes('--dry-run') || args.includes('-d');
const SHOW_HELP = args.includes('-help') || args.includes('--help') || args.includes('-h');

// Check for limit argument (--limit=N or -l=N)
let LIMIT = undefined;
const limitArg = args.find(arg => arg.startsWith('--limit=') || arg.startsWith('-l='));
if (limitArg) {
  const limitValue = limitArg.split('=')[1];
  LIMIT = parseInt(limitValue, 10);
  if (isNaN(LIMIT) || LIMIT <= 0) {
    LIMIT = undefined;
    console.warn('⚠️ Invalid limit value. Processing all files.');
  }
}

/**
 * Display help menu
 */
function showHelp() {
  console.log(`
📋 Illustrator Automation Pipeline Help
======================================

This script automates the process of generating designs, creating mockups, and uploading to Printful.

Usage: node generate.js [options]

Options:
  --skip-mockups       Skip the mockup generation step
  --skip-upload        Skip the upload to Printful step
  --dry-run, -d        Run in dry-run mode (no actual API calls to Printful or Dropbox)
  --limit=N, -l=N      Limit the number of files to process
  -help, --help, -h    Show this help menu

Examples:
  node generate.js                     # Run the full pipeline
  node generate.js --skip-mockups      # Skip mockup generation
  node generate.js --skip-upload       # Skip Printful upload
  node generate.js --dry-run           # Run in dry-run mode
  node generate.js --limit=5           # Process only 5 files
  node generate.js -help               # Show this help menu
`);
  process.exit(0);
}

// Show help if requested
if (SHOW_HELP) {
  showHelp();
}

function hexToRgb(hex) {
  const cleaned = hex.replace('#', '');
  return {
    r: parseInt(cleaned.substring(0, 2), 16),
    g: parseInt(cleaned.substring(2, 4), 16),
    b: parseInt(cleaned.substring(4, 6), 16),
  };
}

/**
 * Main function to process words.csv and generate PNG files with Illustrator
 * @returns {Promise<Array>} Results of all Illustrator tasks
 */
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

/**
 * Run exportMockups.jsx in Photoshop to generate mockups
 * @returns {Promise<boolean>} Success status
 */
/**
 * Check if Photoshop is installed and get the correct application name
 * @returns {Promise<string|null>} Photoshop application name or null if not found
 */
async function getPhotoshopAppName() {
  const possibleNames = [
    "Adobe Photoshop 2025",
    "Adobe Photoshop 2024",
    "Adobe Photoshop 2023",
    "Adobe Photoshop 2022",
    "Adobe Photoshop 2021",
    "Adobe Photoshop CC 2020",
    "Adobe Photoshop CC 2019",
    "Adobe Photoshop CC",
    "Adobe Photoshop"
  ];
  
  for (const name of possibleNames) {
    try {
      const command = `osascript -e 'tell application "System Events" to (name of processes) contains "${name}"'`;
      const { stdout } = await execPromise(command);
      
      if (stdout.trim() === "true") {
        console.log(`✅ Found Photoshop: ${name}`);
        return name;
      }
    } catch (error) {
      // Ignore errors and try the next name
    }
  }
  
  console.error("❌ Adobe Photoshop not found. Please make sure it's installed.");
  return null;
}

/**
 * Run exportMockups.jsx in Photoshop to generate mockups
 * @returns {Promise<boolean>} Success status
 */
async function runPhotoshopMockups() {
  console.log('\n🔄 Starting mockup generation in Photoshop...');
  
  try {
    // Check if export-mockups directory exists, create if not
    const exportMockupsDir = path.join(__dirname, 'export-mockups');
    if (!fs.existsSync(exportMockupsDir)) {
      fs.mkdirSync(exportMockupsDir);
      console.log(`📁 Created directory: ${exportMockupsDir}`);
    }
    
    // Check if Photoshop is installed
    const photoshopAppName = await getPhotoshopAppName();
    if (!photoshopAppName) {
      console.error("❌ Cannot proceed with mockup generation without Photoshop.");
      return false;
    }
    
    // Activate Photoshop (assuming the file is already open)
    console.log('⏳ Activating Photoshop...');
    
    // Launch Photoshop if not already running
    const launchCommand = `osascript -e 'tell application "${photoshopAppName}" to activate'`;
    await execPromise(launchCommand);
    
    // Give Photoshop a moment to come to the foreground
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Run exportMockups.jsx in Photoshop
    console.log('⏳ Running exportMockups.jsx in Photoshop...');
    const exportMockupsPath = path.resolve(__dirname, 'exportMockups.jsx');
    const logFilePath = path.resolve(__dirname, 'mockup_generation.log');
    
    // Create a temporary AppleScript file to run the JSX script
    const tempAppleScriptPath = path.join(__dirname, 'temp_run_jsx.scpt');
    const appleScriptContent = `
tell application "${photoshopAppName}"
  activate
  do javascript file "${exportMockupsPath}" show debugger on runtime error
end tell
    `;
    
    fs.writeFileSync(tempAppleScriptPath, appleScriptContent);
    
    // Run the AppleScript file
    const runScriptCommand = `osascript "${tempAppleScriptPath}"`;
    const { stdout, stderr } = await execPromise(runScriptCommand);
    
    // Clean up the temporary file
    fs.unlinkSync(tempAppleScriptPath);
    
    if (stderr) {
      console.error(`⚠️ Photoshop stderr: ${stderr}`);
    }
    
    // Wait a moment for the log file to be written
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Read and display the log file
    try {
      if (fs.existsSync(logFilePath)) {
        const logContent = fs.readFileSync(logFilePath, 'utf-8');
        const logLines = logContent.split('\n').filter(line => line.trim() !== '');
        
        // Display formatted log output
        console.log('\n📋 Mockup Generation Log:');
        
        let designCount = 0;
        let mockupCount = 0;
        let errorCount = 0;
        
        logLines.forEach(line => {
          if (line.includes('MOCKUP_INFO:')) {
            console.log(`ℹ️ ${line.replace('MOCKUP_INFO:', '').trim()}`);
          }
          else if (line.includes('MOCKUP_PROCESSING:')) {
            designCount++;
            const designName = line.replace('MOCKUP_PROCESSING:', '').trim().split(' ')[0];
            console.log(`\n🔄 Processing design: ${designName}`);
          }
          else if (line.includes('MOCKUP_EXPORTED:')) {
            mockupCount++;
            const mockupName = line.replace('MOCKUP_EXPORTED:', '').trim();
            console.log(`  ✓ Generated mockup: ${mockupName}`);
          }
          else if (line.includes('MOCKUP_ERROR:')) {
            errorCount++;
            console.error(`❌ ${line.replace('MOCKUP_ERROR:', '').trim()}`);
          }
          else if (line.includes('MOCKUP_SUMMARY:')) {
            console.log(`\n📊 ${line.replace('MOCKUP_SUMMARY:', '').trim()}`);
          }
          else if (line.includes('MOCKUP_GENERATION_COMPLETE')) {
            console.log(`\n🎉 Mockup generation complete!`);
          }
        });
        
        // Display summary if not already shown in the log
        if (mockupCount > 0 && !logContent.includes('MOCKUP_SUMMARY:')) {
          console.log(`\n📊 Generated ${mockupCount} mockups for ${designCount} designs`);
          if (errorCount > 0) {
            console.log(`⚠️ Encountered ${errorCount} errors during generation`);
          }
        }
        
        // Clean up the log file
        fs.unlinkSync(logFilePath);
      } else {
        console.log('\n⚠️ No log file found. Mockup generation may have failed.');
      }
    } catch (error) {
      console.error(`❌ Error reading log file: ${error.message}`);
    }
    
    console.log('✅ Mockup generation complete!');
    return true;
  } catch (error) {
    console.error(`❌ Error generating mockups: ${error.message}`);
    return false;
  }
}

/**
 * Execute the full pipeline
 */
async function runPipeline() {
  console.log('🚀 Starting Illustrator automation pipeline...');
  
  let illustratorSuccess = false;
  let mockupSuccess = false;
  let uploadSuccess = false;
  
  // Step 1: Generate PNGs with Illustrator
  try {
    console.log('\n📝 Generating PNGs with Illustrator...');
    await main();
    illustratorSuccess = true;
    console.log('✅ Illustrator generation completed successfully');
  } catch (error) {
    console.error(`❌ Illustrator generation error: ${error.message}`);
    console.log('⚠️ Continuing with pipeline despite Illustrator errors');
  }
  
  // Step 2: Generate mockups with Photoshop (unless skipped)
  if (SKIP_MOCKUPS) {
    console.log('\n⏭️ Skipping mockup generation (--skip-mockups flag used)');
    mockupSuccess = true; // Mark as success since we're skipping
  } else {
    try {
      console.log('\n📝 Generating mockups with Photoshop...');
      const result = await runPhotoshopMockups();
      mockupSuccess = result;
      if (result) {
        console.log('✅ Mockup generation completed successfully');
      } else {
        console.log('⚠️ Mockup generation completed with warnings');
      }
    } catch (error) {
      console.error(`❌ Mockup generation error: ${error.message}`);
      console.log('⚠️ Continuing with pipeline despite mockup errors');
    }
  }
  
  // Step 3: Upload to Printful (unless skipped)
  if (SKIP_UPLOAD) {
    console.log('\n⏭️ Skipping upload to Printful (--skip-upload flag used)');
    uploadSuccess = true; // Mark as success since we're skipping
  } else {
    try {
      console.log('\n📝 Uploading to Printful...');
      
      // Prepare arguments to pass to uploadToPrintful
      const uploadOptions = {};
      
      if (DRY_RUN) {
        uploadOptions.dryRun = true;
        console.log('🔍 Running in dry-run mode');
      }
      
      if (LIMIT !== undefined) {
        uploadOptions.limit = LIMIT;
        console.log(`🔍 Limiting to ${LIMIT} files`);
      }
      
      await uploadToPrintful(uploadOptions);
      uploadSuccess = true;
      console.log('✅ Printful upload completed successfully');
    } catch (error) {
      console.error(`❌ Printful upload error: ${error.message}`);
      console.log('⚠️ Pipeline will continue but upload step failed');
    }
  }
  
  // Final summary
  console.log('\n📊 Pipeline Summary:');
  console.log(`Illustrator Generation: ${illustratorSuccess ? '✅ Success' : '❌ Failed'}`);
  console.log(`Mockup Generation: ${SKIP_MOCKUPS ? '⏭️ Skipped' : (mockupSuccess ? '✅ Success' : '❌ Failed')}`);
  console.log(`Printful Upload: ${SKIP_UPLOAD ? '⏭️ Skipped' : (uploadSuccess ? '✅ Success' : '❌ Failed')}`);
  
  if (illustratorSuccess && (SKIP_MOCKUPS || mockupSuccess) && (SKIP_UPLOAD || uploadSuccess)) {
    console.log('\n✨ Pipeline completed successfully!');
  } else {
    console.log('\n⚠️ Pipeline completed with some steps failing or being skipped.');
  }
}

// Run the pipeline
runPipeline();

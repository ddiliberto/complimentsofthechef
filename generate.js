const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

function hexToRgb(hex) {
  const cleaned = hex.replace('#', '');
  return {
    r: parseInt(cleaned.substring(0, 2), 16),
    g: parseInt(cleaned.substring(2, 4), 16),
    b: parseInt(cleaned.substring(4, 6), 16),
  };
}

const rows = [];

fs.createReadStream('words.csv')
  .pipe(csv())
  .on('data', (data) => rows.push(data))
  .on('end', () => {
    rows.forEach((row, i) => {
      const word = row.word.trim();
      const fill = hexToRgb(row.fill);
      const stroke = hexToRgb(row.stroke);

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

      // Run Illustrator via AppleScript
      const exec = require('child_process').exec;
      const command = `osascript -e 'tell application "Adobe Illustrator" to do javascript POSIX file "${path.resolve(outputPath)}"'`;
      exec(command, (err, stdout, stderr) => {
        if (err) console.error(`❌ Error: ${err.message}`);
        else console.log(`✅ Exported: ${word}`);
      });
    });
  });

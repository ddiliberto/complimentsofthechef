const { execSync } = require("child_process");
const path = require("path");

const jsxPath = path.resolve(__dirname, "exportMockups.jsx");
const result = execSync(
  `osascript -e 'tell application "Adobe Photoshop 2025" to do javascript POSIX file "${jsxPath}"'`
);

console.log("✅ Photoshop export script triggered.");

const fs = require('fs');
const path = require('path');

const outputDir = path.join(__dirname, 'output');

const files = fs.readdirSync(outputDir);
for (const file of files) {
  // Delete plain .csv files and debug images
  if (file.endsWith('.csv') || file.endsWith('.png')) {
    fs.unlinkSync(path.join(outputDir, file));
    console.log(`🗑️ Deleted non-theme / temporary file: ${file}`);
  }
}

console.log('\n✅ Output directory cleaned! Only formatted .xlsx Excel files remain.');

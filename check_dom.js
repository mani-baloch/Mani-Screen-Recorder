const fs = require('fs');
const html = fs.readFileSync('public/index.html', 'utf8');
const js = fs.readFileSync('public/app.js', 'utf8');

const regex = /document\.getElementById\(['"]([^'"]+)['"]\)/g;
let m;
const missing = new Set();
let count = 0;
while ((m = regex.exec(js)) !== null) {
  count++;
  const id = m[1];
  if (!html.includes(`id="${id}"`) && !html.includes(`id='${id}'`)) {
    missing.add(id);
  }
}

console.log('Total getElementById checks:', count);
console.log('Missing IDs:', Array.from(missing));

// Also check querySelector and querySelectorAll
const qsRegex = /document\.querySelector(?:All)?\(['"]#([^'"]+)['"]\)/g;
while ((m = qsRegex.exec(js)) !== null) {
  const id = m[1];
  if (!html.includes(`id="${id}"`)) {
    missing.add(id);
  }
}
console.log('Missing after querySelector:', Array.from(missing));

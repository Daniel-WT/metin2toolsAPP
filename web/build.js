const fs = require('fs');
const path = require('path');

const shellPath = path.join(__dirname, 'index-shell.html');
const outPath = path.join(__dirname, 'index.html');

let shell = fs.readFileSync(shellPath, 'utf8');

// Match: <!-- INJECT: components/filename.html -->
// and the following <div id="..."></div>
const regex = /<!-- INJECT: (.*?) -->\s*<div id="tab-.*?-container"><\/div>/g;

shell = shell.replace(regex, (match, filePath) => {
    const fullPath = path.join(__dirname, filePath.trim());
    if (fs.existsSync(fullPath)) {
        console.log(`Injected ${filePath}`);
        return fs.readFileSync(fullPath, 'utf8');
    } else {
        console.log(`Warning: ${filePath} not found!`);
        return match;
    }
});

fs.writeFileSync(outPath, shell, 'utf8');
console.log('✅ Build complet: index.html a fost asamblat!');

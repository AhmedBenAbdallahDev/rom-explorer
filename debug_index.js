const fs = require('fs');
const path = require('path');

const index = JSON.parse(fs.readFileSync('public/data/index.json', 'utf8'));
const ia = index.collections['Internet_Archive'];
if (ia) {
    console.log('Found Internet_Archive. Platforms:');
    ia.platforms.forEach(p => {
        if (p.name.toLowerCase().includes('psx') || p.name.toLowerCase().includes('playstation') || p.name.toLowerCase().includes('chd')) {
            console.log(JSON.stringify(p, null, 2));
        }
    });
} else {
    console.log('Internet_Archive not found in index.json');
}

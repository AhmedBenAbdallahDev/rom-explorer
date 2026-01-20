const fs = require('fs');
const manifestPath = 'public/data/TOSEC/_manifest.json';
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

if (manifest["Commodore - C64"]) {
    manifest["Commodore - C64"].file = [
        "TOSEC/commodore___c64_part1.json",
        "TOSEC/commodore___c64_part2.json"
    ];
    fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    console.log('Manifest updated.');
} else {
    console.log('Error: Commodore - C64 not found in manifest.');
}

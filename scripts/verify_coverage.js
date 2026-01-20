const fs = require('fs');
const path = require('path');

console.log("Verifying Index Coverage...");

// 1. Load the Main Index (The User's Menu)
const index = JSON.parse(fs.readFileSync('public/data/index.json', 'utf8'));

// 2. Load the IA Maps
const iaManifest = JSON.parse(fs.readFileSync('public/data/Internet_Archive/_manifest.json', 'utf8'));
const iaMap = JSON.parse(fs.readFileSync('public/data/Internet_Archive/_platform_map.json', 'utf8'));

let totalPlatforms = 0;
let coveredPlatforms = 0;
let orphans = [];

// 3. Check Internet Archive Coverage
const iaCollection = index.collections['Internet_Archive'];
if (iaCollection) {
    console.log(`Checking ${iaCollection.platforms.length} Internet Archive platforms...`);
    iaCollection.platforms.forEach(p => {
        totalPlatforms++;
        const name = p.name;

        // Is it a direct file? (e.g. chadmaster)
        if (iaManifest[name]) {
            coveredPlatforms++;
        }
        // Is it a mapped sub-folder? (e.g. chd_psx)
        else if (iaMap[name]) {
            coveredPlatforms++;
        }
        else {
            orphans.push(name);
        }
    });
}

console.log(`\nRESULTS:`);
console.log(`Total Platforms linked in Menu: ${totalPlatforms}`);
console.log(`Successfully mapped to Data: ${coveredPlatforms}`);
console.log(`Coverage: ${((coveredPlatforms / totalPlatforms) * 100).toFixed(2)}%`);

if (orphans.length > 0) {
    console.log(`\nFound ${orphans.length} broken links (examples):`);
    console.log(JSON.stringify(orphans.slice(0, 5), null, 2));
} else {
    console.log("\nSUCCESS: 100% of index is browseable.");
}

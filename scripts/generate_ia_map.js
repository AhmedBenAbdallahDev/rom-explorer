const fs = require('fs');
const path = require('path');

const dataDir = 'public/data/Internet_Archive';
// Get all JSON files excluding manifest
const files = fs.readdirSync(dataDir).filter(f => f.endsWith('.json') && f !== '_manifest.json');

const platformMap = {};
const hierarchy = {};

console.log(`Scanning ${files.length} files...`);

files.forEach(file => {
    try {
        const content = JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8'));
        if (!Array.isArray(content)) return;

        console.log(`Processing ${file} (${content.length} items)...`);

        content.forEach(item => {
            if (item.path && Array.isArray(item.path)) {
                // The folders are potential "Platforms"
                // Typically path[0] is "Internet Archive", path[1] is Collection (e.g. chadmaster)
                // path[2] is likely the specific set (e.g. chd_psx).

                // We map specific folder names to this file
                item.path.forEach(segment => {
                    // Check if this segment matches a known platform name? 
                    // Or just map all segments.
                    if (!platformMap[segment]) {
                        platformMap[segment] = file;
                    }
                });
            }
        });
    } catch (e) {
        console.error(`Error reading ${file}:`, e.message);
    }
});

fs.writeFileSync(path.join(dataDir, '_platform_map.json'), JSON.stringify(platformMap, null, 2));
console.log('Map generated at public/data/Internet_Archive/_platform_map.json');

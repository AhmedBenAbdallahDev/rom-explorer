const fs = require('fs');
const path = require('path');

const filePath = 'public/data/TOSEC/commodore___c64.json';
const dir = path.dirname(filePath);

console.log('Reading ' + filePath + '...');
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

if (Array.isArray(data)) {
    const half = Math.ceil(data.length / 2);
    const part1 = data.slice(0, half);
    const part2 = data.slice(half);

    console.log('Splitting into 2 parts...');
    fs.writeFileSync(path.join(dir, 'commodore___c64_part1.json'), JSON.stringify(part1));
    fs.writeFileSync(path.join(dir, 'commodore___c64_part2.json'), JSON.stringify(part2));

    // Remove the original large file
    fs.unlinkSync(filePath);
    console.log('Done.');
} else {
    console.log('Error: Data is not an array.');
}

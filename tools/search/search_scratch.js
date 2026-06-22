const fs = require('fs');
const path = require('path');

const dir = 'C:\\\\Users\\\\rgr_r\\\\.gemini\\\\antigravity-ide\\\\brain\\\\1854b4dc-4afd-465a-9015-931f5cb85655\\\\scratch';
const files = fs.readdirSync(dir);

files.forEach(f => {
    const filePath = path.join(dir, f);
    if (fs.statSync(filePath).isFile()) {
        const content = fs.readFileSync(filePath, 'utf8');
        if (content.toLowerCase().includes('easy')) {
            console.log(`Found 'easy' in: ${f}`);
        }
    }
});

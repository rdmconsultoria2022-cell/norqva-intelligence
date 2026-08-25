const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'src', 'db', 'migrations');
const distDir = path.join(__dirname, 'dist', 'db', 'migrations');

if (!fs.existsSync(srcDir)) {
  console.error(`[Error]: Source migrations directory not found at: ${srcDir}`);
  process.exit(1);
}

const files = fs.readdirSync(srcDir).filter(f => f.endsWith('.sql'));

if (files.length === 0) {
  console.error('[Error]: No SQL migration files found to copy.');
  process.exit(1);
}

fs.mkdirSync(distDir, { recursive: true });

for (const file of files) {
  const srcFile = path.join(srcDir, file);
  const destFile = path.join(distDir, file);
  fs.copyFileSync(srcFile, destFile);
}

console.log(`[Migration Assets]: Successfully copied ${files.length} SQL migration files to dist/db/migrations/`);

const fs = require('fs');
const path = require('path');

const target = process.argv[2];
if (!target || !['major', 'minor', 'patch'].includes(target)) {
  console.error('Error: Please specify version bump type: major, minor, or patch.');
  process.exit(1);
}

const rootDir = path.join(__dirname, '..');

// Helper to bump version
function bump(versionStr, type) {
  const parts = versionStr.split('.').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) {
    throw new Error(`Invalid semver version: ${versionStr}`);
  }
  
  let [major, minor, patch] = parts;
  if (type === 'major') {
    major += 1;
    minor = 0;
    patch = 0;
  } else if (type === 'minor') {
    minor += 1;
    patch = 0;
  } else if (type === 'patch') {
    patch += 1;
  }
  
  return `${major}.${minor}.${patch}`;
}

// 1. Read root version
const rootPkgPath = path.join(rootDir, 'package.json');
const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, 'utf8'));
const currentVersion = rootPkg.version;
const newVersion = bump(currentVersion, target);

console.log(`Bumping version from ${currentVersion} to ${newVersion} (${target})...`);

// 2. Update package.json files
const packagePaths = [
  'package.json',
  'sdk/package.json',
  'agent/package.json',
  'cli/package.json',
  'ui/package.json'
];

packagePaths.forEach(relPath => {
  const fullPath = path.join(rootDir, relPath);
  if (fs.existsSync(fullPath)) {
    const pkg = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    pkg.version = newVersion;
    fs.writeFileSync(fullPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
    console.log(`Updated ${relPath} to version ${newVersion}`);
  } else {
    console.warn(`Warning: File not found: ${relPath}`);
  }
});

// 3. Update contract/Cargo.toml
const cargoPath = path.join(rootDir, 'contract/Cargo.toml');
if (fs.existsSync(cargoPath)) {
  let content = fs.readFileSync(cargoPath, 'utf8');
  content = content.replace(/^version\s*=\s*"[^"]*"/m, `version = "${newVersion}"`);
  fs.writeFileSync(cargoPath, content, 'utf8');
  console.log(`Updated contract/Cargo.toml version to ${newVersion}`);
} else {
  console.warn('Warning: contract/Cargo.toml not found');
}

// 4. Update contract/src/lib.rs version constant
const libRsPath = path.join(rootDir, 'contract/src/lib.rs');
if (fs.existsSync(libRsPath)) {
  let content = fs.readFileSync(libRsPath, 'utf8');
  content = content.replace(/^pub const CONTRACT_VERSION:\s*&\s*str\s*=\s*"[^"]*";/m, `pub const CONTRACT_VERSION: &str = "${newVersion}";`);
  fs.writeFileSync(libRsPath, content, 'utf8');
  console.log(`Updated contract/src/lib.rs CONTRACT_VERSION constant to ${newVersion}`);
} else {
  console.warn('Warning: contract/src/lib.rs not found');
}

console.log(`Successfully bumped all version references to ${newVersion}`);
console.log(`::set-output name=new_version::${newVersion}`);

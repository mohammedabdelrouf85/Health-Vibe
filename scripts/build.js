/**
 * Health Vibes AI - Production & Staging Build Pipeline
 *
 * Verifies dependencies, validates configurations, indexes, rules, and CSP,
 * and outputs deterministic build metadata (app/build-info.json).
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function parseArgs() {
  const args = process.argv.slice(2);
  let env = 'staging';
  for (const arg of args) {
    if (arg.startsWith('--env=')) {
      env = arg.split('=')[1].toLowerCase().trim();
    }
  }
  return { env };
}

function getGitCommit() {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch (e) {
    return 'development-local-build';
  }
}

function getGitBranch() {
  if (process.env.GITHUB_REF_NAME) return process.env.GITHUB_REF_NAME;
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch (e) {
    return 'main';
  }
}

function runBuild(targetEnv) {
  const rootDir = path.resolve(__dirname, '..');
  console.log(`[Health Vibes Build] Starting build validation for environment: [${targetEnv.toUpperCase()}]`);

  const errors = [];

  // 1. Verify backend/package.json and Functions dependencies
  const backendPkgPath = path.join(rootDir, 'backend', 'package.json');
  if (!fs.existsSync(backendPkgPath)) {
    errors.push('backend/package.json is missing.');
  } else {
    try {
      const backendPkg = JSON.parse(fs.readFileSync(backendPkgPath, 'utf8'));
      if (backendPkg.main !== 'index.js') {
        errors.push(`backend/package.json main entrypoint must be 'index.js', got '${backendPkg.main}'.`);
      }
      const deps = backendPkg.dependencies || {};
      const requiredDeps = ['firebase-functions', 'firebase-admin', 'express', 'cors', 'nodemailer'];
      for (const reqDep of requiredDeps) {
        if (!deps[reqDep]) {
          errors.push(`backend/package.json is missing required dependency: ${reqDep}`);
        }
      }
    } catch (e) {
      errors.push(`Failed to parse backend/package.json: ${e.message}`);
    }
  }

  // 2. Verify backend/index.js exports
  const backendIndexPath = path.join(rootDir, 'backend', 'index.js');
  if (!fs.existsSync(backendIndexPath)) {
    errors.push('backend/index.js is missing.');
  } else {
    const backendIndexSrc = fs.readFileSync(backendIndexPath, 'utf8');
    if (!backendIndexSrc.includes('exports.api =')) {
      errors.push("backend/index.js must export 'api' (functions.https.onRequest(app)).");
    }
  }

  // 3. Verify firebase.json
  const firebaseJsonPath = path.join(rootDir, 'firebase.json');
  if (!fs.existsSync(firebaseJsonPath)) {
    errors.push('firebase.json is missing.');
  } else {
    try {
      const firebaseJson = JSON.parse(fs.readFileSync(firebaseJsonPath, 'utf8'));
      if (!firebaseJson.functions) {
        errors.push('firebase.json missing "functions" configuration.');
      } else {
        const fnConfig = Array.isArray(firebaseJson.functions) ? firebaseJson.functions[0] : firebaseJson.functions;
        if (fnConfig.source !== 'backend') {
          errors.push(`firebase.json functions source must point to "backend", got "${fnConfig.source}".`);
        }
      }

      // Check rewrites
      const rewrites = (firebaseJson.hosting && firebaseJson.hosting.rewrites) || [];
      const hasApiRewrite = rewrites.some(r => r.source === '/api/**' && r.function === 'api');
      if (!hasApiRewrite) {
        errors.push('firebase.json hosting.rewrites must contain source "/api/**" -> function "api".');
      }

      // Check CSP
      const headers = (firebaseJson.hosting && firebaseJson.hosting.headers) || [];
      const hasCsp = headers.some(h => (h.headers || []).some(k => k.key === 'Content-Security-Policy'));
      if (!hasCsp) {
        errors.push('firebase.json hosting.headers must contain Content-Security-Policy header.');
      }
    } catch (e) {
      errors.push(`Failed to parse firebase.json: ${e.message}`);
    }
  }

  // 4. Verify firestore.indexes.json
  const indexesPath = path.join(rootDir, 'firestore.indexes.json');
  let indexesCount = 0;
  if (!fs.existsSync(indexesPath)) {
    errors.push('firestore.indexes.json is missing.');
  } else {
    try {
      const indexesJson = JSON.parse(fs.readFileSync(indexesPath, 'utf8'));
      if (!Array.isArray(indexesJson.indexes) || indexesJson.indexes.length === 0) {
        errors.push('firestore.indexes.json must contain at least one composite index.');
      } else {
        indexesCount = indexesJson.indexes.length;
      }
    } catch (e) {
      errors.push(`Failed to parse firestore.indexes.json: ${e.message}`);
    }
  }

  // 5. Verify storage.rules
  const storageRulesPath = path.join(rootDir, 'storage.rules');
  if (!fs.existsSync(storageRulesPath)) {
    errors.push('storage.rules is missing.');
  } else {
    const storageRules = fs.readFileSync(storageRulesPath, 'utf8');
    if (!storageRules.includes("service firebase.storage") || !storageRules.includes("isOwner") || !storageRules.includes("isPlatformAdmin")) {
      errors.push('storage.rules missing essential security functions or declarations.');
    }
  }

  // 6. Verify firestore.rules
  const firestoreRulesPath = path.join(rootDir, 'firestore.rules');
  if (!fs.existsSync(firestoreRulesPath)) {
    errors.push('firestore.rules is missing.');
  }

  if (errors.length > 0) {
    console.error(`[Health Vibes Build] FAILED with ${errors.length} error(s):`);
    errors.forEach((err, idx) => console.error(`  ${idx + 1}. ${err}`));
    throw new Error(`Build validation failed with ${errors.length} error(s).`);
  }

  // Generate app/build-info.json
  const buildInfo = {
    version: require(path.join(rootDir, 'package.json')).version || '1.0.0',
    environment: targetEnv,
    buildTime: new Date().toISOString(),
    gitCommit: getGitCommit(),
    gitBranch: getGitBranch(),
    indexesCount: indexesCount,
    status: 'ready'
  };

  const buildInfoPath = path.join(rootDir, 'app', 'build-info.json');
  fs.writeFileSync(buildInfoPath, JSON.stringify(buildInfo, null, 2), 'utf8');
  console.log(`[Health Vibes Build] Build info generated successfully at ${buildInfoPath}:`);
  console.log(JSON.stringify(buildInfo, null, 2));
  console.log(`[Health Vibes Build] Build completed successfully for [${targetEnv.toUpperCase()}].`);
  return buildInfo;
}

if (require.main === module) {
  try {
    const { env } = parseArgs();
    runBuild(env);
    process.exit(0);
  } catch (err) {
    console.error(`[Health Vibes Build] Error: ${err.message}`);
    process.exit(1);
  }
}

module.exports = { runBuild, parseArgs };

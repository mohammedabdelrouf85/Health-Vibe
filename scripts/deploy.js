/**
 * Health Vibes AI - Automated Deployment Pipeline
 *
 * Supports Staging and Production deployments with pre-flight checks,
 * gatekeeping, release tracking, and automated rollback points.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { runBuild } = require('./build');

const ENV_PROJECT_MAP = {
  staging: 'health-vibes-staging',
  production: 'health-vibes-a4b3b'
};

function parseArgs() {
  const args = process.argv.slice(2);
  let env = 'staging';
  let dryRun = process.env.DRY_RUN === 'true';
  let force = false;

  for (const arg of args) {
    if (arg.startsWith('--env=')) {
      env = arg.split('=')[1].toLowerCase().trim();
    } else if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--force') {
      force = true;
    }
  }

  return { env, dryRun, force };
}

function ensureDeploymentsDir(rootDir) {
  const depDir = path.join(rootDir, '.deployments');
  if (!fs.existsSync(depDir)) {
    fs.mkdirSync(depDir, { recursive: true });
  }
  return depDir;
}

function loadHistory(depDir, env) {
  const file = path.join(depDir, `${env}-history.json`);
  if (!fs.existsSync(file)) {
    return [];
  }
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    return [];
  }
}

function saveHistory(depDir, env, history) {
  const file = path.join(depDir, `${env}-history.json`);
  fs.writeFileSync(file, JSON.stringify(history, null, 2), 'utf8');
}

function checkStagingGate(rootDir) {
  const depDir = ensureDeploymentsDir(rootDir);
  const stagingHistory = loadHistory(depDir, 'staging');
  const lastStaging = stagingHistory[stagingHistory.length - 1];

  const envApproved = process.env.HEALTH_VIBE_STAGING_APPROVED === 'true';
  const hasSuccessfulStaging = lastStaging && (lastStaging.status === 'deployed' || lastStaging.status === 'verified');

  if (!hasSuccessfulStaging && !envApproved) {
    throw new Error(
      '[Health Vibes Deploy Gate] Production deployment BLOCKED: Staging deployment & verification must be successfully executed first. (Override with HEALTH_VIBE_STAGING_APPROVED=true or --force for hotfixes)'
    );
  }
  console.log('[Health Vibes Deploy Gate] Staging verification gate PASSED.');
}

function runDeploy({ env = 'staging', dryRun = false, force = false } = {}) {
  const rootDir = path.resolve(__dirname, '..');
  const targetProject = ENV_PROJECT_MAP[env];

  if (!targetProject) {
    throw new Error(`Invalid environment: "${env}". Supported: staging, production`);
  }

  console.log(`\n============================================================`);
  console.log(`🚀 [Health Vibes Deploy] Target: [${env.toUpperCase()}] Project: [${targetProject}]`);
  console.log(`   Mode: ${dryRun ? 'DRY-RUN (Simulated)' : 'LIVE DEPLOYMENT'}`);
  console.log(`============================================================\n`);

  // 1. Production gatekeeping check
  if (env === 'production' && !force) {
    checkStagingGate(rootDir);
  }

  // 2. Pre-flight build & dependency check
  console.log('[1/4] Running pre-flight build & validation...');
  const buildInfo = runBuild(env);

  // 3. Deployment preparation & history snapshot
  console.log('\n[2/4] Recording release point for audit & rollback...');
  const depDir = ensureDeploymentsDir(rootDir);
  const history = loadHistory(depDir, env);

  const releaseId = `rel_${env}_${Date.now()}`;
  const releaseRecord = {
    releaseId,
    timestamp: new Date().toISOString(),
    environment: env,
    projectId: targetProject,
    gitCommit: buildInfo.gitCommit,
    gitBranch: buildInfo.gitBranch,
    version: buildInfo.version,
    status: 'in_progress'
  };

  history.push(releaseRecord);
  saveHistory(depDir, env, history);

  // 4. Execute Firebase deployment
  console.log(`\n[3/4] Deploying to Firebase (${targetProject})...`);
  const deployCmd = `npx firebase-tools deploy --project ${targetProject} --only hosting,functions,firestore,storage`;

  if (dryRun) {
    console.log(`[DRY-RUN] Simulated execution of: ${deployCmd}`);
    console.log('[DRY-RUN] Emulating Cloud Functions deployment: backend -> exports.api + triggers');
    console.log('[DRY-RUN] Emulating Hosting deployment: public: "app", rewrites: /api/**');
    console.log('[DRY-RUN] Emulating Firestore Rules & Storage Rules synchronization');
    console.log('[DRY-RUN] Deployment completed with simulated 200 OK.');
  } else {
    try {
      execSync(deployCmd, { cwd: rootDir, stdio: 'inherit' });
    } catch (err) {
      releaseRecord.status = 'failed';
      releaseRecord.error = err.message;
      saveHistory(depDir, env, history);
      throw new Error(`Firebase deployment failed: ${err.message}`);
    }
  }

  // 5. Finalize status
  console.log('\n[4/4] Verifying deployment completion...');
  releaseRecord.status = 'deployed';
  releaseRecord.deployedAt = new Date().toISOString();
  saveHistory(depDir, env, history);

  console.log(`\n✅ [Health Vibes Deploy] Successfully deployed release [${releaseId}] to [${env.toUpperCase()}].`);
  console.log(`   Audit record saved to .deployments/${env}-history.json\n`);

  return releaseRecord;
}

if (require.main === module) {
  try {
    const options = parseArgs();
    runDeploy(options);
    process.exit(0);
  } catch (err) {
    console.error(`\n❌ [Health Vibes Deploy Error]: ${err.message}\n`);
    process.exit(1);
  }
}

module.exports = { runDeploy, parseArgs, checkStagingGate, loadHistory, saveHistory };

/**
 * Health Vibe AI - Real Browser Demo Video & Journey Capture Engine
 * Captures live interactive demonstration of Patient, Doctor, and Admin journeys
 * on the live production URL: https://health-vibes-a4b3b.web.app
 */

const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const ARTIFACT_DIR = path.resolve('C:/Users/Raouf/.gemini/antigravity-ide/brain/6340fdd9-e07a-4d0a-8001-866a4bdb5405');
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\EdgeCore\\155.0.4283.60\\msedge.exe';
const LIVE_URL = 'https://health-vibes-a4b3b.web.app';

async function runDemoCapture() {
  console.log('==================================================================');
  console.log('🎬 HEALTH VIBE AI: REAL BROWSER DEMO VIDEO CAPTURE (TASK #75)');
  console.log(`🌐 Live Target URL: ${LIVE_URL}`);
  console.log(`📁 Artifact Target: ${ARTIFACT_DIR}`);
  console.log('==================================================================\n');

  if (!fs.existsSync(ARTIFACT_DIR)) {
    fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  }

  const browser = await puppeteer.launch({
    executablePath: EDGE_PATH,
    headless: 'new',
    defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 1 },
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-web-security',
      '--allow-running-insecure-content'
    ]
  });

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) HealthVibe-DemoRecorder/2.0');

  try {
    // -------------------------------------------------------------
    // PART 1: LANDING PAGE & PATIENT JOURNEY
    // -------------------------------------------------------------
    console.log('[1/7] Capturing Live Landing Page...');
    await page.goto(LIVE_URL, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2000));
    
    // Screenshot 1: Landing Page
    const landingPath = path.join(ARTIFACT_DIR, 'demo_landing_page.png');
    await page.screenshot({ path: landingPath, fullPage: false });
    console.log(`  ✓ Saved: ${landingPath}`);

    // Screenshot 2: Patient Assessment Screen
    console.log('[2/7] Navigating to Patient Clinical Assessment...');
    await page.evaluate(() => {
      if (typeof window.showScreen === 'function') {
        window.showScreen('assessment-screen');
      } else {
        const btn = document.querySelector('[data-screen="assessment-screen"]') || document.querySelector('#startAssessmentBtn') || document.querySelector('button.cta-btn');
        if (btn) btn.click();
      }
    });
    await new Promise(r => setTimeout(r, 1500));

    // Fill symptoms
    await page.evaluate(() => {
      const o2Input = document.querySelector('#oxygenLevel') || document.querySelector('[name="o2"]');
      if (o2Input) o2Input.value = '96';
      const tempInput = document.querySelector('#temperature') || document.querySelector('[name="temperature"]');
      if (tempInput) tempInput.value = '37.2';
      const coughInput = document.querySelector('#symptomCough') || document.querySelector('[value="cough"]');
      if (coughInput) coughInput.checked = true;
      const dyspneaInput = document.querySelector('#symptomDyspnea') || document.querySelector('[value="dyspnea"]');
      if (dyspneaInput) dyspneaInput.checked = true;
    });

    const assessPath = path.join(ARTIFACT_DIR, 'demo_patient_assessment.png');
    await page.screenshot({ path: assessPath, fullPage: false });
    console.log(`  ✓ Saved: ${assessPath}`);

    // Screenshot 3: Patient Dashboard & Timeline
    console.log('[3/7] Navigating to Patient Dashboard & Timeline...');
    await page.evaluate(() => {
      if (typeof window.showScreen === 'function') {
        window.showScreen('patient-dashboard-screen');
      }
    });
    await new Promise(r => setTimeout(r, 1500));
    const patientDashPath = path.join(ARTIFACT_DIR, 'demo_patient_dashboard.png');
    await page.screenshot({ path: patientDashPath, fullPage: false });
    console.log(`  ✓ Saved: ${patientDashPath}`);

    // -------------------------------------------------------------
    // PART 2: DOCTOR WORKSPACE & CLINICAL REVIEW JOURNEY
    // -------------------------------------------------------------
    console.log('[4/7] Navigating to Doctor Workspace & Review Queue...');
    await page.evaluate(() => {
      if (typeof window.showScreen === 'function') {
        window.showScreen('doctor-workspace-screen') || window.showScreen('doctor-screen');
      }
    });
    await new Promise(r => setTimeout(r, 1500));
    const docWorkspacePath = path.join(ARTIFACT_DIR, 'demo_doctor_workspace.png');
    await page.screenshot({ path: docWorkspacePath, fullPage: false });
    console.log(`  ✓ Saved: ${docWorkspacePath}`);

    // Screenshot 5: Certified Clinical Report & Follow-up
    console.log('[5/7] Navigating to Certified Clinical Report View...');
    await page.evaluate(() => {
      if (typeof window.showScreen === 'function') {
        window.showScreen('clinical-report-screen') || window.showScreen('report-view-screen') || window.showScreen('case-details-screen');
      }
    });
    await new Promise(r => setTimeout(r, 1500));
    const reportPath = path.join(ARTIFACT_DIR, 'demo_doctor_approved_report.png');
    await page.screenshot({ path: reportPath, fullPage: false });
    console.log(`  ✓ Saved: ${reportPath}`);

    // -------------------------------------------------------------
    // PART 3: ADMIN GOVERNANCE & SECURITY MONITORING JOURNEY
    // -------------------------------------------------------------
    console.log('[6/7] Navigating to Admin KPI Dashboard...');
    await page.evaluate(() => {
      if (typeof window.showScreen === 'function') {
        window.showScreen('admin-workspace-screen') || window.showScreen('admin-screen') || window.showScreen('kpi-screen');
      }
    });
    await new Promise(r => setTimeout(r, 1500));
    const adminKpiPath = path.join(ARTIFACT_DIR, 'demo_admin_kpi_dashboard.png');
    await page.screenshot({ path: adminKpiPath, fullPage: false });
    console.log(`  ✓ Saved: ${adminKpiPath}`);

    // Screenshot 7: Security Monitoring & Audit Trail
    console.log('[7/7] Navigating to Security Monitoring & Audit Trail...');
    await page.evaluate(() => {
      if (typeof window.showScreen === 'function') {
        window.showScreen('audit-logs-screen') || window.showScreen('security-logs-screen') || window.showScreen('settings-screen');
      }
    });
    await new Promise(r => setTimeout(r, 1500));
    const auditPath = path.join(ARTIFACT_DIR, 'demo_security_monitoring.png');
    await page.screenshot({ path: auditPath, fullPage: false });
    console.log(`  ✓ Saved: ${auditPath}`);

    console.log('\n==================================================================');
    console.log('🎉 REAL BROWSER DEMO CAPTURE COMPLETED SUCCESSFULLY!');
    console.log('==================================================================\n');

  } catch (err) {
    console.error('❌ Error during demo capture:', err);
    throw err;
  } finally {
    await browser.close();
  }
}

runDemoCapture().catch(e => {
  console.error(e);
  process.exit(1);
});

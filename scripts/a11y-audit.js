const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer-core");

const rootDir = path.resolve(__dirname, "..");
const appUrl = `file://${path.join(rootDir, "app", "index.html").replace(/\\/g, "/")}`;
const outputDir = path.join(rootDir, "output");
const reportPath = path.join(outputDir, "accessibility-audit.md");

function findBrowserExecutable() {
  const candidates = [
    process.env.CHROME_PATH,
    process.env.PUPPETEER_EXECUTABLE_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    ...findEdgeCoreExecutables(),
    ...findPlaywrightChromiumExecutables()
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate));
}

function findEdgeCoreExecutables() {
  const root = "C:\\Program Files (x86)\\Microsoft\\EdgeCore";
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root)
    .map((entry) => path.join(root, entry, "msedge.exe"))
    .filter((candidate) => fs.existsSync(candidate))
    .sort()
    .reverse();
}

function findPlaywrightChromiumExecutables() {
  const roots = [
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "ms-playwright"),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Packages", "OpenAI.Codex_2p2nqsd0c76g0", "LocalCache", "Local", "ms-playwright")
  ].filter(Boolean);
  const found = [];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    for (const entry of fs.readdirSync(root)) {
      const executable = path.join(root, entry, "chrome-win64", "chrome.exe");
      if (fs.existsSync(executable)) found.push(executable);
    }
  }
  return found;
}

function fail(message, details = []) {
  return { pass: false, message, details };
}

function pass(message, details = []) {
  return { pass: true, message, details };
}

async function run() {
  const executablePath = findBrowserExecutable();
  if (!executablePath) {
    throw new Error("No Chrome or Edge executable found. Set CHROME_PATH to run the accessibility audit.");
  }

  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  const browser = await puppeteer.launch({
    executablePath,
    headless: "new",
    args: ["--allow-file-access-from-files", "--disable-web-security"]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 900, deviceScaleFactor: 1 });
  await page.goto(appUrl, { waitUntil: "domcontentloaded" });
  await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
  const axeSource = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
  await page.evaluate(axeSource);

  const axeResults = await page.evaluate(async () => {
    return await window.axe.run(document, {
      runOnly: {
        type: "tag",
        values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]
      }
    });
  });

  const customChecks = await page.evaluate(() => {
    const visible = (el) => {
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
    };
    const results = [];
    const interactive = Array.from(document.querySelectorAll("button, a[href], input:not([type='hidden']), select, textarea"))
      .filter(visible);
    const smallTargets = interactive
      .map((el) => ({ label: el.id || el.textContent.trim().slice(0, 60) || el.getAttribute("aria-label") || el.tagName, rect: el.getBoundingClientRect() }))
      .filter(({ rect }) => rect.width < 44 || rect.height < 44)
      .slice(0, 25);
    results.push(smallTargets.length ? { pass: false, message: "Visible interactive controls below 44px target size.", details: smallTargets.map(({ label, rect }) => `${label}: ${Math.round(rect.width)}x${Math.round(rect.height)}`) } : { pass: true, message: "Visible interactive controls meet the 44px target-size baseline on the audited viewport.", details: [] });

    const unnamedDialogs = Array.from(document.querySelectorAll("[role='dialog'], [role='alertdialog']"))
      .filter((dialog) => {
        const labelledBy = dialog.getAttribute("aria-labelledby");
        const label = dialog.getAttribute("aria-label");
        return !(label && label.trim()) && !(labelledBy && document.getElementById(labelledBy));
      })
      .map((dialog) => dialog.id || dialog.className || dialog.tagName);
    results.push(unnamedDialogs.length ? { pass: false, message: "Dialogs missing accessible names.", details: unnamedDialogs } : { pass: true, message: "Dialogs have accessible names.", details: [] });

    const hasLiveRegion = Boolean(document.querySelector("[aria-live], [role='status'], [role='alert']"));
    results.push(hasLiveRegion ? { pass: true, message: "Live regions are present for status and error announcements.", details: [] } : { pass: false, message: "No live region found.", details: [] });

    const reducedMotionRules = Array.from(document.styleSheets)
      .flatMap((sheet) => {
        try { return Array.from(sheet.cssRules || []); } catch (e) { return []; }
      })
      .some((rule) => String(rule.conditionText || rule.cssText || "").includes("prefers-reduced-motion"));
    results.push(reducedMotionRules ? { pass: true, message: "Reduced-motion CSS is present.", details: [] } : { pass: false, message: "Reduced-motion CSS was not found.", details: [] });

    const focusRule = Array.from(document.styleSheets)
      .flatMap((sheet) => {
        try { return Array.from(sheet.cssRules || []); } catch (e) { return []; }
      })
      .some((rule) => String(rule.selectorText || "").includes(":focus-visible"));
    results.push(focusRule ? { pass: true, message: "Visible focus styling is defined.", details: [] } : { pass: false, message: "No :focus-visible styling found.", details: [] });

    return results;
  });

  await browser.close();

  const lines = [
    "# Accessibility Audit",
    "",
    `Date: ${new Date().toISOString()}`,
    "",
    "Scope: static browser audit of `app/index.html` plus manual review of shared navigation, dialogs, focus handling, live regions, contrast-oriented styling, target sizes, and reduced-motion support.",
    "",
    "Important note: this is not a claim of full WCAG or legal compliance. Automated tooling can miss issues, especially for authenticated workflows, dynamic Firebase data, clinical review states, and assistive-technology behavior.",
    "",
    "## Automated Axe Results",
    "",
    axeResults.violations.length
      ? `Axe reported ${axeResults.violations.length} violation group(s).`
      : "Axe reported no WCAG A/AA violations on the audited static viewport.",
    ""
  ];

  axeResults.violations.forEach((violation) => {
    lines.push(`- ${violation.id}: ${violation.help}`);
    violation.nodes.slice(0, 10).forEach((node) => {
      lines.push(`  - ${node.target.join(", ")}: ${node.failureSummary ? node.failureSummary.replace(/\s+/g, " ").trim() : "No summary"}`);
    });
  });

  lines.push("", "## Custom Checks", "");
  customChecks.forEach((check) => {
    lines.push(`- ${check.pass ? "PASS" : "REVIEW"}: ${check.message}`);
    check.details.forEach((detail) => lines.push(`  - ${detail}`));
  });

  lines.push(
    "",
    "## Manual Review Notes",
    "",
    "- Keyboard navigation: reviewed shared skip link, nav buttons, authentication dialog, legal modal, emergency/confirmation dialog patterns, and visible focus treatment. Full authenticated role-by-role keyboard testing still requires seeded accounts and representative Firebase data.",
    "- Screen reader behavior: dialogs now expose `role`, `aria-modal`, labels/descriptions, focus trapping, Escape handling where a close control exists, and status/error announcements. A real screen reader pass with NVDA/VoiceOver is still recommended before claiming compliance.",
    "- Reliance on color alone: emergency and status patterns include text/icons as well as color. Some dynamically rendered admin tables and generated clinical result cards should be checked with real production data.",
    "- Contrast and scaling: shared muted text contrast, focus rings, target sizing, and scrollable dialogs were improved. Inline legacy styles remain in some deep screens and should be sampled during the next role-specific QA pass.",
    "",
    "## Remaining Issues",
    "",
    "- Authenticated patient, doctor, admin, and support workflows were not exhaustively tested with real assistive technology in this automated run.",
    "- Third-party Firebase/Google authentication widgets and browser permission prompts are outside the static page audit.",
    "- Inline dynamic HTML in `app/app.js` is broad; future feature work should keep using semantic buttons/labels and avoid icon-only controls without names."
  );

  fs.writeFileSync(reportPath, `${lines.join("\n")}\n`, "utf8");

  if (axeResults.violations.length || customChecks.some((check) => !check.pass)) {
    console.log(`Accessibility audit completed with review items. Report: ${reportPath}`);
  } else {
    console.log(`Accessibility audit passed automated checks. Report: ${reportPath}`);
  }
}

run().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});

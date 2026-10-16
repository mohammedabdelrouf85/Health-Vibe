/**
 * Comprehensive SEO Meta Tags, Canonical Links, Open Graph & Twitter Cards Test Suite
 * 
 * Verifies that all public pages have:
 * 1. Descriptive <meta name="description"> (> 20 chars)
 * 2. Canonical <link rel="canonical" href="...">
 * 3. Open Graph tags: og:title, og:description, og:image, og:url, og:site_name, og:image:alt
 * 4. Twitter Card tags: twitter:card, twitter:title, twitter:description, twitter:image, twitter:image:alt
 * 5. Brand logo (logo-dark.webp) integration
 * 6. Platform tagline inclusion
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");

console.log("==================================================================");
console.log("🌐 HEALTH VIBE AI: COMPREHENSIVE SEO & SOCIAL META TAGS TEST SUITE");
console.log("   Title, Description, Canonical, OG, Twitter, Brand Logo & Tagline");
console.log("==================================================================\n");

const ROOT = path.resolve(__dirname, "..");

const publicPages = [
  {
    name: "Root Portal",
    file: "index.html",
    expectedCanonical: "https://healthvibe.ai/",
    isIndexed: true
  },
  {
    name: "Main Patient & Clinical Hub",
    file: "app/index.html",
    expectedCanonical: "https://healthvibe.ai/app/",
    isIndexed: true
  },
  {
    name: "Clinics Landing & ROI Calculator",
    file: "app/clinics.html",
    expectedCanonical: "https://healthvibe.ai/app/clinics.html",
    isIndexed: true
  },
  {
    name: "Pitch Deck Presentation",
    file: "app/pitch.html",
    expectedCanonical: "https://healthvibe.ai/app/pitch.html",
    isIndexed: false // protected with noindex
  },
  {
    name: "Mobile Web Hub",
    file: "mobile/web/index.html",
    expectedCanonical: "https://healthvibe.ai/mobile/",
    isIndexed: true
  }
];

let totalPassed = 0;

function runTest(testName, testFn) {
  process.stdout.write(`▶ ${testName} ... `);
  try {
    testFn();
    totalPassed++;
    console.log("✓ PASSED");
  } catch (err) {
    console.log("✗ FAILED");
    console.error(err);
    process.exit(1);
  }
}

// TEST 1: Descriptive <meta name="description"> across all public pages
runTest("TEST 1: Descriptive meta description (> 25 characters)", () => {
  for (const page of publicPages) {
    const filePath = path.join(ROOT, page.file);
    assert.ok(fs.existsSync(filePath), `${page.file} must exist`);
    const content = fs.readFileSync(filePath, "utf8");

    const descMatch = content.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i);
    assert.ok(descMatch, `${page.file} must have a <meta name="description">`);
    const desc = descMatch[1].trim();
    assert.ok(desc.length >= 25, `${page.file} description must be at least 25 characters long (was ${desc.length})`);
  }
});

// TEST 2: Canonical links across all public pages
runTest("TEST 2: Explicit canonical link matching canonical URL format", () => {
  for (const page of publicPages) {
    const filePath = path.join(ROOT, page.file);
    const content = fs.readFileSync(filePath, "utf8");

    const canonicalMatch = content.match(/<link\s+rel=["']canonical["']\s+href=["']([^"']+)["']/i);
    assert.ok(canonicalMatch, `${page.file} must have a <link rel="canonical">`);
    assert.strictEqual(canonicalMatch[1], page.expectedCanonical, `${page.file} canonical link mismatch`);
  }
});

// TEST 3: Open Graph tags (og:title, og:description, og:image, og:url)
runTest("TEST 3: Full Open Graph tags (title, description, image, url, site_name, alt)", () => {
  for (const page of publicPages) {
    const filePath = path.join(ROOT, page.file);
    const content = fs.readFileSync(filePath, "utf8");

    assert.ok(content.includes('property="og:title"'), `${page.file} must have og:title`);
    assert.ok(content.includes('property="og:description"'), `${page.file} must have og:description`);
    assert.ok(content.includes('property="og:image"'), `${page.file} must have og:image`);
    assert.ok(content.includes('property="og:url"'), `${page.file} must have og:url`);
    assert.ok(content.includes('property="og:site_name"'), `${page.file} must have og:site_name`);
    assert.ok(content.includes('property="og:image:alt"'), `${page.file} must have og:image:alt`);
  }
});

// TEST 4: Twitter Card tags (twitter:card, twitter:title, twitter:description, twitter:image)
runTest("TEST 4: Twitter Card tags (summary_large_image, title, description, image, alt)", () => {
  for (const page of publicPages) {
    const filePath = path.join(ROOT, page.file);
    const content = fs.readFileSync(filePath, "utf8");

    assert.ok(content.includes('name="twitter:card"'), `${page.file} must have twitter:card`);
    assert.ok(content.includes('content="summary_large_image"'), `${page.file} twitter:card must be summary_large_image`);
    assert.ok(content.includes('name="twitter:title"'), `${page.file} must have twitter:title`);
    assert.ok(content.includes('name="twitter:description"'), `${page.file} must have twitter:description`);
    assert.ok(content.includes('name="twitter:image"'), `${page.file} must have twitter:image`);
    assert.ok(content.includes('name="twitter:image:alt"'), `${page.file} must have twitter:image:alt`);
  }
});

// TEST 5: Brand logo featured in og:image and twitter:image
runTest("TEST 5: Brand logo (logo-dark.webp) featured across social share cards", () => {
  for (const page of publicPages) {
    const filePath = path.join(ROOT, page.file);
    const content = fs.readFileSync(filePath, "utf8");

    assert.ok(content.includes("https://healthvibe.ai/app/logo-dark.webp"), `${page.file} must feature the brand logo in social meta tags`);
  }
});

// TEST 6: Platform tagline representation in meta tags
runTest("TEST 6: Platform tagline representation across public pages", () => {
  for (const page of publicPages) {
    const filePath = path.join(ROOT, page.file);
    const content = fs.readFileSync(filePath, "utf8");

    const hasArabicTagline = content.includes("الفرز والتشغيل السريري الذكي") || content.includes("الفرز السريري التنفسي") || content.includes("الفرز السريري الذكي");
    const hasEnglishTagline = content.includes("Smart Respiratory Clinical") || content.includes("Clinical Pre-Triage") || content.includes("Smart Clinical Pre-Triage");
    assert.ok(hasArabicTagline || hasEnglishTagline, `${page.file} must contain the platform tagline in metadata`);
  }
});

console.log("\n==================================================================");
console.log(`🎉 ALL ${totalPassed} COMPREHENSIVE SEO & SOCIAL META TAG TESTS PASSED!`);
console.log("==================================================================\n");

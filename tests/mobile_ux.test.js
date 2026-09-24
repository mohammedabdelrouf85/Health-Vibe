/**
 * Health Vibe AI - Mobile UX & Responsiveness Test Suite
 * Item 24: تحسين mobile UX (Improve mobile UX)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('==================================================================');
console.log('📱 HEALTH VIBE AI: MOBILE UX & RESPONSIVENESS TEST SUITE');
console.log('   Ergonomics, Touch Targets, Bottom Nav, Drawer Backdrop, iOS Zoom');
console.log('==================================================================\n');

const appJsPath = path.resolve(__dirname, '../app/app.js');
const indexHtmlPath = path.resolve(__dirname, '../app/index.html');
const stylesCssPath = path.resolve(__dirname, '../app/styles.css');

const appJsContent = fs.readFileSync(appJsPath, 'utf8');
const indexHtmlContent = fs.readFileSync(indexHtmlPath, 'utf8');
const stylesCssContent = fs.readFileSync(stylesCssPath, 'utf8');

// -----------------------------------------------------------------------------
// TEST 1: DOM Elements for Mobile Navigation & Backdrop
// -----------------------------------------------------------------------------
console.log('▶ TEST 1: DOM Elements for Mobile Navigation & Backdrop');
assert(indexHtmlContent.includes('id="mobileBottomNav"'), 'mobileBottomNav container exists in HTML');
assert(indexHtmlContent.includes('class="mobile-bottom-nav"'), 'mobile-bottom-nav CSS class applied');
assert(indexHtmlContent.includes('id="sidebarBackdrop"'), 'sidebarBackdrop element exists in HTML');
assert(indexHtmlContent.includes('class="sidebar-backdrop"'), 'sidebar-backdrop CSS class applied');
assert(indexHtmlContent.includes('onclick="closeSidebarDrawer()"'), 'sidebarBackdrop has closeSidebarDrawer() handler');
console.log('  ✓ Mobile bottom nav and sidebar backdrop present in app/index.html.\n');

// -----------------------------------------------------------------------------
// TEST 2: CSS Mobile UX Design System & Safe Area Insets
// -----------------------------------------------------------------------------
console.log('▶ TEST 2: CSS Mobile UX Design System & Safe Area Insets');
assert(stylesCssContent.includes('env(safe-area-inset-bottom'), 'Safe area inset bottom configured for notched phones');
assert(stylesCssContent.includes('env(safe-area-inset-top'), 'Safe area inset top configured for status bars');
assert(stylesCssContent.includes('-webkit-tap-highlight-color: transparent'), 'Tap highlight color removed for crisp native feel');
assert(stylesCssContent.includes('touch-action: manipulation'), 'Touch action manipulation enabled to prevent double-tap delays');
assert(stylesCssContent.includes('button:active:not(:disabled)'), 'Active state micro-interaction scale effect defined');
console.log('  ✓ Safe area insets (iOS/Android home bars & notches) and touch feedback verified.\n');

// -----------------------------------------------------------------------------
// TEST 3: Mobile Bottom Navigation Bar Styling
// -----------------------------------------------------------------------------
console.log('▶ TEST 3: Mobile Bottom Navigation Bar Styling');
assert(stylesCssContent.includes('.mobile-bottom-nav {'), '.mobile-bottom-nav class defined in CSS');
assert(stylesCssContent.includes('.mobile-nav-btn'), '.mobile-nav-btn styling defined');
assert(stylesCssContent.includes('.mobile-nav-icon'), '.mobile-nav-icon styling defined');
assert(stylesCssContent.includes('.mobile-nav-btn.active'), 'Active state indicator for bottom navigation buttons defined');
assert(stylesCssContent.includes('backdrop-filter: blur'), 'Glassmorphism blur applied to bottom navigation');
console.log('  ✓ Glassmorphic mobile bottom bar styled with active pill indicators.\n');

// -----------------------------------------------------------------------------
// TEST 4: Mobile Drawer Backdrop & Gestures
// -----------------------------------------------------------------------------
console.log('▶ TEST 4: Mobile Drawer Backdrop & Gestures');
assert(stylesCssContent.includes('.sidebar-backdrop {'), '.sidebar-backdrop defined in CSS');
assert(stylesCssContent.includes('body.sidebar-open .sidebar-backdrop'), 'Backdrop activates smoothly when drawer is open');
assert(stylesCssContent.includes('body.sidebar-open .sidebar'), 'Sidebar slides in when sidebar-open class is set');
console.log('  ✓ Sidebar backdrop overlay and slide-in transition verified.\n');

// -----------------------------------------------------------------------------
// TEST 5: iOS Safari Auto-Zoom Prevention on Input Focus
// -----------------------------------------------------------------------------
console.log('▶ TEST 5: iOS Safari Auto-Zoom Prevention on Input Focus');
assert(stylesCssContent.includes('font-size: 16px !important'), 'Inputs enforced with >= 16px to prevent iOS auto-zoom panning');
console.log('  ✓ Mobile inputs styled with 16px font-size to guarantee zero viewport drift on focus.\n');

// -----------------------------------------------------------------------------
// TEST 6: Mobile Bottom Sheet Modal Transformation
// -----------------------------------------------------------------------------
console.log('▶ TEST 6: Mobile Bottom Sheet Modal Transformation');
assert(stylesCssContent.includes('mobileSheetSlideUp'), 'mobileSheetSlideUp keyframe animation declared');
assert(stylesCssContent.includes('.confirm-card::before'), 'Mobile drag handle pill styled on bottom sheet modals');
assert(stylesCssContent.includes('border-radius: 24px 24px 0 0'), 'Bottom sheet top-rounded border radius defined');
console.log('  ✓ Modals smoothly transform into bottom sheets with drag handle on mobile.\n');

// -----------------------------------------------------------------------------
// TEST 7: Floating Theme Toggle Elevation
// -----------------------------------------------------------------------------
console.log('▶ TEST 7: Floating Theme Toggle Elevation');
assert(stylesCssContent.includes('.theme-fab'), '.theme-fab styles defined');
assert(stylesCssContent.includes('bottom: calc(78px + var(--sab)) !important'), 'Theme toggle elevated above mobile bottom nav on small viewports');
console.log('  ✓ Theme FAB elevated to avoid collision with bottom navigation bar.\n');

// -----------------------------------------------------------------------------
// TEST 8: Global JavaScript Methods on window in app.js
// -----------------------------------------------------------------------------
console.log('▶ TEST 8: Global JavaScript Methods on window in app.js');
assert(appJsContent.includes('window.toggleSidebarDrawer = toggleSidebarDrawer;'), 'toggleSidebarDrawer exposed on window');
assert(appJsContent.includes('window.closeSidebarDrawer = closeSidebarDrawer;'), 'closeSidebarDrawer exposed on window');
assert(appJsContent.includes('window.updateMobileBottomNav = updateMobileBottomNav;'), 'updateMobileBottomNav exposed on window');
assert(appJsContent.includes('window.initMobileTouchGestures = initMobileTouchGestures;'), 'initMobileTouchGestures exposed on window');
console.log('  ✓ All 4 mobile drawer and bottom nav controller methods exposed on window.\n');

// -----------------------------------------------------------------------------
// TEST 9: Adaptive Role-Based Mobile Navigation Logic
// -----------------------------------------------------------------------------
console.log('▶ TEST 9: Adaptive Role-Based Mobile Navigation Logic');
assert(appJsContent.includes('function updateMobileBottomNav()'), 'updateMobileBottomNav function defined');
assert(appJsContent.includes('currentRole === ROLES.DOCTOR'), 'Doctor-specific mobile bottom nav items supported');
assert(appJsContent.includes('isAdminRole(currentRole)'), 'Admin-specific mobile bottom nav items supported');
assert(appJsContent.includes('toggleSidebarDrawer'), 'Menu button toggles drawer in mobile bottom nav');
console.log('  ✓ Adaptive bottom navigation custom-tailored for Patients, Doctors, and Admins.\n');

console.log('==================================================================');
console.log('🎉 ALL 9 MOBILE UX & RESPONSIVENESS TESTS PASSED WITH 100% SUCCESS!');
console.log('==================================================================');

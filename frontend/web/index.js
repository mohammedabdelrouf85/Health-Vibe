/**
 * HealthVibe AI - Frontend Web Client Bridge
 * Points to and structures the active client web distribution.
 */

'use strict';

const path = require('path');

const WEB_PUBLIC_ROOT = path.resolve(__dirname, '../../app');
const APP_JS_PATH = path.join(WEB_PUBLIC_ROOT, 'app.js');
const INDEX_HTML_PATH = path.join(WEB_PUBLIC_ROOT, 'index.html');

module.exports = {
  WEB_PUBLIC_ROOT,
  APP_JS_PATH,
  INDEX_HTML_PATH,
  meta: {
    app_name: 'HealthVibe AI',
    default_theme: 'dark',
    supported_locales: ['ar', 'en'],
    accessibility_level: 'WCAG_2.1_AAA'
  }
};

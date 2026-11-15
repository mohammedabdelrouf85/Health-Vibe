'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const app = fs.readFileSync(path.join(__dirname, '..', 'app', 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'app', 'index.html'), 'utf8');
const schema = fs.readFileSync(path.join(__dirname, '..', 'backend', 'ASSESSMENT_SCHEMA.md'), 'utf8');

const start = app.indexOf('function parseOptionalRescueInhalerUses(');
const end = app.indexOf('\nfunction normalizeEnvironmentalExposures', start);
assert(start >= 0 && end > start, 'Rescue inhaler parser should be defined before exposure normalization.');
const normalizeArabicIndicDigits = value => String(value).replace(/[٠-٩]/g, digit => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit))).replace(/[۰-۹]/g, digit => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)));
const parser = new Function('normalizeArabicIndicDigits', `return (${app.slice(start, end).replace('function parseOptionalRescueInhalerUses', 'function').trim()})`)(normalizeArabicIndicDigits);
const parse = (value, unknown = false) => parser(value, unknown);

assert.deepStrictEqual(parse('0'), { ok: true, value: 0, status: 'recorded' });
assert.deepStrictEqual(parse('4'), { ok: true, value: 4, status: 'recorded' });
assert.deepStrictEqual(parse('١٢'), { ok: true, value: 12, status: 'recorded' });
assert.deepStrictEqual(parse(''), { ok: true, value: null, status: 'not-provided' });
assert.deepStrictEqual(parse('', true), { ok: true, value: null, status: 'unknown' });
assert.strictEqual(parse('4', true).ok, false, 'Conflicting number and unknown selection must be rejected.');
assert.strictEqual(parse('1.5').ok, false, 'Fractional usage must be rejected.');
assert.strictEqual(parse('1000').ok, false, 'Out-of-range usage must be rejected.');

assert(html.includes('id="rescueInhalerUses7Days"'), 'Input should be present in the respiratory form.');
assert(html.includes('id="rescueInhalerUsageUnknown"'), 'Unknown option should be present.');
assert(app.includes('rescueInhalerUsageLast7Days: parsedRescueInhalerUses.value'), 'Normalized value should be stored in case schema.');
assert(app.includes('fields.rescueInhalerUses7Days'), 'Value should be included in assessment draft restore.');
assert(schema.includes('assessment.medications.rescueInhalerUsageStatus'), 'Status semantics should be documented.');

console.log('Rescue inhaler usage feature checks passed.');

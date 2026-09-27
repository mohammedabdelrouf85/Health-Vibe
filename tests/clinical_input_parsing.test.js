const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

const appSource = fs.readFileSync(path.resolve(__dirname, '../app/app.js'), 'utf8');
const context = {
  console,
  window: {},
  document: { getElementById: () => null, querySelector: () => null },
  currentLanguage: 'ar'
};
vm.createContext(context);

function include(start, end) {
  const begin = appSource.indexOf(start);
  assert.ok(begin >= 0, start);
  const finish = appSource.indexOf(end, begin);
  assert.ok(finish > begin, end);
  vm.runInContext(appSource.slice(begin, finish), context);
}

include('function normalizeArabicIndicDigits', 'window.openEmergencyGuideModal');
include('function validateAssessmentFields', 'document.getElementById("submitAssessment")');

const validCommon = {
  breathingDifficulty: 'نعم',
  coughLevel: 'متوسطة',
  symptomDuration: '3 أيام',
  chestPain: 'لا',
  symptomProgression: 'ثابتة',
  recentInfection: 'لا',
  asthmaCopd: 'لا',
  riskFactors: ['لا يوجد']
};

function validate(overrides) {
  return context.validateAssessmentFields({
    ...validCommon,
    oxygenLevel: '95',
    isEn: true,
    ...overrides
  });
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

assert.deepEqual(plain(context.parseStrictOxygenInput('٩٥')), { ok: true, value: 95, reason: null });
assert.deepEqual(plain(context.parseStrictOxygenInput('۹۵%')), { ok: true, value: 95, reason: null });
assert.equal(context.parseStrictOxygenInput('').reason, 'empty');
assert.equal(context.parseStrictOxygenInput('-95').reason, 'format');
assert.equal(context.parseStrictOxygenInput('95abc').reason, 'format');
assert.equal(context.parseStrictOxygenInput('٩٥/٢').reason, 'format');
assert.equal(context.parseStrictOxygenInput('200').reason, 'above-range');
assert.equal(context.parseStrictOxygenInput('49').reason, 'below-range');
assert.equal(context.parseStrictOxygenInput('50').ok, true);
assert.equal(context.parseStrictOxygenInput('100').ok, true);

assert.deepEqual(plain(context.parseStrictSymptomDurationInput('٣ أيام')), { ok: true, value: 3, text: '٣ أيام', reason: null });
assert.deepEqual(plain(context.parseStrictSymptomDurationInput('7 days')), { ok: true, value: 7, text: '7 days', reason: null });
assert.equal(context.parseStrictSymptomDurationInput('').reason, 'empty');
assert.equal(context.parseStrictSymptomDurationInput('-3 أيام').reason, 'format');
assert.equal(context.parseStrictSymptomDurationInput('3.5 أيام').reason, 'format');
assert.equal(context.parseStrictSymptomDurationInput('abc3').reason, 'format');
assert.equal(context.parseStrictSymptomDurationInput('0 أيام').reason, 'below-range');
assert.equal(context.parseStrictSymptomDurationInput('366 أيام').reason, 'above-range');
assert.equal(context.parseStrictSymptomDurationInput('365 يوم').ok, true);

assert.deepEqual(plain(context.parseOptionalTemperatureInput('٣٧.٥ C')), { ok: true, value: 37.5, unit: '°C', reason: null });
assert.equal(context.parseOptionalTemperatureInput('').reason, 'not-provided');
assert.equal(context.parseOptionalTemperatureInput('unknown').reason, 'unknown');
assert.equal(context.parseOptionalTemperatureInput('33').reason, 'below-range');
assert.equal(context.parseOptionalTemperatureInput('44').reason, 'above-range');
assert.deepEqual(plain(context.parseOptionalRespiratoryRateInput('١٨')), { ok: true, value: 18, unit: 'breaths/min', reason: null });
assert.equal(context.parseOptionalRespiratoryRateInput('').reason, 'not-provided');
assert.equal(context.parseOptionalRespiratoryRateInput('غير معروف').reason, 'unknown');
assert.equal(context.parseOptionalRespiratoryRateInput('4').reason, 'below-range');
assert.equal(context.parseOptionalRespiratoryRateInput('61').reason, 'above-range');
assert.equal(context.normalizeYesNoUnknown('غير معروف'), 'unknown');
assert.equal(context.normalizeSymptomProgression('تسوء'), 'worsening');

assert.equal(validate({ oxygenLevel: '95abc' }).isValid, false);
assert.equal(validate({ oxygenLevel: '200' }).errors[0].field, 'oxygenInput');
assert.equal(validate({ oxygenLevel: '٩٥' }).isValid, true);
assert.equal(validate({ oxygenLevel: '95/2' }).isValid, false);
assert.equal(validate({ symptomDuration: '٧ أيام' }).isValid, true);
assert.equal(validate({ symptomDuration: '7/2 أيام' }).isValid, false);
assert.equal(validate({ symptomDuration: '365 days' }).isValid, true);
assert.equal(validate({ symptomDuration: '366 days' }).isValid, false);
assert.equal(validate({ temperature: '37.1' }).isValid, true);
assert.equal(validate({ temperature: '44' }).isValid, false);
assert.equal(validate({ respiratoryRate: '18' }).isValid, true);
assert.equal(validate({ respiratoryRate: '70' }).isValid, false);
assert.equal(validate({ chestPain: 'غير معروف', recentInfection: 'لا', asthmaCopd: 'نعم', symptomProgression: 'ثابتة' }).isValid, true);
assert.equal(validate({ symptomProgression: 'rapidly' }).isValid, false);

console.log('PASS: strict clinical input parsing rejects unsafe coercion and handles Arabic digits, empty values, bounds, and fractions.');

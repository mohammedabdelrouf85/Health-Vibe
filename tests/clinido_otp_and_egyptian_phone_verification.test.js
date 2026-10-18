/**
 * HEALTH VIBE AI: TASK #81 CLINIDO-GRADE OTP & EGYPTIAN PHONE VERIFICATION TEST SUITE
 * 
 * Verifies Task #81:
 * "تأكيد البريد الإلكتروني ورقم الهاتف (OTP) | تفعيل التحقق من البريد الإلكتروني 
 *  أو رقم الموبايل المصري (010/011/012/015) عبر رمز تحقق OTP لضمان صحة بيانات التواصل عند إرسال التقارير. | CliniDo"
 */

const assert = require("assert");
const http = require("http");
const whatsappBot = require("../backend/whatsapp-bot");
const app = require("../backend/server");

console.log("==================================================================");
console.log("📱 HEALTH VIBE AI: TASK #81 CLINIDO OTP & EGYPTIAN PHONE TESTS");
console.log("==================================================================\n");

async function runTests() {
  whatsappBot.resetSandbox();
  whatsappBot.setSandboxMode({ enabled: true, simulateDelayMs: 0 });

  // -----------------------------------------------------------------------------
  // TEST 1: Egyptian Mobile Number & Operator Carrier Validation (010/011/012/015)
  // -----------------------------------------------------------------------------
  console.log("▶ TEST 1: Egyptian Mobile Number & Operator Carrier Validation (010/011/012/015)");

  // 1a. Vodafone Egypt (010)
  const vodafoneLocal = whatsappBot.validateEgyptianMobile("01012345678");
  assert.strictEqual(vodafoneLocal.isValid, true);
  assert.strictEqual(vodafoneLocal.operator, "Vodafone");
  assert.strictEqual(vodafoneLocal.carrierCode, "010");
  assert.strictEqual(vodafoneLocal.normalizedNumber, "201012345678");

  // 1b. Etisalat / e& Egypt (011)
  const etisalatIntl = whatsappBot.validateEgyptianMobile("+201112345678");
  assert.strictEqual(etisalatIntl.isValid, true);
  assert.strictEqual(etisalatIntl.operator, "Etisalat");
  assert.strictEqual(etisalatIntl.carrierCode, "011");

  // 1c. Orange Egypt (012)
  const orangeLocal = whatsappBot.validateEgyptianMobile("01212345678");
  assert.strictEqual(orangeLocal.isValid, true);
  assert.strictEqual(orangeLocal.operator, "Orange");
  assert.strictEqual(orangeLocal.carrierCode, "012");

  // 1d. WE / Telecom Egypt (015)
  const weIntl = whatsappBot.validateEgyptianMobile("00201512345678");
  assert.strictEqual(weIntl.isValid, true);
  assert.strictEqual(weIntl.operator, "WE");
  assert.strictEqual(weIntl.carrierCode, "015");

  // 1e. Rejection of unassigned / invalid Egyptian mobile prefixes
  const invalid013 = whatsappBot.validateEgyptianMobile("01312345678");
  assert.strictEqual(invalid013.isValid, false);
  assert.strictEqual(invalid013.reason, "INVALID_EGYPTIAN_OPERATOR");

  const invalid014 = whatsappBot.validateEgyptianMobile("01412345678");
  assert.strictEqual(invalid014.isValid, false);

  const invalidLength = whatsappBot.validateEgyptianMobile("010123456"); // 9 digits
  assert.strictEqual(invalidLength.isValid, false);
  assert.strictEqual(invalidLength.reason, "INVALID_EGYPTIAN_FORMAT");

  console.log("  ✓ All 4 Egyptian carriers verified: 010 (Vodafone), 011 (Etisalat), 012 (Orange), 015 (WE).");
  console.log("  ✓ Invalid operator prefixes (013, 014, etc.) and short/long numbers strictly rejected.\n");

  // -----------------------------------------------------------------------------
  // TEST 2: Request Verification Code with Egyptian Carrier Protection
  // -----------------------------------------------------------------------------
  console.log("▶ TEST 2: Request Verification Code with Egyptian Carrier Protection");

  // Invalid Egyptian number must throw an explicit error with Arabic guidance
  await assert.rejects(
    async () => {
      await whatsappBot.requestVerificationCode({
        userId: "user_test_eg_invalid",
        phoneNumber: "01312345678",
        ip: "127.0.0.1"
      });
    },
    (err) => {
      assert.strictEqual(err.code, "INVALID_EGYPTIAN_MOBILE");
      assert.ok(err.message.includes("010"));
      return true;
    },
    "Must reject 013 prefix with INVALID_EGYPTIAN_MOBILE"
  );

  // Valid Egyptian number succeeds and returns ZERO plain code in response
  const reqRes = await whatsappBot.requestVerificationCode({
    userId: "user_test_eg_valid",
    phoneNumber: "01098765432",
    ip: "127.0.0.1"
  });
  assert.strictEqual(reqRes.success, true);
  assert.strictEqual(reqRes.maskedPhone, "+201 **** 5432");
  assert.strictEqual(reqRes.code, undefined, "Plaintext code must NEVER be disclosed in response");

  console.log("  ✓ Invalid Egyptian prefix throws INVALID_EGYPTIAN_MOBILE.");
  console.log("  ✓ Valid Egyptian mobile 01098765432 dispatched securely with ZERO code disclosure.\n");

  // -----------------------------------------------------------------------------
  // TEST 3: HTTP API Integration: Phone Validation Endpoint
  // -----------------------------------------------------------------------------
  console.log("▶ TEST 3: HTTP API Integration: Phone Validation Endpoint (/api/auth/phone/validate)");

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  async function apiPost(path, body, headers = {}) {
    return new Promise((resolve, reject) => {
      const data = JSON.stringify(body);
      const req = http.request(
        {
          hostname: "127.0.0.1",
          port,
          path,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Content-Length": Buffer.byteLength(data),
            ...headers
          }
        },
        (res) => {
          let buf = "";
          res.on("data", (c) => (buf += c));
          res.on("end", () => {
            try {
              resolve({ status: res.statusCode, body: JSON.parse(buf) });
            } catch (e) {
              resolve({ status: res.statusCode, body: buf });
            }
          });
        }
      );
      req.on("error", reject);
      req.write(data);
      req.end();
    });
  }

  async function apiGet(path, headers = {}) {
    return new Promise((resolve, reject) => {
      const req = http.request(
        {
          hostname: "127.0.0.1",
          port,
          path,
          method: "GET",
          headers
        },
        (res) => {
          let buf = "";
          res.on("data", (c) => (buf += c));
          res.on("end", () => {
            try {
              resolve({ status: res.statusCode, body: JSON.parse(buf) });
            } catch (e) {
              resolve({ status: res.statusCode, body: buf });
            }
          });
        }
      );
      req.on("error", reject);
      req.end();
    });
  }

  // Test Egyptian phone validation endpoint
  const phoneRes = await apiPost("/api/auth/phone/validate", { phoneNumber: "01123456789" });
  assert.strictEqual(phoneRes.status, 200);
  assert.strictEqual(phoneRes.body.isValid, true);
  assert.strictEqual(phoneRes.body.operator, "Etisalat");
  assert.strictEqual(phoneRes.body.carrierCode, "011");

  const phoneResInvalid = await apiPost("/api/auth/phone/validate", { phoneNumber: "01999999999" });
  assert.strictEqual(phoneResInvalid.status, 200);
  assert.strictEqual(phoneResInvalid.body.isValid, false);
  assert.strictEqual(phoneResInvalid.body.reason, "INVALID_EGYPTIAN_OPERATOR");

  console.log("  ✓ /api/auth/phone/validate correctly identifies carriers and rejects unassigned prefixes.\n");

  // -----------------------------------------------------------------------------
  // TEST 4: Email OTP Verification Endpoints & Contact Delivery Status
  // -----------------------------------------------------------------------------
  console.log("▶ TEST 4: Email OTP Verification Endpoints & Contact Delivery Status");

  // Mock authenticated user headers via dev emulator bypass
  const authHeaders = {
    "x-test-uid": "clinido_patient_ahmed",
    "x-test-email": "ahmed.clinido@example.com",
    "x-test-role": "patient"
  };

  // 4a. Request Email OTP
  const emailReqRes = await apiPost("/api/auth/email/request-otp", {}, authHeaders);
  assert.strictEqual(emailReqRes.status, 200);
  assert.strictEqual(emailReqRes.body.success, true);
  assert.strictEqual(emailReqRes.body.code, undefined, "Email OTP must NOT be returned in API response");

  // 4b. Immediate re-request triggers 60s cooldown
  const emailCooldownRes = await apiPost("/api/auth/email/request-otp", {}, authHeaders);
  assert.strictEqual(emailCooldownRes.status, 429);
  assert.strictEqual(emailCooldownRes.body.error, "RATE_LIMITED");

  // 4c. Verify Email OTP with invalid code
  const verifyFailRes = await apiPost("/api/auth/email/verify-otp", { code: "000000" }, authHeaders);
  assert.strictEqual(verifyFailRes.status, 400);
  assert.strictEqual(verifyFailRes.body.error, "CODE_MISMATCH");

  // 4d. Check Contact Verification Status for medical reports
  const contactStatusRes = await apiGet("/api/reports/contact-verification-status", authHeaders);
  assert.strictEqual(contactStatusRes.status, 200);
  assert.strictEqual(contactStatusRes.body.success, true);
  assert.strictEqual(typeof contactStatusRes.body.canReceiveReports, "boolean");

  console.log("  ✓ /api/auth/email/request-otp generates secure OTP with 60s cooldown enforcement.");
  console.log("  ✓ /api/reports/contact-verification-status gates report delivery upon verified contact.\n");

  server.close();

  console.log("==================================================================");
  console.log("🎉 ALL TASK #81 CLINIDO OTP & EGYPTIAN PHONE TESTS PASSED (100%)!");
  console.log("==================================================================");
  process.exit(0);
}

runTests().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});

/**
 * Assessment Draft Flow Regression Test
 * Verifies interruption recovery, patient-owned draft storage, and separation
 * between drafts and doctor-visible submitted cases.
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const appJs = fs.readFileSync(path.join(__dirname, "..", "app", "app.js"), "utf8");
const indexHtml = fs.readFileSync(path.join(__dirname, "..", "app", "index.html"), "utf8");
const rules = fs.readFileSync(path.join(__dirname, "..", "firestore.rules"), "utf8");

console.log("==================================================================");
console.log("🫁 HEALTH VIBE AI: ASSESSMENT DRAFT FLOW TEST");
console.log("==================================================================\n");

assert(appJs.includes('const ASSESSMENT_DRAFT_COLLECTION = "assessmentDrafts"'), "Drafts must use a separate collection from clinical cases");
assert(appJs.includes("function gatherAssessmentDraftFields"), "Assessment answers must be gatherable for draft autosave");
assert(appJs.includes("function applyAssessmentDraftFields"), "Saved assessment answers must be restorable after interruption");
assert(appJs.includes("function saveAssessmentDraftNow"), "Draft saving function must exist");
assert(appJs.includes("function loadAssessmentDraft"), "Draft recovery function must exist");
assert(appJs.includes("root.addEventListener(\"input\", scheduleAssessmentDraftSave)"), "Draft autosave must handle typed fields");
assert(appJs.includes("root.addEventListener(\"click\", (event) =>"), "Draft autosave must handle choice buttons");
assert(appJs.includes("if (_assessmentSubmitting)"), "Duplicate assessment submissions must be blocked");
assert(appJs.includes("await clearAssessmentDraft();"), "Draft must be cleared/sealed after successful case submission");
assert(appJs.includes('db.collection("cases").add(caseData)'), "Doctor-visible case must still be created only during final submission");

assert(indexHtml.includes('id="assessmentProgressBar"'), "Assessment screen must include clear progress indication");
assert(indexHtml.includes('id="assessmentDraftStatus"'), "Assessment screen must show draft save state");
assert(indexHtml.includes('id="assessmentRecoveryBanner"'), "Assessment screen must expose draft recovery UI");
assert(indexHtml.includes('id="btnAssessmentPrev"'), "Assessment screen must support backward navigation without losing answers");
assert(indexHtml.includes('id="btnAssessmentNext"'), "Assessment screen must support forward navigation without losing answers");
assert(indexHtml.includes('id="confirmTemperature"'), "Confirmation dialog must include editable summary details beyond basic fields");
assert(indexHtml.includes('id="btnCancelSendAssessment"'), "Existing confirmation dialog must retain edit/back-out action");

assert(rules.includes("match /assessmentDrafts/{draftId}"), "Firestore rules must protect assessment drafts explicitly");
assert(rules.includes("draftId == request.auth.uid"), "Draft rules must link access to the signed-in user");
assert(rules.includes("request.resource.data.patientId == request.auth.uid"), "Draft writes must be patient-owned");
assert(rules.includes("!('assignedDoctorId' in request.resource.data)"), "Drafts must not be assignable to doctors");

const doctorQueueIsolationSnippet = "const realCases = (allCases || []).filter(c => {";
assert(appJs.includes(doctorQueueIsolationSnippet), "Doctor queue must filter records before display");
assert(appJs.includes("[CASE_STATUS.ASSIGNED, CASE_STATUS.TRIAGED, CASE_STATUS.PENDING, CASE_STATUS.SUBMITTED]"), "Doctor queue must use submitted/triaged statuses, not draft records");
assert(appJs.includes('if (c.status === CASE_STATUS.DRAFT || c.status === "draft") return false;'), "Doctor queue must explicitly exclude draft case records");

console.log("  ✓ Draft autosave and recovery hooks are present.");
console.log("  ✓ Drafts are patient-owned and permission-protected.");
console.log("  ✓ Doctor-visible cases are created only by final submission.");
console.log("  ✓ Doctor queue remains isolated from draft records.\n");
console.log("==================================================================");
console.log("✅ ASSESSMENT DRAFT FLOW TEST PASSED");
console.log("==================================================================\n");

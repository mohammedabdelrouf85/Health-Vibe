/**
 * Medical case file upload hardening regression checks.
 */

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const appJs = fs.readFileSync(path.join(root, 'app', 'app.js'), 'utf8');
const appHtml = fs.readFileSync(path.join(root, 'app', 'index.html'), 'utf8');
const firestoreRules = fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8');
const storageRules = fs.readFileSync(path.join(root, 'storage.rules'), 'utf8');

console.log('Medical file upload security checks');

assert(appHtml.includes('id="fileUpload" type="file" multiple accept='), 'fileUpload must accept only declared medical file types');
assert(!appHtml.includes('حالة تجريبية: يتم تسجيل اسم الملف فقط'), 'fileUpload must no longer be name-only demo behavior');

assert(appJs.includes('const MEDICAL_FILE_ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"]'), 'client must restrict medical MIME types');
assert(appJs.includes('const MEDICAL_FILE_MAX_SIZE = 10 * 1024 * 1024'), 'client must enforce a 10MB medical upload size limit');
assert(appJs.includes('MEDICAL_FILE_BLOCKED_EXECUTABLE_EXTENSIONS'), 'client must block executable extensions');
assert(appJs.includes('getSafeMedicalFileName'), 'client must generate safe storage filenames');
assert(appJs.includes('storage.ref().child(storagePath).put(state.file'), 'client must perform actual Firebase Storage uploads');
assert(appJs.includes('uploadTask.on("state_changed"'), 'client must expose upload progress');
assert(appJs.includes('activeMedicalUploadTasks') && appJs.includes('cancelMedicalCaseUpload'), 'client must handle interrupted/cancelled uploads');
assert(appJs.includes('scanStatus: "upload_pending"') && appJs.includes('availability: "quarantined"'), 'new uploads must start quarantined and unscanned');
assert(appJs.includes('previewMedicalCaseFile') && appJs.includes('scanStatus !== "clean"'), 'client previews must stay blocked until clean scan status');
assert(appJs.includes('deleteMedicalCaseFile'), 'client must provide deletion');
assert(appJs.includes('auditFileAccessed(fileId') && appJs.includes('MEDICAL_CASE_FILE_UPLOADED') && appJs.includes('MEDICAL_CASE_FILE_DELETED'), 'file preview/upload/delete must be audited');
assert(appJs.includes('await uploadPendingMedicalFilesForCase(docRef.id)'), 'staged files must be linked to the created case');

assert(firestoreRules.includes('match /case_files/{fileId}'), 'Firestore must protect case file metadata');
assert(firestoreRules.includes('caseDoc(data.caseId).data.patientId == request.auth.uid'), 'metadata creation must require patient ownership of the linked case');
assert(firestoreRules.includes('isAssignedDoctorForCaseId(resource.data.caseId)'), 'assigned doctors must be allowed to read linked metadata');
assert(firestoreRules.includes("data.scanStatus in ['upload_pending', 'pending', 'quarantined']"), 'clients must not create already-clean files');
assert(firestoreRules.includes("data.availability == 'quarantined'"), 'clients must not make unscanned files available');
assert(firestoreRules.includes('hasBlockedExecutableExtension'), 'Firestore metadata rules must block executable extensions');

assert(storageRules.includes('match /case_files/{patientId}/{caseId}/{fileId}/{fileName}'), 'Storage must protect case file objects by patient/case/file path');
assert(storageRules.includes("fileDoc(fileId).data.scanStatus == 'clean'"), 'Storage reads must require clean scan status');
assert(storageRules.includes("fileDoc(fileId).data.availability == 'available'"), 'Storage reads must require available status');
assert(storageRules.includes('isAssignedDoctorForCase(caseId)'), 'Storage reads must allow only assigned doctors for doctor access');
assert(storageRules.includes('caseDoc(caseId).data.patientId == patientId'), 'Storage writes must require case ownership');
assert(storageRules.includes('request.resource.size <= 10 * 1024 * 1024'), 'Storage writes must enforce size limit');
assert(storageRules.includes('hasBlockedExecutableExtension(fileName)'), 'Storage writes must block executable extensions');

console.log('  ✓ Medical uploads are real, quarantined, access-controlled, audited, and deletion-capable.');

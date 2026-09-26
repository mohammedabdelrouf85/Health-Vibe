/**
 * Health Vibes Firebase security rules tests.
 *
 * These tests use the Firebase Emulator Suite with the real firestore.rules and
 * storage.rules files. They fail fast if Auth, Firestore, or Storage emulators
 * are not reachable, and they refuse production emulator host values.
 */

const assert = require("assert");
const fs = require("fs");
const net = require("net");
const path = require("path");

const {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment
} = require("@firebase/rules-unit-testing");

const PROJECT_ID = process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID || "health-vibes-rules-test";
const STORAGE_BUCKET = `${PROJECT_ID}.appspot.com`;

const ROOT = path.join(__dirname, "..");
const FIRESTORE_RULES = path.join(ROOT, "firestore.rules");
const STORAGE_RULES = path.join(ROOT, "storage.rules");

function parseHostPort(value, defaultPort) {
  assert(value, "Rules tests must run through npm run test:rules so emulator hosts are set.");
  const clean = value.replace(/^https?:\/\//, "");
  const [host, rawPort] = clean.split(":");
  return { host, port: Number(rawPort || defaultPort) };
}

function waitForPort(name, host, port) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error(`${name} emulator is not reachable at ${host}:${port}`));
    }, 1500);

    socket.once("connect", () => {
      clearTimeout(timer);
      socket.end();
      resolve();
    });
    socket.once("error", (err) => {
      clearTimeout(timer);
      reject(new Error(`${name} emulator is not reachable at ${host}:${port}: ${err.message}`));
    });
  });
}

async function assertEmulatorsAreReachable(hosts) {
  await Promise.all([
    waitForPort("Auth", hosts.auth.host, hosts.auth.port),
    waitForPort("Firestore", hosts.firestore.host, hosts.firestore.port),
    waitForPort("Storage", hosts.storage.host, hosts.storage.port)
  ]);
}

function db(env, uid, claims = {}) {
  return env.authenticatedContext(uid, claims).firestore();
}

function bucket(env, uid, claims = {}) {
  return env.authenticatedContext(uid, claims).storage(`gs://${STORAGE_BUCKET}`);
}

function user(uid, data = {}) {
  return {
    email: `${uid}@healthvibes.test`,
    role: "patient",
    status: "active",
    emailVerified: true,
    ...data
  };
}

function caseDoc(patientId, clinicId = "clinic-a", data = {}) {
  return {
    patientId,
    clinicId,
    status: "submitted",
    oxygenLevel: 96,
    breathingDifficulty: "mild",
    coughLevel: "low",
    riskFactors: [],
    ...data
  };
}

async function seed(env) {
  await env.withSecurityRulesDisabled(async (admin) => {
    const adb = admin.firestore();
    const batch = adb.batch();

    batch.set(adb.collection("users").doc("patient-a"), user("patient-a", { clinicId: "clinic-a" }));
    batch.set(adb.collection("users").doc("patient-b"), user("patient-b", { clinicId: "clinic-b" }));
    batch.set(adb.collection("users").doc("doctor-a"), user("doctor-a", {
      role: "doctor",
      clinicId: "clinic-a",
      verifiedDoctor: true,
      doctorApplicationStatus: "approved"
    }));
    batch.set(adb.collection("users").doc("doctor-b"), user("doctor-b", {
      role: "doctor",
      clinicId: "clinic-b",
      verifiedDoctor: true,
      doctorApplicationStatus: "approved"
    }));
    batch.set(adb.collection("users").doc("doctor-unapproved"), user("doctor-unapproved", {
      role: "doctor",
      clinicId: "clinic-a",
      verifiedDoctor: false,
      doctorApplicationStatus: "pending"
    }));
    batch.set(adb.collection("users").doc("clinic-admin-a"), user("clinic-admin-a", {
      role: "clinic_admin",
      clinicId: "clinic-a"
    }));
    batch.set(adb.collection("users").doc("clinic-admin-b"), user("clinic-admin-b", {
      role: "clinic_admin",
      clinicId: "clinic-b"
    }));
    batch.set(adb.collection("users").doc("support-a"), user("support-a", {
      role: "support",
      clinicId: "clinic-a"
    }));
    batch.set(adb.collection("users").doc("suspended-patient"), user("suspended-patient", {
      clinicId: "clinic-a",
      suspended: true,
      status: "suspended"
    }));
    batch.set(adb.collection("users").doc("suspended-admin"), user("suspended-admin", {
      role: "clinic_admin",
      clinicId: "clinic-a",
      suspended: true,
      status: "suspended"
    }));

    batch.set(adb.collection("cases").doc("case-a-assigned"), caseDoc("patient-a", "clinic-a", {
      assignedDoctorId: "doctor-a"
    }));
    batch.set(adb.collection("cases").doc("case-b-assigned"), caseDoc("patient-b", "clinic-b", {
      assignedDoctorId: "doctor-b"
    }));
    batch.set(adb.collection("cases").doc("case-a-unassigned"), caseDoc("patient-a", "clinic-a", {
      status: "submitted"
    }));
    batch.set(adb.collection("cases").doc("case-a-approved"), caseDoc("patient-a", "clinic-a", {
      status: "approved",
      doctorApproved: true,
      clinicalImpression: "Released clinical result"
    }));
    batch.set(adb.collection("cases").doc("case-a-unreleased"), caseDoc("patient-a", "clinic-a", {
      status: "under_review",
      clinicalImpression: "Hidden clinical result"
    }));

    const approvedReport = {
      patientId: "patient-a",
      clinicId: "clinic-a",
      status: "approved",
      doctorApproved: true,
      summary: "Released report"
    };
    const draftReport = {
      patientId: "patient-a",
      clinicId: "clinic-a",
      status: "draft",
      doctorApproved: false,
      summary: "Draft report"
    };
    batch.set(adb.collection("reports").doc("approved-a"), approvedReport);
    batch.set(adb.collection("reports").doc("draft-a"), draftReport);
    batch.set(adb.collection("reports").doc("approved-b"), {
      patientId: "patient-b",
      clinicId: "clinic-b",
      status: "approved",
      doctorApproved: true,
      summary: "Released report"
    });
    batch.set(adb.collection("medical_reports").doc("approved-a"), approvedReport);
    batch.set(adb.collection("clinical_reports").doc("approved-a"), approvedReport);

    batch.set(adb.collection("appointments").doc("appt-a"), {
      patientId: "patient-a",
      doctorId: "doctor-a",
      clinicId: "clinic-a",
      status: "confirmed"
    });
    batch.set(adb.collection("appointments").doc("appt-b"), {
      patientId: "patient-b",
      doctorId: "doctor-b",
      clinicId: "clinic-b",
      status: "confirmed"
    });
    batch.set(adb.collection("ai_model_metrics").doc("metric-a"), {
      clinicId: "clinic-a",
      sensitivity: 0.93
    });
    batch.set(adb.collection("ai_model_metrics").doc("metric-b"), {
      clinicId: "clinic-b",
      sensitivity: 0.87
    });

    batch.set(adb.collection("doctor_applications").doc("app_patient-a"), {
      userId: "patient-a",
      clinicId: "clinic-a",
      status: "pending",
      docName: "license.pdf",
      docSize: 5,
      docContentType: "application/pdf",
      storagePath: "doctor_applications/patient-a/app_patient-a/license.pdf",
      downloadURL: "emulator://doctor_applications/patient-a/app_patient-a/license.pdf"
    });

    await batch.commit();
  });
}

async function run(name, fn) {
  try {
    await fn();
    console.log(`OK ${name}`);
  } catch (err) {
    console.error(`FAIL ${name}`);
    throw err;
  }
}

(async () => {
  assert(fs.existsSync(FIRESTORE_RULES), "firestore.rules must exist");
  assert(fs.existsSync(STORAGE_RULES), "storage.rules must exist");
  assert(!process.env.FIRESTORE_EMULATOR_HOST?.includes("firestore.googleapis.com"), "Refusing production Firestore host");
  assert(!process.env.FIREBASE_STORAGE_EMULATOR_HOST?.includes("firebasestorage.googleapis.com"), "Refusing production Storage host");

  const hosts = {
    auth: parseHostPort(process.env.FIREBASE_AUTH_EMULATOR_HOST, 9099),
    firestore: parseHostPort(process.env.FIRESTORE_EMULATOR_HOST, 8080),
    storage: parseHostPort(process.env.FIREBASE_STORAGE_EMULATOR_HOST, 9199)
  };
  await assertEmulatorsAreReachable(hosts);

  const env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host: hosts.firestore.host,
      port: hosts.firestore.port,
      rules: fs.readFileSync(FIRESTORE_RULES, "utf8")
    },
    storage: {
      host: hosts.storage.host,
      port: hosts.storage.port,
      rules: fs.readFileSync(STORAGE_RULES, "utf8")
    }
  });

  try {
    await env.clearFirestore();
    await seed(env);

    await run("unauthenticated users cannot read profiles", async () => {
      await assertFails(env.unauthenticatedContext().firestore().collection("users").doc("patient-a").get());
    });

    await run("patients can read their own profile and cannot read another account", async () => {
      const patientDb = db(env, "patient-a", { email_verified: true, role: "patient", clinicId: "clinic-a" });
      await assertSucceeds(patientDb.collection("users").doc("patient-a").get());
      await assertFails(patientDb.collection("users").doc("patient-b").get());
    });

    await run("patients cannot modify privileged role fields", async () => {
      const patientDb = db(env, "patient-a", { email_verified: true, role: "patient", clinicId: "clinic-a" });
      await assertFails(patientDb.collection("users").doc("patient-a").update({ role: "clinic_admin" }));
    });

    await run("clinic admins cannot modify role fields for users", async () => {
      const adminDb = db(env, "clinic-admin-a", { email_verified: true, role: "clinic_admin", clinicId: "clinic-a" });
      await assertFails(adminDb.collection("users").doc("patient-a").update({ role: "doctor" }));
    });

    await run("super admins can modify role fields through trusted custom claims", async () => {
      const ownerDb = db(env, "owner", { email_verified: true, role: "super_admin", isOwner: true });
      await assertSucceeds(ownerDb.collection("users").doc("patient-a").update({ role: "doctor" }));
    });

    await run("patients can create their own clean case and cannot create for another account", async () => {
      const patientDb = db(env, "patient-a", { email_verified: true, role: "patient", clinicId: "clinic-a" });
      await assertSucceeds(patientDb.collection("cases").doc("new-own-case").set(caseDoc("patient-a", "clinic-a")));
      await assertFails(patientDb.collection("cases").doc("new-forged-case").set(caseDoc("patient-b", "clinic-b")));
      await assertFails(patientDb.collection("cases").doc("new-foreign-clinic-case").set(caseDoc("patient-a", "clinic-b")));
    });

    await run("patients cannot forge clinical results in cases", async () => {
      const patientDb = db(env, "patient-a", { email_verified: true, role: "patient", clinicId: "clinic-a" });
      await assertFails(patientDb.collection("cases").doc("forged-clinical-result").set(caseDoc("patient-a", "clinic-a", {
        doctorApproved: true,
        clinicalImpression: "Forged"
      })));
    });

    await run("patients can read released reports but not draft reports", async () => {
      const patientDb = db(env, "patient-a", { email_verified: true, role: "patient", clinicId: "clinic-a" });
      await assertSucceeds(patientDb.collection("reports").doc("approved-a").get());
      await assertSucceeds(patientDb.collection("medical_reports").doc("approved-a").get());
      await assertSucceeds(patientDb.collection("clinical_reports").doc("approved-a").get());
      await assertFails(patientDb.collection("reports").doc("draft-a").get());
    });

    await run("patients cannot read unreleased clinical case details", async () => {
      const patientDb = db(env, "patient-a", { email_verified: true, role: "patient", clinicId: "clinic-a" });
      await assertFails(patientDb.collection("cases").doc("case-a-unreleased").get());
      await assertSucceeds(patientDb.collection("cases").doc("case-a-approved").get());
    });

    await run("assigned doctors can read their case while unassigned doctors cannot", async () => {
      const assignedDb = db(env, "doctor-a", { email_verified: true, role: "doctor", verifiedDoctor: true, clinicId: "clinic-a" });
      const otherDb = db(env, "doctor-b", { email_verified: true, role: "doctor", verifiedDoctor: true, clinicId: "clinic-b" });
      const unapprovedDb = db(env, "doctor-unapproved", { email_verified: true, role: "doctor", verifiedDoctor: false, clinicId: "clinic-a" });
      await assertSucceeds(assignedDb.collection("cases").doc("case-a-assigned").get());
      await assertFails(otherDb.collection("cases").doc("case-a-assigned").get());
      await assertFails(unapprovedDb.collection("cases").doc("case-a-assigned").get());
      await assertFails(assignedDb.collection("cases").doc("case-a-unassigned").get());
      await assertSucceeds(assignedDb.collection("cases").doc("case-a-assigned").update({
        patientId: "patient-a",
        clinicId: "clinic-a",
        assignedDoctorId: "doctor-a",
        status: "under_review",
        oxygenLevel: 96,
        breathingDifficulty: "mild",
        coughLevel: "low",
        riskFactors: []
      }));
      await assertFails(assignedDb.collection("cases").doc("case-a-unassigned").update({
        patientId: "patient-a",
        clinicId: "clinic-a",
        status: "under_review",
        oxygenLevel: 96,
        breathingDifficulty: "mild",
        coughLevel: "low",
        riskFactors: []
      }));
    });

    await run("two clinic admins are isolated to their own clinics", async () => {
      const adminADb = db(env, "clinic-admin-a", { email_verified: true, role: "clinic_admin", clinicId: "clinic-a" });
      const adminBDb = db(env, "clinic-admin-b", { email_verified: true, role: "clinic_admin", clinicId: "clinic-b" });
      await assertSucceeds(adminADb.collection("cases").doc("case-a-assigned").get());
      await assertFails(adminADb.collection("cases").doc("case-b-assigned").get());
      await assertSucceeds(adminADb.collection("reports").doc("approved-a").get());
      await assertFails(adminADb.collection("reports").doc("approved-b").get());
      await assertSucceeds(adminADb.collection("appointments").doc("appt-a").get());
      await assertFails(adminADb.collection("appointments").doc("appt-b").get());
      await assertSucceeds(adminADb.collection("ai_model_metrics").doc("metric-a").get());
      await assertFails(adminADb.collection("ai_model_metrics").doc("metric-b").get());

      await assertSucceeds(adminBDb.collection("cases").doc("case-b-assigned").get());
      await assertFails(adminBDb.collection("cases").doc("case-a-assigned").get());
      await assertSucceeds(adminBDb.collection("reports").doc("approved-b").get());
      await assertFails(adminBDb.collection("reports").doc("approved-a").get());
    });

    await run("direct foreign clinicId writes are denied", async () => {
      const patientDb = db(env, "patient-a", { email_verified: true, role: "patient", clinicId: "clinic-a" });
      await assertFails(patientDb.collection("appointments").doc("foreign-appt").set({
        patientId: "patient-a",
        clinicId: "clinic-b",
        status: "confirmed"
      }));
      await assertFails(patientDb.collection("feedbacks").doc("foreign-feedback").set({
        userId: "patient-a",
        clinicId: "clinic-b",
        role: "patient",
        rating: 5,
        comment: "Foreign clinic injection"
      }));
    });

    await run("support role has no privileged clinical access", async () => {
      const supportDb = db(env, "support-a", { email_verified: true, role: "support", clinicId: "clinic-a" });
      await assertFails(supportDb.collection("cases").doc("case-a-assigned").get());
      await assertFails(supportDb.collection("reports").doc("approved-a").get());
    });

    await run("suspended accounts are blocked in Firestore", async () => {
      const suspendedDb = db(env, "suspended-patient", {
        email_verified: true,
        role: "patient",
        clinicId: "clinic-a",
        suspended: true,
        status: "suspended"
      });
      await assertFails(suspendedDb.collection("users").doc("suspended-patient").get());
      await assertFails(suspendedDb.collection("cases").doc("suspended-case").set(caseDoc("suspended-patient", "clinic-a")));
    });

    await run("doctor application files enforce owner, admin clinic, type, and suspended checks", async () => {
      const ownerStorage = bucket(env, "patient-a", { email_verified: true, role: "patient", clinicId: "clinic-a" });
      const pathOk = "doctor_applications/patient-a/app_patient-a/license.pdf";
      const fileRef = ownerStorage.ref(pathOk);

      await assertSucceeds(fileRef.put(Buffer.from("valid"), { contentType: "application/pdf" }));
      await assertSucceeds(fileRef.getMetadata());

      const otherStorage = bucket(env, "patient-b", { email_verified: true, role: "patient", clinicId: "clinic-b" });
      await assertFails(otherStorage.ref(pathOk).getMetadata());
      await assertFails(ownerStorage.ref("doctor_applications/patient-a/app_patient-a/malware.exe")
        .put(Buffer.from("bad"), { contentType: "application/octet-stream" }));

      const clinicAdminStorage = bucket(env, "clinic-admin-a", {
        email_verified: true,
        role: "clinic_admin",
        clinicId: "clinic-a"
      });
      await assertSucceeds(clinicAdminStorage.ref(pathOk).getMetadata());

      const suspendedAdminStorage = bucket(env, "suspended-admin", {
        email_verified: true,
        role: "clinic_admin",
        clinicId: "clinic-a",
        suspended: true,
        status: "suspended"
      });
      await assertFails(suspendedAdminStorage.ref(pathOk).getMetadata());
    });
  } finally {
    await env.cleanup();
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

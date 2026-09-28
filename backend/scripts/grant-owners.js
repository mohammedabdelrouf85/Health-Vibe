/**
 * Health Vibe AI - Grant Owner & Supreme Verification Script
 * 
 * Target Accounts:
 * 1. mennamahmoudtawfik281@gmail.com
 * 2. mohammedabdelrouf85@gmail.com
 * 3. sondoselbehery287@gmail.com
 * 4. badr46694@gmail.com
 * 
 * Privileges granted:
 * - role: 'super_admin'
 * - isOwner: true
 * - verifiedDoctor: true
 * - doctorVerified: true
 * - emailVerified: true (Firebase Auth + Firestore)
 * - isVerified: true
 * - accountStatus: 'active'
 * - suspended: false, disabled: false
 */

const path = require('path');
const fs = require('fs');
const admin = require('firebase-admin');
const dotenv = require('dotenv');

const NODE_ENV = (process.env.NODE_ENV || 'development').trim().toLowerCase();

// Load environment variables
const candidateEnvFiles = [
  path.resolve(__dirname, `../.env.${NODE_ENV}.local`),
  path.resolve(__dirname, `../.env.${NODE_ENV}`),
  path.resolve(__dirname, '../.env.local'),
  path.resolve(__dirname, '../.env')
];

for (const envFile of candidateEnvFiles) {
  if (fs.existsSync(envFile)) {
    dotenv.config({ path: envFile, override: false });
  }
}
dotenv.config();

const TARGET_OWNERS = [
  'mennamahmoudtawfik281@gmail.com',
  'mohammedabdelrouf85@gmail.com',
  'sondoselbehery287@gmail.com',
  'badr46694@gmail.com'
];

async function initializeFirebaseAdmin() {
  if (!admin.apps.length) {
    const projectId = process.env.FIREBASE_PROJECT_ID || 'health-vibes-dev';
    admin.initializeApp({ projectId });
    console.log(`[FIREBASE ADMIN] Initialized for project '${projectId}' in '${NODE_ENV}' mode.`);
  }
  return {
    auth: admin.auth(),
    db: admin.firestore()
  };
}

async function grantOwnerToAccount(auth, db, email) {
  const normalizedEmail = email.trim().toLowerCase();
  console.log(`\n==================================================`);
  console.log(`👑 Processing Owner Account: ${normalizedEmail}`);
  console.log(`==================================================`);

  let userRecord;
  try {
    userRecord = await auth.getUserByEmail(normalizedEmail);
    console.log(`  ✓ Found existing Firebase Auth account for ${normalizedEmail} (UID: ${userRecord.uid})`);
  } catch (err) {
    if (err.code === 'auth/user-not-found') {
      console.log(`  ℹ User not found in Firebase Auth. Creating verified account...`);
      try {
        userRecord = await auth.createUser({
          email: normalizedEmail,
          emailVerified: true,
          displayName: normalizedEmail.split('@')[0]
        });
        console.log(`  ✓ Successfully created Auth account for ${normalizedEmail} (UID: ${userRecord.uid})`);
      } catch (createErr) {
        console.error(`  ❌ Failed to create user in Firebase Auth:`, createErr.message);
        throw createErr;
      }
    } else {
      console.error(`  ❌ Error querying Firebase Auth:`, err.message);
      throw err;
    }
  }

  const uid = userRecord.uid;

  // 1. Force Email Verification in Firebase Auth
  try {
    await auth.updateUser(uid, {
      emailVerified: true
    });
    console.log(`  ✓ Firebase Auth emailVerified forced to TRUE`);
  } catch (e) {
    console.warn(`  ⚠️ Could not update emailVerified in Auth:`, e.message);
  }

  // 2. Set Supreme Cryptographic Custom Claims on Firebase Auth
  const customClaims = {
    role: 'super_admin',
    isOwner: true,
    verifiedDoctor: true,
    doctorVerified: true,
    email_verified: true,
    clinicId: null
  };

  try {
    await auth.setCustomUserClaims(uid, customClaims);
    console.log(`  ✓ Set Firebase Auth Custom Claims:`, JSON.stringify(customClaims));
  } catch (claimErr) {
    console.error(`  ❌ Failed to set Custom Claims:`, claimErr.message);
    throw claimErr;
  }

  // 3. Upsert Firestore User Document at users/{uid}
  if (db) {
    try {
      const userRef = db.collection('users').doc(uid);
      const userDocData = {
        email: normalizedEmail,
        name: userRecord.displayName || normalizedEmail.split('@')[0],
        role: 'super_admin',
        isOwner: true,
        verifiedDoctor: true,
        doctorVerified: true,
        emailVerified: true,
        isVerified: true,
        accountStatus: 'active',
        status: 'active',
        suspended: false,
        isSuspended: false,
        disabled: false,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        grantedAt: new Date().toISOString(),
        grantedRole: 'super_admin'
      };

      await userRef.set(userDocData, { merge: true });
      console.log(`  ✓ Upserted Firestore document: users/${uid}`);

      // Also check if any other document exists with matching email
      const emailSnap = await db.collection('users').where('email', '==', normalizedEmail).get();
      for (const doc of emailSnap.docs) {
        if (doc.id !== uid) {
          await doc.ref.set(userDocData, { merge: true });
          console.log(`  ✓ Synchronized alternate document for email: users/${doc.id}`);
        }
      }

      // Record immutable audit event
      await db.collection('audit_events').add({
        type: 'OWNER_PRIVILEGES_GRANTED',
        targetUserId: uid,
        targetEmail: normalizedEmail,
        grantedRole: 'super_admin',
        isOwner: true,
        verified: true,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      }).catch(() => {});

      console.log(`  ✓ Recorded OWNER_PRIVILEGES_GRANTED audit event`);
    } catch (dbErr) {
      console.error(`  ❌ Failed to update Firestore:`, dbErr.message);
      throw dbErr;
    }
  }

  console.log(`  🎉 ${normalizedEmail} successfully configured as Owner with ALL permissions and full verification!`);
  return { uid, email: normalizedEmail, success: true };
}

async function run() {
  console.log("\n==================================================================");
  console.log("🌟 HEALTH VIBE AI: OWNER PROVISIONING & FULL VERIFICATION TOOL");
  console.log("==================================================================");

  try {
    const { auth, db } = await initializeFirebaseAdmin();
    const results = [];

    for (const email of TARGET_OWNERS) {
      const res = await grantOwnerToAccount(auth, db, email);
      results.push(res);
    }

    console.log("\n==================================================================");
    console.log("🎉 ALL 4 ACCOUNTS SUCCESSFULLY PROVISIONED AS OWNERS & VERIFIED!");
    console.log("==================================================================");
    results.forEach(r => {
      console.log(` - ${r.email} (UID: ${r.uid}) -> [OWNER | SUPER_ADMIN | VERIFIED]`);
    });
    console.log("");
    process.exit(0);
  } catch (err) {
    console.error("\n❌ PROVISIONING SCRIPT FAILED:", err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  run();
}

module.exports = {
  TARGET_OWNERS,
  grantOwnerToAccount
};

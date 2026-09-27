const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const serverPath = path.resolve(__dirname, '../backend/server.js');
const backendRequire = createRequire(serverPath);
const roles = ['patient', 'doctor_pending', 'doctor', 'support', 'clinic_admin', 'super_admin'];
const data = new Map();
const tokens = {};
const accounts = new Map();
const effects = [];
for (const role of roles) {
  const claims = { uid: role, role, email: role + '@test.invalid', email_verified: true };
  tokens[role] = claims;
  accounts.set(role, { uid: role, email: claims.email, customClaims: { role } });
  data.set('users/' + role, { role, clinicId: 'a', verifiedDoctor: role === 'doctor', doctorApplicationStatus: role === 'doctor' ? 'approved' : 'pending' });
}
data.set('users/foreign', { role: 'doctor_pending', clinicId: 'b' });
data.set('doctor_applications/foreign-app', { userId: 'foreign', status: 'pending', clinicId: 'b' });
data.set('doctor_applications/pending-app', { userId: 'doctor_pending', status: 'pending', clinicId: 'a' });
data.set('doctor_applications/doctor-app', { userId: 'doctor', status: 'approved', clinicId: 'a', name: 'Approved Doctor', licenseNumber: '123' });
data.set('cases/private', { patientId: 'patient', clinicId: 'a', status: 'approved', doctorApproved: true, clinicalDiagnosis: 'SECRET', assignedDoctorId: 'doctor' });
data.set('cases/legacy-support', { patientId: 'support', clinicId: 'a', status: 'approved', doctorApproved: true });
accounts.set('foreign', { email: 'foreign@test.invalid', customClaims: { role: 'doctor_pending' } });
function snapshot(key) { return { id: key.split('/')[1], exists: data.has(key), data: () => data.get(key) }; }
function collection(name, filters = []) {
  return {
    doc: id => ({ get: async () => snapshot(name + '/' + id),
      set: async value => { effects.push(['set', name, id]); data.set(name + '/' + id, { ...data.get(name + '/' + id), ...value }); },
      update: async value => { effects.push(['update', name, id]); data.set(name + '/' + id, { ...data.get(name + '/' + id), ...value }); } }),
    add: async value => { data.set(name + '/' + (data.size + 1), value); },
    where: (key, op, value) => collection(name, [...filters, [key, value]]),
    get: async () => { const docs = [...data.keys()].filter(k => k.startsWith(name + '/')).map(snapshot).filter(d => filters.every(([k,v]) => d.data()[k] === v)); return { docs, empty: !docs.length, forEach: fn => docs.forEach(fn) }; }
  };
}
const firestore = () => ({ collection });
firestore.FieldValue = { serverTimestamp: () => 'server-time', arrayUnion: value => [value] };
const firebase = { apps: [{}], firestore, auth: () => ({
  verifyIdToken: async (token, checkRevoked) => { assert.equal(checkRevoked, true); if (!tokens[token]) throw Error('invalid'); return { ...tokens[token] }; },
  getUser: async uid => accounts.get(uid),
  setCustomUserClaims: async (uid, claims) => { effects.push(['claims',uid]); accounts.get(uid).customClaims = { ...claims }; },
  updateUser: async (uid, value) => { effects.push(['auth',uid]); Object.assign(accounts.get(uid), value); },
  revokeRefreshTokens: async uid => effects.push(['revoke',uid])
}) };
const context = { require: n => n === 'firebase-admin' ? firebase : n === 'dotenv' ? { config() {} } : ['./backup-service','./whatsapp-bot'].includes(n) ? {} : backendRequire(n),
  module: { exports: {} }, __dirname: path.dirname(serverPath), Buffer, setTimeout, clearTimeout,
  console: { log() {}, info() {}, warn() {}, error() {} },
  process: { env: { NODE_ENV: 'development', FIREBASE_PROJECT_ID: 'health-vibes-dev', EXPECTED_FIREBASE_PROJECT_ID: 'health-vibes-dev', USE_FIREBASE_EMULATOR: 'true', FIRESTORE_EMULATOR_HOST: 'localhost:8080', FIREBASE_AUTH_EMULATOR_HOST: 'localhost:9099', FIREBASE_STORAGE_EMULATOR_HOST: 'localhost:9199' }, on() {}, uptime: () => 1 }
};
vm.runInNewContext(fs.readFileSync(serverPath,'utf8'),context,{filename:serverPath});
(async () => {
 const server = context.module.exports.listen(0,'127.0.0.1'); await new Promise(r=>server.once('listening',r));
 let count=0;
 async function request(role, route, body, method='POST') {
  count++;
  const res=await fetch(`http://127.0.0.1:${server.address().port}${route}`,{method,headers:{Authorization:`Bearer ${role}`,'Content-Type':'application/json'},...(method==='GET'?{}:{body:JSON.stringify(body || {})})});
  return {status:res.status,body:await res.json()};
 }
 try {
  for(const role of roles.filter(r=>r!=='super_admin')) {
   const before=effects.length;
   assert.equal((await request(role,'/api/admin/set-user-role',{targetUserId:'patient',newRole:'super_admin',isOwner:true,role:'super_admin'})).status,403,role);
   assert.equal(effects.length,before);
  }
  for(const role of ['patient','doctor_pending','support','doctor']) {
   for(const route of ['toggle-user-suspension','approve-doctor-application','reject-doctor-application','set-user-verification']) {
    const before=effects.length;
    assert.equal((await request(role,'/api/admin/'+route,{targetUserId:'foreign',suspend:true,verified:true,applicationId:'foreign-app',applicantUserId:'foreign'})).status,403,role+route);
    assert.equal(effects.length,before);
   }
  }
  for(const route of ['toggle-user-suspension','approve-doctor-application','reject-doctor-application','set-user-verification']) {
   const before=effects.length;
   assert.equal((await request('clinic_admin','/api/admin/'+route,{targetUserId:'foreign',suspend:true,verified:true,applicationId:'foreign-app',applicantUserId:'foreign',clinicId:'a'})).status,403,route);
   assert.equal(effects.length,before);
  }
  for(const role of roles.filter(r=>r!=='doctor')) assert.equal((await request(role,'/api/doctor/verified-profile',null,'GET')).status,403,role+' clinical credentials');
  assert.equal((await request('doctor','/api/doctor/verified-profile',null,'GET')).status,200);
  const support = await request('support','/api/kpi/metrics?clinicId=b&patientId=patient',null,'GET');
  assert.equal(support.status,200);assert.ok(!JSON.stringify(support).includes('SECRET'));
  assert.equal((await request('support','/api/reports/private/doctor-identity',null,'GET')).status,403);
  assert.equal((await request('support','/api/reports/legacy-support/doctor-identity',null,'GET')).status,403);
  assert.equal((await request('super_admin','/api/admin/set-user-role',{targetUserId:'super_admin',newRole:'patient'})).status,403);
  assert.equal((await request('super_admin','/api/admin/set-user-role',{targetUserId:'patient',newRole:'doctor'})).status,403);
  const old = {...tokens.clinic_admin};
  accounts.get('clinic_admin').customClaims.retainedFlag = true;
  assert.equal((await request('super_admin','/api/admin/set-user-role',{targetUserId:'clinic_admin',newRole:'support',clinicId:'b'})).status,200);
  assert.equal(accounts.get('clinic_admin').customClaims.retainedFlag,true);
  assert.equal((await request('clinic_admin','/api/kpi/metrics',null,'GET')).status,403,'old token must immediately fail');
  tokens.clinic_admin = {...old,...accounts.get('clinic_admin').customClaims};
  assert.equal((await request('clinic_admin','/api/kpi/metrics',null,'GET')).status,200);
  assert.equal((await request('clinic_admin','/api/admin/toggle-user-suspension',{targetUserId:'foreign',suspend:true})).status,403);
  assert.ok([...data.values()].some(d=>d.type==='ROLE_CHANGE_REQUESTED'&&d.actorId==='super_admin'&&d.oldRole==='clinic_admin'));
  assert.ok([...data.values()].some(d=>d.type==='SERVER_ROLE_CHANGE'&&d.newRole==='support'));
  // Execute real guard functions with all direct screen targets, not source-string assertions.
  const client=fs.readFileSync(path.resolve(__dirname,'../app/app.js'),'utf8');
  const c={console:{warn(){},debug(){}},window:{_isUserVerified:true},auth:{currentUser:{uid:'test'}},selectedRole:'patient',currentLanguage:'en',isOwnerUser:()=>false,getActiveUser:()=>({uid:'test'}),hasAcceptedPrivacyConsent:()=>true};
  vm.createContext(c);
  vm.runInContext(client.slice(client.indexOf('const ROLES ='),client.indexOf('let verifiedServerRole')),c);
  vm.runInContext(client.slice(client.indexOf('function hasPermission('),client.indexOf('// Client-side quick check')),c);
  const expected={patient:['assessment','report','history'],doctor_pending:['verification','report'],doctor:['doctor','report','kpi'],support:['profile','kpi'],clinic_admin:['admin','doctor','audit','kpi'],super_admin:['admin','audit','kpi']};
  for(const role of roles) {
   c.selectedRole=role;
   for(const screen of ['patient','profile','assessment','doctor','admin','audit','report','kpi','unknown']) {
    const allowed=vm.runInContext(`ROLE_ALLOWED_SCREENS[selectedRole].includes('${screen}')`,c);
    assert.equal(c.canAccessScreen(screen),allowed,role+':'+screen);
    assert.equal(c.applyRouteGuards(screen),allowed?screen:c.getRoleDefaultScreen(role),role+' direct link '+screen);
   }
   for(const screen of expected[role]) assert.equal(c.canAccessScreen(screen),true,role+screen);
   assert.equal(c.hasPermission('approve:case'),role==='doctor',role+' clinical approval');
   assert.equal(c.hasPermission('manage:user_roles'),role==='super_admin',role+' roles');
  }
  c.selectedRole='support';vm.runInContext('tempAllowDoctorApplication = true',c);assert.equal(c.canAccessScreen('verification'),false);
  console.log(`PASS: ${count} HTTP requests plus six-role direct-route and permission matrix.`);
 } finally { await new Promise(r=>server.close(r)); }
})().catch(e=>{console.error(e);process.exitCode=1});

/**
 * HEALTH VIBE AI: HTTPS & TLS 1.3 ENFORCEMENT SERVICE
 * 
 * Direct Implementation of PRD Page 10 (Security & Privacy) & User Request 36:
 * "فرض بروتوكول HTTPS / TLS 1.3 على كافة نطاقات وواجهات برمجة تطبيقات healthvibes.app
 *  ومنع أي اتصال غير مشفر."
 * 
 * Enforces:
 * 1. Strict transport security (HSTS with max-age=31536000, includeSubDomains, preload).
 * 2. Unconditional 301/308 upgrade from plaintext HTTP to HTTPS for all healthvibes.app domains.
 * 3. HTTP 426 Upgrade Required for insecure API mutating requests.
 * 4. Prohibition of legacy, vulnerable cipher suites and SSL/TLS downgrades (< TLS 1.3).
 * 5. Native Node.js TLS 1.3 server options (TLS_AES_256_GCM_SHA384, TLS_CHACHA20_POLY1305_SHA256, TLS_AES_128_GCM_SHA256).
 */

const crypto = require('crypto');

// Enforced Domains Scope
const ENFORCED_DOMAINS = Object.freeze([
  'healthvibes.app',
  'api.healthvibes.app',
  'app.healthvibes.app',
  'staging.healthvibes.app',
  'demo.healthvibes.app',
  'healthvibe.ai',
  'health-vibes-a4b3b.web.app',
  'health-vibes-a4b3b.firebaseapp.com'
]);

// Standard HSTS Header Parameter (1 year, all subdomains, preload list eligible)
const HSTS_POLICY_HEADER = 'max-age=31536000; includeSubDomains; preload';

// Authoritative TLS 1.3 Configuration
const TLS_13_SPEC = Object.freeze({
  minVersion: 'TLSv1.3',
  maxVersion: 'TLSv1.3',
  enforcedProtocol: 'TLSv1.3',
  approvedCiphers: [
    'TLS_AES_256_GCM_SHA384',
    'TLS_CHACHA20_POLY1305_SHA256',
    'TLS_AES_128_GCM_SHA256'
  ],
  deprecatedProtocolsProhibited: [
    'SSLv2',
    'SSLv3',
    'TLSv1',
    'TLSv1.0',
    'TLSv1.1',
    'TLSv1.2'
  ]
});

/**
 * Checks whether a given hostname is an enforced domain.
 */
function isEnforcedDomain(host) {
  if (!host || typeof host !== 'string') return false;
  const cleanHost = host.split(':')[0].toLowerCase().trim();

  // Check exact match or subdomain
  return ENFORCED_DOMAINS.some(domain => {
    return cleanHost === domain || cleanHost.endsWith(`.${domain}`);
  });
}

/**
 * Evaluates whether an incoming request is secure (HTTPS/TLS).
 */
function isRequestSecure(req) {
  if (!req) return false;

  // Direct socket encrypted flag
  if (req.secure === true) return true;

  // Reverse proxy / Cloud load balancer forward proto
  const proto = (req.headers && req.headers['x-forwarded-proto']) || '';
  if (proto.toLowerCase().includes('https')) return true;

  // Cloudflare / Google Cloud SSL indicators
  if (req.headers && (req.headers['x-forwarded-ssl'] === 'on' || req.headers['cf-visitor']?.includes('https'))) {
    return true;
  }

  return false;
}

/**
 * Evaluates whether the TLS version meets the TLS 1.3 standard.
 */
function verifyTlsVersion(req) {
  // Check headers forwarded by modern TLS terminating proxies (e.g. NGINX ssl_protocol, Cloudflare)
  const proxyTlsVersion = req.headers && (
    req.headers['x-tls-version'] ||
    req.headers['ssl-protocol'] ||
    req.headers['x-ssl-protocol']
  );

  if (proxyTlsVersion) {
    const v = String(proxyTlsVersion).trim().toLowerCase();
    const isTls13 = v === 'tlsv1.3' || v === 'tls 1.3' || v === 'tls1.3' || v === '1.3';
    if (!isTls13) {
      return {
        compliant: false,
        version: String(proxyTlsVersion).trim(),
        reason: `DEPRECATED_TLS_VERSION: ${proxyTlsVersion} is prohibited. TLS 1.3 is strictly enforced.`
      };
    }
  }

  // Direct Node.js TLS socket check if available
  if (req.socket && typeof req.socket.getProtocol === 'function') {
    const directProtocol = req.socket.getProtocol();
    if (directProtocol) {
      const v = String(directProtocol).trim().toLowerCase();
      const isTls13 = v === 'tlsv1.3' || v === 'tls 1.3' || v === 'tls1.3';
      if (!isTls13) {
        return {
          compliant: false,
          version: directProtocol,
          reason: `DEPRECATED_TLS_VERSION: Socket negotiated ${directProtocol}. TLS 1.3 is required.`
        };
      }
    }
  }

  return { compliant: true, version: 'TLSv1.3' };
}

/**
 * Express Middleware: Enforces HTTPS and TLS 1.3 on all healthvibes.app domains.
 */
function httpsAndTls13EnforcementMiddleware(req, res, next) {
  const host = (req.headers && req.headers.host) || '';
  const isEnforced = isEnforcedDomain(host);
  const isProduction = process.env.NODE_ENV === 'production';
  const isStaging = process.env.NODE_ENV === 'staging';

  // Apply HSTS header unconditionally on all responses for enforced hosts or secure requests
  if (isEnforced || isProduction || isStaging || isRequestSecure(req)) {
    res.setHeader('Strict-Transport-Security', HSTS_POLICY_HEADER);
    res.setHeader('X-TLS-Enforced-Version', TLS_13_SPEC.enforcedProtocol);
  }

  // Bypass localhost and 127.0.0.1 in development or unit tests unless forced
  const isLocal = host.includes('localhost') || host.includes('127.0.0.1');
  if (isLocal && !isEnforced && process.env.NODE_ENV !== 'production' && req.headers['x-test-enforce-https'] !== 'true') {
    return next();
  }

  // 1. Verify TLS Protocol Version
  const tlsCheck = verifyTlsVersion(req);
  if (!tlsCheck.compliant) {
    return res.status(426).json({
      error: 'TLS_13_REQUIRED',
      message: tlsCheck.reason,
      requiredProtocol: 'TLSv1.3',
      actionRequired: 'Upgrade client TLS library to TLS 1.3'
    });
  }

  // 2. Detect Insecure Plaintext HTTP
  const secure = isRequestSecure(req);
  if (!secure) {
    const targetHttpsUrl = `https://${host}${req.originalUrl || req.url}`;

    // For idempotent GET / HEAD browser navigations: 301 Permanent Redirect
    if (req.method === 'GET' || req.method === 'HEAD') {
      res.setHeader('Location', targetHttpsUrl);
      return res.redirect(301, targetHttpsUrl);
    }

    // For API requests (POST / PUT / DELETE) or JSON endpoints:
    // Reject plaintext HTTP with 426 Upgrade Required to prevent credential leakage over plain HTTP
    return res.status(426).json({
      error: 'HTTPS_REQUIRED',
      message: 'Insecure plaintext HTTP transmission prohibited. All healthvibes.app endpoints strictly require HTTPS with TLS 1.3.',
      targetHttpsUrl,
      enforcedSecurityPolicy: {
        hsts: HSTS_POLICY_HEADER,
        tls: TLS_13_SPEC.enforcedProtocol
      }
    });
  }

  next();
}

/**
 * Returns hardened Node.js HTTPS server options configured for TLS 1.3.
 */
function getSecureTls13ServerOptions(extraOptions = {}) {
  return {
    minVersion: TLS_13_SPEC.minVersion,
    maxVersion: TLS_13_SPEC.maxVersion,
    ciphers: TLS_13_SPEC.approvedCiphers.join(':'),
    honorCipherOrder: true,
    secureOptions: crypto.constants.SSL_OP_NO_SSLv2 |
                   crypto.constants.SSL_OP_NO_SSLv3 |
                   crypto.constants.SSL_OP_NO_TLSv1 |
                   crypto.constants.SSL_OP_NO_TLSv1_1 |
                   crypto.constants.SSL_OP_NO_TLSv1_2,
    ...extraOptions
  };
}

module.exports = {
  ENFORCED_DOMAINS,
  HSTS_POLICY_HEADER,
  TLS_13_SPEC,
  isEnforcedDomain,
  isRequestSecure,
  verifyTlsVersion,
  httpsAndTls13EnforcementMiddleware,
  getSecureTls13ServerOptions
};

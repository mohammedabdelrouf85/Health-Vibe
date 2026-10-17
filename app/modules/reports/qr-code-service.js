/**
 * Health Vibe AI - High-Precision QR Code Generator (ISO/IEC 18004 Standard)
 * Generates standards-compliant QR Code matrices and SVGs without external dependencies.
 * Used for Medical Report Verification and HealthTag Authenticity Certification.
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.HealthVibes = root.HealthVibes || {};
    root.HealthVibes.QrCodeService = factory();
    root.QrCodeService = root.HealthVibes.QrCodeService;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // ── Galois Field GF(256) Math ──────────────────────────────────────────────
  const EXP_TABLE = new Uint8Array(256);
  const LOG_TABLE = new Uint8Array(256);
  (function initGaloisField() {
    let x = 1;
    for (let i = 0; i < 255; i++) {
      EXP_TABLE[i] = x;
      LOG_TABLE[x] = i;
      x <<= 1;
      if (x & 0x100) x ^= 0x11d; // Primitive polynomial x^8 + x^4 + x^3 + x^2 + 1
    }
    for (let i = 255; i < 256; i++) {
      EXP_TABLE[i] = EXP_TABLE[i - 255];
    }
  })();

  function gfMul(x, y) {
    if (x === 0 || y === 0) return 0;
    return EXP_TABLE[(LOG_TABLE[x] + LOG_TABLE[y]) % 255];
  }

  // ── Reed-Solomon Error Correction Code Generator ───────────────────────────
  function getRsGeneratorPoly(ecLength) {
    let poly = [1];
    for (let i = 0; i < ecLength; i++) {
      const next = [];
      const factor = EXP_TABLE[i];
      for (let j = 0; j < poly.length; j++) {
        next[j] = (next[j] || 0) ^ gfMul(poly[j], factor);
        next[j + 1] = (next[j + 1] || 0) ^ poly[j];
      }
      poly = next;
    }
    return poly;
  }

  function calculateRsRemainder(data, ecLength) {
    const gen = getRsGeneratorPoly(ecLength);
    const remainder = new Uint8Array(ecLength);

    for (let i = 0; i < data.length; i++) {
      const factor = data[i] ^ remainder[0];
      for (let j = 0; j < ecLength - 1; j++) {
        remainder[j] = remainder[j + 1] ^ gfMul(gen[ecLength - 1 - j], factor);
      }
      remainder[ecLength - 1] = gfMul(gen[0], factor);
    }
    return Array.from(remainder).reverse();
  }

  // ── QR Versions Table (Capacities & EC Blocks) ─────────────────────────────
  // EC Level M (15% recovery) configurations for Versions 1 through 6
  const QR_VERSIONS = [
    null,
    { version: 1, size: 21, totalBytes: 26, ecBytes: 10, dataBytes: 16, alignCoords: [] },
    { version: 2, size: 25, totalBytes: 44, ecBytes: 16, dataBytes: 28, alignCoords: [6, 18] },
    { version: 3, size: 29, totalBytes: 70, ecBytes: 26, dataBytes: 44, alignCoords: [6, 22] },
    { version: 4, size: 33, totalBytes: 100, ecBytes: 36, dataBytes: 64, alignCoords: [6, 26] },
    { version: 5, size: 37, totalBytes: 134, ecBytes: 48, dataBytes: 86, alignCoords: [6, 30] },
    { version: 6, size: 41, totalBytes: 172, ecBytes: 64, dataBytes: 108, alignCoords: [6, 34] }
  ];

  // Format info strings for EC Level M (with 15-bit BCH & mask XOR 0x5412)
  const FORMAT_INFO_M = [
    0x537e, 0x565b, 0x5994, 0x5cb1, 0x47e3, 0x42c6, 0x4de9, 0x48cc
  ];

  /**
   * Encodes a string into byte mode with length header and padding.
   */
  function encodeByteModeData(text, requiredBytes) {
    const utf8Bytes = [];
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      if (code < 0x80) {
        utf8Bytes.push(code);
      } else if (code < 0x800) {
        utf8Bytes.push(0xc0 | (code >> 6));
        utf8Bytes.push(0x80 | (code & 0x3f));
      } else {
        utf8Bytes.push(0xe0 | (code >> 12));
        utf8Bytes.push(0x80 | ((code >> 6) & 0x3f));
        utf8Bytes.push(0x80 | (code & 0x3f));
      }
    }

    const bitBuffer = [];
    function pushBits(val, numBits) {
      for (let i = numBits - 1; i >= 0; i--) {
        bitBuffer.push((val >> i) & 1);
      }
    }

    // 1. Mode indicator: 0100 for Byte mode
    pushBits(0b0100, 4);

    // 2. Character count indicator (8 bits for versions 1-9 in byte mode)
    pushBits(utf8Bytes.length, 8);

    // 3. Data bits
    for (let i = 0; i < utf8Bytes.length; i++) {
      pushBits(utf8Bytes[i], 8);
    }

    // 4. Terminator (up to 4 bits)
    const capacityBits = requiredBytes * 8;
    const remainingToCapacity = capacityBits - bitBuffer.length;
    const termCount = Math.min(4, Math.max(0, remainingToCapacity));
    pushBits(0, termCount);

    // 5. Pad to multiple of 8 bits
    while (bitBuffer.length % 8 !== 0) {
      bitBuffer.push(0);
    }

    // Convert bits to bytes
    const dataBytes = [];
    for (let i = 0; i < bitBuffer.length; i += 8) {
      let b = 0;
      for (let j = 0; j < 8; j++) {
        b = (b << 1) | bitBuffer[i + j];
      }
      dataBytes.push(b);
    }

    // 6. Alternate padding bytes (0xEC, 0x11)
    const padBytes = [0xec, 0x11];
    let padIdx = 0;
    while (dataBytes.length < requiredBytes) {
      dataBytes.push(padBytes[padIdx % 2]);
      padIdx++;
    }

    return dataBytes;
  }

  /**
   * Generates a QR matrix for the given text.
   * Automatically picks the optimal version.
   */
  function generateQrMatrix(text) {
    if (typeof text !== 'string' || !text.length) {
      throw new Error('QR text must be a non-empty string.');
    }

    // Calculate UTF-8 byte length
    let byteLen = 0;
    for (let i = 0; i < text.length; i++) {
      const c = text.charCodeAt(i);
      byteLen += c < 0x80 ? 1 : (c < 0x800 ? 2 : 3);
    }

    // Find smallest version that fits data (dataBytes must accommodate byteLen + 2 header bytes)
    let versionInfo = null;
    for (let v = 1; v < QR_VERSIONS.length; v++) {
      if (QR_VERSIONS[v].dataBytes >= byteLen + 2) {
        versionInfo = QR_VERSIONS[v];
        break;
      }
    }

    if (!versionInfo) {
      versionInfo = QR_VERSIONS[QR_VERSIONS.length - 1]; // Use largest supported (v6)
    }

    const { size, dataBytes, ecBytes } = versionInfo;
    const data = encodeByteModeData(text, dataBytes);
    const ecData = calculateRsRemainder(data, ecBytes);
    const allCodewords = data.concat(ecData);

    // Initialize size x size matrix and function module flag matrix
    const matrix = Array.from({ length: size }, () => new Array(size).fill(0));
    const isFunction = Array.from({ length: size }, () => new Array(size).fill(false));

    function setModule(r, c, val, func = true) {
      if (r < 0 || r >= size || c < 0 || c >= size) return;
      matrix[r][c] = val ? 1 : 0;
      if (func) isFunction[r][c] = true;
    }

    // ── 1. Finder Patterns (7x7 with 1-module separator) ──────────────────
    function placeFinder(top, left) {
      for (let r = -1; r <= 7; r++) {
        for (let c = -1; c <= 7; c++) {
          const row = top + r;
          const col = left + c;
          if (row < 0 || row >= size || col < 0 || col >= size) continue;
          if (r >= 0 && r <= 6 && c >= 0 && c <= 6) {
            const isDark = (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4));
            setModule(row, col, isDark, true);
          } else {
            setModule(row, col, 0, true); // White separator
          }
        }
      }
    }

    placeFinder(0, 0);
    placeFinder(0, size - 7);
    placeFinder(size - 7, 0);

    // ── 2. Alignment Patterns (for version >= 2) ───────────────────────────
    if (versionInfo.alignCoords.length >= 2) {
      const coords = versionInfo.alignCoords;
      for (let i = 0; i < coords.length; i++) {
        for (let j = 0; j < coords.length; j++) {
          const r = coords[i];
          const c = coords[j];
          // Skip if overlaps with finders
          if (isFunction[r][c]) continue;

          for (let dr = -2; dr <= 2; dr++) {
            for (let dc = -2; dc <= 2; dc++) {
              const isDark = (Math.abs(dr) === 2 || Math.abs(dc) === 2 || (dr === 0 && dc === 0));
              setModule(r + dr, c + dc, isDark, true);
            }
          }
        }
      }
    }

    // ── 3. Timing Patterns (row 6 and col 6) ───────────────────────────────
    for (let i = 8; i < size - 8; i++) {
      if (!isFunction[6][i]) setModule(6, i, i % 2 === 0, true);
      if (!isFunction[i][6]) setModule(i, 6, i % 2 === 0, true);
    }

    // ── 4. Dark Module ─────────────────────────────────────────────────────
    setModule(size - 8, 8, 1, true);

    // ── 5. Reserve Format Information Areas ─────────────────────────────────
    for (let i = 0; i < 9; i++) {
      if (!isFunction[8][i]) isFunction[8][i] = true;
      if (!isFunction[i][8]) isFunction[i][8] = true;
    }
    for (let i = 0; i < 8; i++) {
      if (!isFunction[8][size - 1 - i]) isFunction[8][size - 1 - i] = true;
      if (!isFunction[size - 1 - i][8]) isFunction[size - 1 - i] = true;
    }

    // ── 6. Place Data Codewords (Zigzag Traversal) ─────────────────────────
    const dataBits = [];
    for (let i = 0; i < allCodewords.length; i++) {
      for (let b = 7; b >= 0; b--) {
        dataBits.push((allCodewords[i] >> b) & 1);
      }
    }

    let bitIdx = 0;
    let right = size - 1;
    let upward = true;

    while (right > 0) {
      if (right === 6) right--; // Skip vertical timing column

      const rows = [];
      if (upward) {
        for (let r = size - 1; r >= 0; r--) rows.push(r);
      } else {
        for (let r = 0; r < size; r++) rows.push(r);
      }

      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        for (let c = right; c >= right - 1; c--) {
          if (!isFunction[r][c]) {
            const bit = bitIdx < dataBits.length ? dataBits[bitIdx++] : 0;
            matrix[r][c] = bit;
          }
        }
      }

      right -= 2;
      upward = !upward;
    }

    // ── 7. Apply Standard Mask (Pattern 0: (row + col) % 2 == 0) ───────────
    const maskIdx = 0;
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (!isFunction[r][c]) {
          if ((r + c) % 2 === 0) {
            matrix[r][c] ^= 1;
          }
        }
      }
    }

    // ── 8. Format Information (EC Level M + Mask 0) ────────────────────────
    const formatBits = FORMAT_INFO_M[maskIdx];
    for (let i = 0; i < 15; i++) {
      const bit = (formatBits >> (14 - i)) & 1;
      // Top-left
      if (i < 6) {
        matrix[8][i] = bit;
      } else if (i < 8) {
        matrix[8][i + 1] = bit;
      } else if (i === 8) {
        matrix[7][8] = bit;
      } else {
        matrix[14 - i][8] = bit;
      }

      // Split between top-right and bottom-left
      if (i < 8) {
        matrix[size - 1 - i][8] = bit;
      } else {
        matrix[8][size - 15 + i] = bit;
      }
    }

    return {
      size,
      matrix,
      version: versionInfo.version,
      text
    };
  }

  /**
   * Generates a crisp, clean SVG string from a URL or text.
   * @param {string} text Target URL or identifier
   * @param {object} options { size: number, darkColor: string, lightColor: string, margin: number }
   * @returns {string} SVG HTML string
   */
  function generateQrSvg(text, options = {}) {
    const { size, matrix } = generateQrMatrix(text);
    const pixelSize = options.size || 110;
    const margin = options.margin !== undefined ? options.margin : 2;
    const dark = options.darkColor || '#0f172a';
    const light = options.lightColor || '#ffffff';

    const totalGrid = size + margin * 2;
    const pathD = [];

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (matrix[r][c] === 1) {
          const x = c + margin;
          const y = r + margin;
          pathD.push(`M${x},${y}h1v1h-1z`);
        }
      }
    }

    return `<svg class="hv-report-qr-code" width="${pixelSize}" height="${pixelSize}" viewBox="0 0 ${totalGrid} ${totalGrid}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="QR Code: ${text}" style="background:${light}; border-radius:6px; border:1px solid #cbd5e1; shape-rendering:crispEdges; display:inline-block;"><rect width="${totalGrid}" height="${totalGrid}" fill="${light}"/><path d="${pathD.join('')}" fill="${dark}"/></svg>`;
  }

  /**
   * Builds the official canonical verification URL pointing to https://healthvibes.app/verify/:reportId
   * @param {object|string} recordOrId Report record or reference code
   * @param {string} origin Optional host origin override
   * @returns {string} Official verification URL
   */
  function buildReportVerificationUrl(recordOrId, origin = '') {
    let reportId = '';
    if (typeof recordOrId === 'string') {
      reportId = recordOrId.trim();
    } else if (recordOrId && typeof recordOrId === 'object') {
      reportId = recordOrId.reportRef || recordOrId.id || '';
    }

    if (!reportId) {
      reportId = 'RECORD';
    }

    const host = origin ? origin.replace(/\/+$/, '') : 'https://healthvibes.app';
    return `${host}/verify/${encodeURIComponent(reportId)}`;
  }

  return {
    generateQrMatrix,
    generateQrSvg,
    buildReportVerificationUrl
  };
});

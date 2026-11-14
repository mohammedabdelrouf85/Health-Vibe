"use strict";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = Object.freeze({
  ".pdf": { mimeType: "application/pdf", magic: (b) => b.subarray(0, 5).toString("ascii") === "%PDF-" },
  ".jpg": { mimeType: "image/jpeg", magic: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  ".jpeg": { mimeType: "image/jpeg", magic: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  ".png": { mimeType: "image/png", magic: (b) => b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) }
});

function inspectFileContent({ buffer, fileName, declaredMimeType, size = buffer?.length } = {}) {
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);
  const extension = require("path").extname(String(fileName || "")).toLowerCase();
  const type = ALLOWED_TYPES[extension];
  if (!Number.isFinite(Number(size)) || Number(size) <= 0 || Number(size) > MAX_FILE_SIZE_BYTES) {
    return { valid: false, error: "FILE_SIZE_NOT_ALLOWED", maxSizeBytes: MAX_FILE_SIZE_BYTES };
  }
  if (!type) return { valid: false, error: "FILE_EXTENSION_NOT_ALLOWED" };
  if (declaredMimeType !== type.mimeType) return { valid: false, error: "DECLARED_MIME_MISMATCH" };
  if (!type.magic(bytes)) return { valid: false, error: "FILE_SIGNATURE_MISMATCH" };
  return { valid: true, mimeType: type.mimeType, extension, size: Number(size) };
}

module.exports = { MAX_FILE_SIZE_BYTES, ALLOWED_TYPES, inspectFileContent };

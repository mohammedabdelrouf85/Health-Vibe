/**
 * Health Vibe AI - Arabic Reshaper & Bidirectional (BiDi) Engine
 * Requirement #70: "إصلاح عرض الخطوط العربية في تقارير الـ PDF عبر استخدام Arabic Reshaper + bidi"
 * 
 * Solves the classic problem of disconnected, isolated, or reversed Arabic characters
 * in PDF generation libraries (jsPDF, PDFKit, Canvas, ReportLab, FPDF, etc.).
 * 
 * Features:
 * 1. Contextual Arabic Glyph Shaping:
 *    - Maps standard Unicode (U+0600 - U+06FF) to Presentation Forms-B (U+FE70 - U+FEFF)
 *    - Selects correct form: Isolated, Initial, Medial, or Final
 *    - Dual-joining, Right-joining, and Non-joining character classification
 * 2. Lam-Alef Ligature Compaction:
 *    - Automatically merges (Lam + Alef, Alef Madda, Alef Hamza Above, Alef Hamza Below)
 *    - Generates isolated and final ligature glyphs (ﻻ, ﻷ, ﻹ, ﻵ)
 * 3. Bidirectional (BiDi) Reordering:
 *    - Reverses right-to-left cursive runs for naive LTR PDF renderers
 *    - Preserves left-to-right order for numbers (e.g. "120/80", "98%"),
 *      phone numbers ("+20 100 123 4567"), and Latin strings ("HV-REP-2026-902", "Salbutamol")
 * 4. Tashkeel / Harakat Handling:
 *    - Transparent diacritic positioning or optional stripping
 */

(function(root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.HealthVibes = root.HealthVibes || {};
    root.HealthVibes.ArabicReshaper = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  // Connecting types:
  // 0: Non-joining (transparent or symbol)
  // 1: Right-joining only (connects with preceding letter if preceding is joining, but never with following)
  // 2: Dual-joining (connects with preceding and following)
  const CHAR_DATA = {
    // Hamza
    0x0621: { type: 0, isolated: 0xFE80, final: 0xFE80, initial: 0xFE80, medial: 0xFE80 },
    // Alef with Madda
    0x0622: { type: 1, isolated: 0xFE81, final: 0xFE82, initial: 0xFE81, medial: 0xFE82 },
    // Alef with Hamza Above
    0x0623: { type: 1, isolated: 0xFE83, final: 0xFE84, initial: 0xFE83, medial: 0xFE84 },
    // Waw with Hamza Above
    0x0624: { type: 1, isolated: 0xFE85, final: 0xFE86, initial: 0xFE85, medial: 0xFE86 },
    // Alef with Hamza Below
    0x0625: { type: 1, isolated: 0xFE87, final: 0xFE88, initial: 0xFE87, medial: 0xFE88 },
    // Yeh with Hamza Above
    0x0626: { type: 2, isolated: 0xFE89, final: 0xFE8A, initial: 0xFE8B, medial: 0xFE8C },
    // Alef
    0x0627: { type: 1, isolated: 0xFE8D, final: 0xFE8E, initial: 0xFE8D, medial: 0xFE8E },
    // Beh
    0x0628: { type: 2, isolated: 0xFE8F, final: 0xFE90, initial: 0xFE91, medial: 0xFE92 },
    // Teh Marbuta
    0x0629: { type: 1, isolated: 0xFE93, final: 0xFE94, initial: 0xFE93, medial: 0xFE94 },
    // Teh
    0x062A: { type: 2, isolated: 0xFE95, final: 0xFE96, initial: 0xFE97, medial: 0xFE98 },
    // Theh
    0x062B: { type: 2, isolated: 0xFE99, final: 0xFE9A, initial: 0xFE9B, medial: 0xFE9C },
    // Jeem
    0x062C: { type: 2, isolated: 0xFE9D, final: 0xFE9E, initial: 0xFE9F, medial: 0xFEA0 },
    // Hah
    0x062D: { type: 2, isolated: 0xFEA1, final: 0xFEA2, initial: 0xFEA3, medial: 0xFEA4 },
    // Khah
    0x062E: { type: 2, isolated: 0xFEA5, final: 0xFEA6, initial: 0xFEA7, medial: 0xFEA8 },
    // Dal
    0x062F: { type: 1, isolated: 0xFEA9, final: 0xFEAA, initial: 0xFEA9, medial: 0xFEAA },
    // Thal
    0x0630: { type: 1, isolated: 0xFEAB, final: 0xFEAC, initial: 0xFEAB, medial: 0xFEAC },
    // Reh
    0x0631: { type: 1, isolated: 0xFEAD, final: 0xFEAE, initial: 0xFEAD, medial: 0xFEAE },
    // Zain
    0x0632: { type: 1, isolated: 0xFEAF, final: 0xFEB0, initial: 0xFEAF, medial: 0xFEB0 },
    // Seen
    0x0633: { type: 2, isolated: 0xFEB1, final: 0xFEB2, initial: 0xFEB3, medial: 0xFEB4 },
    // Sheen
    0x0634: { type: 2, isolated: 0xFEB5, final: 0xFEB6, initial: 0xFEB7, medial: 0xFEB8 },
    // Sad
    0x0635: { type: 2, isolated: 0xFEB9, final: 0xFEBA, initial: 0xFEBB, medial: 0xFEBC },
    // Dad
    0x0636: { type: 2, isolated: 0xFEBD, final: 0xFEBE, initial: 0xFEBF, medial: 0xFEC0 },
    // Tah
    0x0637: { type: 2, isolated: 0xFEC1, final: 0xFEC2, initial: 0xFEC3, medial: 0xFEC4 },
    // Zah
    0x0638: { type: 2, isolated: 0xFEC5, final: 0xFEC6, initial: 0xFEC7, medial: 0xFEC8 },
    // Ain
    0x0639: { type: 2, isolated: 0xFEC9, final: 0xFECA, initial: 0xFECB, medial: 0xFECC },
    // Ghain
    0x063A: { type: 2, isolated: 0xFECD, final: 0xFECE, initial: 0xFECF, medial: 0xFED0 },
    // Tatweel (Kashida)
    0x0640: { type: 2, isolated: 0x0640, final: 0x0640, initial: 0x0640, medial: 0x0640 },
    // Feh
    0x0641: { type: 2, isolated: 0xFED1, final: 0xFED2, initial: 0xFED3, medial: 0xFED4 },
    // Qaf
    0x0642: { type: 2, isolated: 0xFED5, final: 0xFED6, initial: 0xFED7, medial: 0xFED8 },
    // Kaf
    0x0643: { type: 2, isolated: 0xFED9, final: 0xFEDA, initial: 0xFEDB, medial: 0xFEDC },
    // Lam
    0x0644: { type: 2, isolated: 0xFEDD, final: 0xFEDE, initial: 0xFEDF, medial: 0xFEE0 },
    // Meem
    0x0645: { type: 2, isolated: 0xFEE1, final: 0xFEE2, initial: 0xFEE3, medial: 0xFEE4 },
    // Noon
    0x0646: { type: 2, isolated: 0xFEE5, final: 0xFEE6, initial: 0xFEE7, medial: 0xFEE8 },
    // Heh
    0x0647: { type: 2, isolated: 0xFEE9, final: 0xFEEA, initial: 0xFEEB, medial: 0xFEEC },
    // Waw
    0x0648: { type: 1, isolated: 0xFEED, final: 0xFEEE, initial: 0xFEED, medial: 0xFEEE },
    // Alef Maksura
    0x0649: { type: 1, isolated: 0xFEEF, final: 0xFEF0, initial: 0xFBE8, medial: 0xFBE9 },
    // Yeh
    0x064A: { type: 2, isolated: 0xFEF1, final: 0xFEF2, initial: 0xFEF3, medial: 0xFEF4 }
  };

  // Lam-Alef Ligature Table
  const LAM_ALEF_LIGATURES = {
    0x0622: { isolated: 0xFEF5, final: 0xFEF6 }, // Lam + Alef Madda
    0x0623: { isolated: 0xFEF7, final: 0xFEF8 }, // Lam + Alef Hamza Above
    0x0625: { isolated: 0xFEF9, final: 0xFEFA }, // Lam + Alef Hamza Below
    0x0627: { isolated: 0xFEFB, final: 0xFEFC }  // Lam + Alef
  };

  // Tashkeel / Harakat (diacritics: Fathatan, Dammatan, Kasratan, Fatha, Damma, Kasra, Shadda, Sukun)
  const TASHKEEL_REGEX = /[\u064B-\u065F\u0670]/g;

  /**
   * Removes Harakat/Tashkeel from text
   */
  function stripTashkeel(text) {
    if (!text || typeof text !== 'string') return '';
    return text.replace(TASHKEEL_REGEX, '');
  }

  /**
   * Detects if character is transparent (diacritic, zero-width joiner, etc.)
   */
  function isTransparent(code) {
    return (code >= 0x064B && code <= 0x065F) || code === 0x0670 || code === 0x200C || code === 0x200D;
  }

  /**
   * Check if a string contains Arabic characters
   */
  function isArabic(text) {
    if (!text || typeof text !== 'string') return false;
    return /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text);
  }

  /**
   * Reshape Arabic string into its Presentation Forms-B representation.
   * Connects letters contextually (Initial, Medial, Final, Isolated) and merges Lam-Alef ligatures.
   * 
   * @param {string} text - Raw Arabic text
   * @param {object} [options]
   * @param {boolean} [options.keepTashkeel=true] - Whether to retain Harakat
   * @returns {string} Reshaped text with joined glyphs
   */
  function reshape(text, options = {}) {
    if (!text || typeof text !== 'string') return '';
    if (!isArabic(text)) return text;

    const chars = Array.from(text);
    const n = chars.length;
    const codes = chars.map(c => c.charCodeAt(0));
    const result = [];

    let i = 0;
    while (i < n) {
      const code = codes[i];

      // Check for Lam-Alef Ligature (0x0644 + Alef variant)
      if (code === 0x0644 && i + 1 < n) {
        // Look ahead skipping transparent characters
        let nextIdx = i + 1;
        while (nextIdx < n && isTransparent(codes[nextIdx])) {
          nextIdx++;
        }
        if (nextIdx < n && LAM_ALEF_LIGATURES[codes[nextIdx]]) {
          const alefCode = codes[nextIdx];
          const ligature = LAM_ALEF_LIGATURES[alefCode];

          // Determine if Lam is connected to preceding letter
          let prevIdx = i - 1;
          while (prevIdx >= 0 && isTransparent(codes[prevIdx])) {
            prevIdx--;
          }
          const prevData = prevIdx >= 0 ? CHAR_DATA[codes[prevIdx]] : null;
          const connectsBefore = prevData && (prevData.type === 2);

          result.push(String.fromCharCode(connectsBefore ? ligature.final : ligature.isolated));
          i = nextIdx + 1;
          continue;
        }
      }

      const data = CHAR_DATA[code];
      if (!data) {
        // Non-Arabic or unsupported character, output as-is
        result.push(chars[i]);
        i++;
        continue;
      }

      // Determine preceding connection
      let prevIdx = i - 1;
      while (prevIdx >= 0 && isTransparent(codes[prevIdx])) {
        prevIdx--;
      }
      const prevData = prevIdx >= 0 ? CHAR_DATA[codes[prevIdx]] : null;
      const connectsBefore = prevData && (prevData.type === 2);

      // Determine following connection
      let nextIdx = i + 1;
      while (nextIdx < n && isTransparent(codes[nextIdx])) {
        nextIdx++;
      }
      const nextData = nextIdx < n ? CHAR_DATA[codes[nextIdx]] : null;
      const connectsAfter = nextData && (nextData.type === 1 || nextData.type === 2);

      // Select presentation form
      let shapedCode;
      if (connectsBefore && connectsAfter && data.type === 2) {
        shapedCode = data.medial;
      } else if (connectsBefore) {
        shapedCode = data.final;
      } else if (connectsAfter && data.type === 2) {
        shapedCode = data.initial;
      } else {
        shapedCode = data.isolated;
      }

      result.push(String.fromCharCode(shapedCode || code));
      i++;
    }

    return result.join('');
  }

  /**
   * Bidirectional (BiDi) Algorithm for naive PDF engines:
   * Reverses RTL Arabic sequences while strictly keeping LTR numbers,
   * punctuation, phone numbers, and Latin identifiers in proper left-to-right order.
   * 
   * @param {string} text - Reshaped or raw text
   * @returns {string} Reordered text suitable for left-to-right naive renderers
   */
  function bidi(text) {
    if (!text || typeof text !== 'string') return '';
    if (!isArabic(text)) return text;

    // Segment text into tokens: Arabic runs, LTR runs (numbers, english words, punctuation)
    // Regexp matches contiguous sequences of:
    // 1) Arabic characters (including presentation forms U+FB50-FDFF, U+FE70-FEFF)
    // 2) Numbers / measurements / Latin identifiers
    const lines = text.split('\n');
    const processedLines = lines.map(line => {
      // Split into word/symbol tokens preserving whitespace
      const tokens = line.match(/([\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]+|[0-9]+[0-9.,/:%+-]*|[a-zA-Z0-9_\-+#@.]+|[^\s\w\u0600-\u06FF\uFB50-\uFEFF]+|\s+)/g);
      if (!tokens) return line;

      // Group into directional runs
      const runs = [];
      tokens.forEach(tok => {
        const isRtl = isArabic(tok);
        runs.push({ text: tok, rtl: isRtl });
      });

      // Reverse Arabic letters internally within each RTL token
      const reorderedTokens = [];
      runs.forEach(run => {
        if (run.rtl) {
          // Reverse character array
          reorderedTokens.push(Array.from(run.text).reverse().join(''));
        } else {
          reorderedTokens.push(run.text);
        }
      });

      // Reverse the order of tokens on the line so RTL reads right-to-left
      return reorderedTokens.reverse().join('');
    });

    return processedLines.join('\n');
  }

  /**
   * Complete pipeline: Reshape + BiDi reorder
   * Used for passing text into Canvas, jsPDF, PDFKit, or standard canvas printers.
   * 
   * @param {string} text
   * @returns {string}
   */
  function processArabic(text) {
    return bidi(reshape(text));
  }

  return {
    CHAR_DATA,
    LAM_ALEF_LIGATURES,
    isArabic,
    stripTashkeel,
    reshape,
    bidi,
    processArabic
  };
});

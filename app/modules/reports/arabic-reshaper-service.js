/**
 * Health Vibe AI - Client-side Arabic Reshaper & Bidirectional Engine
 * Requirement #70: "إصلاح عرض الخطوط العربية في تقارير الـ PDF عبر استخدام Arabic Reshaper + bidi"
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

  const CHAR_DATA = {
    0x0621: { type: 0, isolated: 0xFE80, final: 0xFE80, initial: 0xFE80, medial: 0xFE80 },
    0x0622: { type: 1, isolated: 0xFE81, final: 0xFE82, initial: 0xFE81, medial: 0xFE82 },
    0x0623: { type: 1, isolated: 0xFE83, final: 0xFE84, initial: 0xFE83, medial: 0xFE84 },
    0x0624: { type: 1, isolated: 0xFE85, final: 0xFE86, initial: 0xFE85, medial: 0xFE86 },
    0x0625: { type: 1, isolated: 0xFE87, final: 0xFE88, initial: 0xFE87, medial: 0xFE88 },
    0x0626: { type: 2, isolated: 0xFE89, final: 0xFE8A, initial: 0xFE8B, medial: 0xFE8C },
    0x0627: { type: 1, isolated: 0xFE8D, final: 0xFE8E, initial: 0xFE8D, medial: 0xFE8E },
    0x0628: { type: 2, isolated: 0xFE8F, final: 0xFE90, initial: 0xFE91, medial: 0xFE92 },
    0x0629: { type: 1, isolated: 0xFE93, final: 0xFE94, initial: 0xFE93, medial: 0xFE94 },
    0x062A: { type: 2, isolated: 0xFE95, final: 0xFE96, initial: 0xFE97, medial: 0xFE98 },
    0x062B: { type: 2, isolated: 0xFE99, final: 0xFE9A, initial: 0xFE9B, medial: 0xFE9C },
    0x062C: { type: 2, isolated: 0xFE9D, final: 0xFE9E, initial: 0xFE9F, medial: 0xFEA0 },
    0x062D: { type: 2, isolated: 0xFEA1, final: 0xFEA2, initial: 0xFEA3, medial: 0xFEA4 },
    0x062E: { type: 2, isolated: 0xFEA5, final: 0xFEA6, initial: 0xFEA7, medial: 0xFEA8 },
    0x062F: { type: 1, isolated: 0xFEA9, final: 0xFEAA, initial: 0xFEA9, medial: 0xFEAA },
    0x0630: { type: 1, isolated: 0xFEAB, final: 0xFEAC, initial: 0xFEAB, medial: 0xFEAC },
    0x0631: { type: 1, isolated: 0xFEAD, final: 0xFEAE, initial: 0xFEAD, medial: 0xFEAE },
    0x0632: { type: 1, isolated: 0xFEAF, final: 0xFEB0, initial: 0xFEAF, medial: 0xFEB0 },
    0x0633: { type: 2, isolated: 0xFEB1, final: 0xFEB2, initial: 0xFEB3, medial: 0xFEB4 },
    0x0634: { type: 2, isolated: 0xFEB5, final: 0xFEB6, initial: 0xFEB7, medial: 0xFEB8 },
    0x0635: { type: 2, isolated: 0xFEB9, final: 0xFEBA, initial: 0xFEBB, medial: 0xFEBC },
    0x0636: { type: 2, isolated: 0xFEBD, final: 0xFEBE, initial: 0xFEBF, medial: 0xFEC0 },
    0x0637: { type: 2, isolated: 0xFEC1, final: 0xFEC2, initial: 0xFEC3, medial: 0xFEC4 },
    0x0638: { type: 2, isolated: 0xFEC5, final: 0xFEC6, initial: 0xFEC7, medial: 0xFEC8 },
    0x0639: { type: 2, isolated: 0xFEC9, final: 0xFECA, initial: 0xFECB, medial: 0xFECC },
    0x063A: { type: 2, isolated: 0xFECD, final: 0xFECE, initial: 0xFECF, medial: 0xFED0 },
    0x0640: { type: 2, isolated: 0x0640, final: 0x0640, initial: 0x0640, medial: 0x0640 },
    0x0641: { type: 2, isolated: 0xFED1, final: 0xFED2, initial: 0xFED3, medial: 0xFED4 },
    0x0642: { type: 2, isolated: 0xFED5, final: 0xFED6, initial: 0xFED7, medial: 0xFED8 },
    0x0643: { type: 2, isolated: 0xFED9, final: 0xFEDA, initial: 0xFEDB, medial: 0xFEDC },
    0x0644: { type: 2, isolated: 0xFEDD, final: 0xFEDE, initial: 0xFEDF, medial: 0xFEE0 },
    0x0645: { type: 2, isolated: 0xFEE1, final: 0xFEE2, initial: 0xFEE3, medial: 0xFEE4 },
    0x0646: { type: 2, isolated: 0xFEE5, final: 0xFEE6, initial: 0xFEE7, medial: 0xFEE8 },
    0x0647: { type: 2, isolated: 0xFEE9, final: 0xFEEA, initial: 0xFEEB, medial: 0xFEEC },
    0x0648: { type: 1, isolated: 0xFEED, final: 0xFEEE, initial: 0xFEED, medial: 0xFEEE },
    0x0649: { type: 1, isolated: 0xFEEF, final: 0xFEF0, initial: 0xFBE8, medial: 0xFBE9 },
    0x064A: { type: 2, isolated: 0xFEF1, final: 0xFEF2, initial: 0xFEF3, medial: 0xFEF4 }
  };

  const LAM_ALEF_LIGATURES = {
    0x0622: { isolated: 0xFEF5, final: 0xFEF6 },
    0x0623: { isolated: 0xFEF7, final: 0xFEF8 },
    0x0625: { isolated: 0xFEF9, final: 0xFEFA },
    0x0627: { isolated: 0xFEFB, final: 0xFEFC }
  };

  const TASHKEEL_REGEX = /[\u064B-\u065F\u0670]/g;

  function stripTashkeel(text) {
    if (!text || typeof text !== 'string') return '';
    return text.replace(TASHKEEL_REGEX, '');
  }

  function isTransparent(code) {
    return (code >= 0x064B && code <= 0x065F) || code === 0x0670 || code === 0x200C || code === 0x200D;
  }

  function isArabic(text) {
    if (!text || typeof text !== 'string') return false;
    return /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text);
  }

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

      if (code === 0x0644 && i + 1 < n) {
        let nextIdx = i + 1;
        while (nextIdx < n && isTransparent(codes[nextIdx])) {
          nextIdx++;
        }
        if (nextIdx < n && LAM_ALEF_LIGATURES[codes[nextIdx]]) {
          const alefCode = codes[nextIdx];
          const ligature = LAM_ALEF_LIGATURES[alefCode];

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
        result.push(chars[i]);
        i++;
        continue;
      }

      let prevIdx = i - 1;
      while (prevIdx >= 0 && isTransparent(codes[prevIdx])) {
        prevIdx--;
      }
      const prevData = prevIdx >= 0 ? CHAR_DATA[codes[prevIdx]] : null;
      const connectsBefore = prevData && (prevData.type === 2);

      let nextIdx = i + 1;
      while (nextIdx < n && isTransparent(codes[nextIdx])) {
        nextIdx++;
      }
      const nextData = nextIdx < n ? CHAR_DATA[codes[nextIdx]] : null;
      const connectsAfter = nextData && (nextData.type === 1 || nextData.type === 2);

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

  function bidi(text) {
    if (!text || typeof text !== 'string') return '';
    if (!isArabic(text)) return text;

    const lines = text.split('\n');
    const processedLines = lines.map(line => {
      const tokens = line.match(/([\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]+|[0-9]+[0-9.,/:%+-]*|[a-zA-Z0-9_\-+#@.]+|[^\s\w\u0600-\u06FF\uFB50-\uFEFF]+|\s+)/g);
      if (!tokens) return line;

      const runs = [];
      tokens.forEach(tok => {
        const isRtl = isArabic(tok);
        runs.push({ text: tok, rtl: isRtl });
      });

      const reorderedTokens = [];
      runs.forEach(run => {
        if (run.rtl) {
          reorderedTokens.push(Array.from(run.text).reverse().join(''));
        } else {
          reorderedTokens.push(run.text);
        }
      });

      return reorderedTokens.reverse().join('');
    });

    return processedLines.join('\n');
  }

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

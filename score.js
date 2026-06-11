"use strict";

(function exposeScoreMath(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ScoreMath = api;
})(typeof globalThis === "object" ? globalThis : this, () => {
  const PRECISION = 16;
  const MAX_EXACT_DIGITS = 1000;
  const TEN_POW_PRECISION = 10n ** BigInt(PRECISION);

  function parseScore(value) {
    const text = String(value ?? "0").trim().toLowerCase().replaceAll(",", "");
    const match = /^(\d+)(?:\.(\d*))?(?:e\+?(\d+))?$/.exec(text);
    if (!match) return { digits: "0", exponent: 0n };

    const fraction = match[2] || "";
    let digits = `${match[1]}${fraction}`.replace(/^0+/, "");
    if (!digits) return { digits: "0", exponent: 0n };

    const suppliedExponent = BigInt(match[3] || "0");
    let exponent = suppliedExponent - BigInt(fraction.length) + BigInt(digits.length - 1);
    digits = digits.slice(0, PRECISION).replace(/0+$/, "");
    return { digits: digits || "0", exponent };
  }

  function formatParts(parts) {
    let { digits, exponent } = parts;
    digits = String(digits).replace(/^0+/, "").replace(/0+$/, "");
    if (!digits) return "0";

    if (exponent >= 0n && exponent < BigInt(MAX_EXACT_DIGITS)) {
      const integerLength = Number(exponent) + 1;
      if (integerLength >= digits.length) return digits + "0".repeat(integerLength - digits.length);
    }

    const coefficient = digits.length === 1 ? digits : `${digits[0]}.${digits.slice(1)}`;
    return `${coefficient}e+${exponent}`;
  }

  function normalizeScore(value) {
    const text = String(value ?? "0").trim();
    if (/^\d+$/.test(text)) {
      const digits = text.replace(/^0+(?=\d)/, "");
      if (digits.length <= MAX_EXACT_DIGITS) return digits;
    }
    return formatParts(parseScore(text));
  }

  function compareScores(a, b) {
    const left = parseScore(a);
    const right = parseScore(b);
    if (left.digits === "0" || right.digits === "0") {
      return left.digits === right.digits ? 0 : left.digits === "0" ? -1 : 1;
    }
    if (left.exponent !== right.exponent) return left.exponent < right.exponent ? -1 : 1;
    const width = Math.max(left.digits.length, right.digits.length);
    const leftDigits = left.digits.padEnd(width, "0");
    const rightDigits = right.digits.padEnd(width, "0");
    return leftDigits < rightDigits ? -1 : leftDigits > rightDigits ? 1 : 0;
  }

  function alignedMantissa(parts, exponent) {
    const shift = Number(exponent - parts.exponent);
    if (shift >= PRECISION) return 0n;
    return BigInt(parts.digits.padEnd(PRECISION, "0")) / (10n ** BigInt(shift));
  }

  function addScores(a, b) {
    const leftText = normalizeScore(a);
    const rightText = normalizeScore(b);
    if (/^\d+$/.test(leftText) && /^\d+$/.test(rightText)) {
      const exact = (BigInt(leftText) + BigInt(rightText)).toString();
      if (exact.length <= MAX_EXACT_DIGITS) return exact;
    }

    const left = parseScore(leftText);
    const right = parseScore(rightText);
    if (left.digits === "0") return rightText;
    if (right.digits === "0") return leftText;
    let exponent = left.exponent > right.exponent ? left.exponent : right.exponent;
    let mantissa = alignedMantissa(left, exponent) + alignedMantissa(right, exponent);
    if (mantissa >= TEN_POW_PRECISION) {
      mantissa /= 10n;
      exponent += 1n;
    }
    return formatParts({ digits: mantissa.toString().replace(/0+$/, ""), exponent });
  }

  function subtractScores(a, b) {
    if (compareScores(a, b) <= 0) return "0";
    const leftText = normalizeScore(a);
    const rightText = normalizeScore(b);
    if (/^\d+$/.test(leftText) && /^\d+$/.test(rightText)) return (BigInt(leftText) - BigInt(rightText)).toString();

    const left = parseScore(leftText);
    const right = parseScore(rightText);
    let mantissa = alignedMantissa(left, left.exponent) - alignedMantissa(right, left.exponent);
    let exponent = left.exponent;
    let digits = mantissa.toString().padStart(PRECISION, "0");
    const leadingZeros = digits.search(/[^0]/);
    if (leadingZeros > 0) {
      exponent -= BigInt(leadingZeros);
      digits = digits.slice(leadingZeros);
    }
    return formatParts({ digits: digits.replace(/0+$/, ""), exponent });
  }

  function multiplyScoreByWhole(score, whole) {
    const factor = BigInt(whole);
    if (factor === 0n || compareScores(score, "0") === 0) return "0";
    const normalized = normalizeScore(score);
    if (/^\d+$/.test(normalized)) {
      const exact = (BigInt(normalized) * factor).toString();
      if (exact.length <= MAX_EXACT_DIGITS) return exact;
    }
    const parts = parseScore(normalized);
    const product = BigInt(parts.digits) * factor;
    const productDigits = product.toString();
    const exponent = parts.exponent + BigInt(productDigits.length - parts.digits.length);
    return formatParts({ digits: productDigits.slice(0, PRECISION), exponent });
  }

  function powerOfWhole(baseValue, exponentValue) {
    const base = BigInt(baseValue);
    const exponent = BigInt(exponentValue);
    if (exponent === 0n) return "1";
    if (base === 0n) return "0";
    if (base === 1n) return "1";

    const baseDigits = base.toString();
    const approximateDigits = BigInt(baseDigits.length) * exponent;
    if (approximateDigits <= BigInt(MAX_EXACT_DIGITS)) {
      const exact = (base ** exponent).toString();
      if (exact.length <= MAX_EXACT_DIGITS) return exact;
    }

    const leading = Number(baseDigits.slice(0, 16)) / (10 ** Math.min(15, baseDigits.length - 1));
    const log10Base = (baseDigits.length - 1) + Math.log10(leading);
    const scale = 1_000_000_000_000n;
    const scaledLog = BigInt(Math.floor(log10Base * Number(scale)));
    const scaledResult = scaledLog * exponent;
    let resultExponent = scaledResult / scale;
    const fractional = Number(scaledResult % scale) / Number(scale);
    let coefficientValue = Number(Math.pow(10, fractional).toPrecision(PRECISION));
    if (coefficientValue >= 10) {
      coefficientValue /= 10;
      resultExponent += 1n;
    }
    const coefficient = coefficientValue.toPrecision(PRECISION).replace(".", "").replace(/0+$/, "");
    return formatParts({ digits: coefficient, exponent: resultExponent });
  }

  function formatScientific(value) {
    const parts = parseScore(value);
    if (parts.digits === "0") return "0.00e+00";
    const decimals = (parts.digits.slice(1, 3) + "00").slice(0, 2);
    return `${parts.digits[0]}.${decimals}e+${parts.exponent.toString().padStart(2, "0")}`;
  }

  function formatScore(value) {
    const normalized = normalizeScore(value);
    if (normalized.includes("e+")) return normalized;
    if (normalized.length > 30) return formatParts(parseScore(normalized));
    return normalized.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  return {
    MAX_EXACT_DIGITS,
    normalizeScore,
    compareScores,
    addScores,
    subtractScores,
    multiplyScoreByWhole,
    powerOfWhole,
    formatScientific,
    formatScore
  };
});

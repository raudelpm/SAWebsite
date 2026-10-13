/**
 * All pool-cage geometry is stored in inches.
 * 10 ft = 120. 10 ft 6 in = 126. Display is architectural feet and inches.
 */

export function roundInches(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

export function toInches(feet, inches) {
  const ft = Math.max(0, Number(feet) || 0);
  const inn = Math.max(0, Number(inches) || 0);
  return roundInches(ft * 12 + inn);
}

export function splitInches(total) {
  const n = Math.max(0, Math.round(Number(total) || 0));
  return { ft: Math.floor(n / 12), inn: n % 12 };
}

export function formatInches(total) {
  const { ft, inn } = splitInches(total);
  if (inn === 0) return ft + "'";
  return ft + "' " + inn + '"';
}

/** Nearest inch, for a length taken off a moved roof node. */
export function formatApprox(total) {
  return formatInches(Math.max(0, Math.round(Number(total) || 0)));
}

/** 4x4 is a 4 by 4 inch member. 2x8 is 2 inches thick and 8 inches deep. */
export function memberProfile(size) {
  const match = String(size || "2x2").toLowerCase().match(/(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)/);
  const width = match ? Number(match[1]) : 2;
  const depth = match ? Number(match[2]) : width;
  return { width, depth };
}

/** Keeps a tenth of an inch when a section does not land on a whole inch. 31' / 5 = 6' 2.4". */
export function formatLength(total) {
  const n = Math.max(0, Number(total) || 0);
  const rounded = Math.round(n * 10) / 10;
  const ft = Math.floor((rounded + 1e-6) / 12);
  let inches = Math.round((rounded - ft * 12) * 10) / 10;
  if (inches < 0.05) return ft + "'";
  if (Math.abs(inches - Math.round(inches)) < 0.05) return ft + "' " + Math.round(inches) + '"';
  return ft + "' " + inches + '"';
}

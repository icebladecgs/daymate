export const parseLines = (text) =>
  (text || "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

export const clampList = (arr, max) => arr.slice(0, max);

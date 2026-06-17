// src/lib/dates.js
'use strict';
// Testable "today". Honors DOT_AI_NOW (YYYY-MM-DD) so date-sensitive commands
// (archive stamping, prune retention) are deterministic under test.

function today() {
  const override = process.env.DOT_AI_NOW;
  if (override) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(override)) {
      throw new Error(`DOT_AI_NOW must be YYYY-MM-DD, got: ${override}`);
    }
    return override;
  }
  return new Date().toISOString().slice(0, 10);
}

// Whole calendar-day difference a - b for two YYYY-MM-DD strings (UTC).
function daysBetween(a, b) {
  const da = Date.parse(`${a}T00:00:00Z`);
  const db = Date.parse(`${b}T00:00:00Z`);
  return Math.round((da - db) / 86400000);
}

module.exports = { today, daysBetween };

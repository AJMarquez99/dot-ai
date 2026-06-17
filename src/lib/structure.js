// src/lib/structure.js
'use strict';
// Single source of truth for the canonical .ai/ layout. init/sync scaffold from
// the template tree; doctor (Plan 2) validates against this list; sync reconciles
// to it. Each folder answers one distinct question (see SPEC.md).

const FOLDERS = [
  'knowledge', 'guidelines', 'runbooks', 'scripts', 'templates',
  'data', 'plans', 'audits', 'lessons', 'notes', 'context', 'archive',
];

// Optional extension folders — scaffolded only on request, but recognized so
// they're never flagged as stale/non-canonical.
const OPTIONAL_FOLDERS = ['skills', 'agents'];

// Inherently project-scoped folders: promote (Plan 3) warns when moving their
// contents to a broader level; doctor (Plan 2) flags them at broad levels.
const PROJECT_BOUND = ['context', 'plans', 'audits'];

function isCanonical(name) {
  return FOLDERS.includes(name) || OPTIONAL_FOLDERS.includes(name);
}

module.exports = { FOLDERS, OPTIONAL_FOLDERS, PROJECT_BOUND, isCanonical };

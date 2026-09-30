// Standalone wipe. Run on the server (where the DB is reachable):
//   node src/wipeOptionLab.js
// Clears the old Option Lab tables AND the new Option Insight dry-run tracker.
import { wipeOptionLab } from './optionLab.js'
import { wipeDryRun } from './optionDryRun.js'

Promise.all([wipeOptionLab(), wipeDryRun()])
  .then(([a, b]) => { console.log('✓ wiped:', JSON.stringify({ optionLab: a, dryRun: b })); process.exit(0) })
  .catch((e) => { console.error('✗ wipe failed:', e.message); process.exit(1) })

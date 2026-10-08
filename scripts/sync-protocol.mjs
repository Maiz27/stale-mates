#!/usr/bin/env node
// Keeps the shared wire protocol identical on both sides (audit M1 / SM-3).
//
//   node scripts/sync-protocol.mjs          copy api/src/lib/protocol.ts -> src/lib/chess/protocol.ts
//   node scripts/sync-protocol.mjs --check  exit 1 if the two copies differ (CI)
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'api/src/lib/protocol.ts');
const target = join(root, 'src/lib/chess/protocol.ts');

const a = readFileSync(source, 'utf8');
let b = '';
try {
	b = readFileSync(target, 'utf8');
} catch {
	// missing target
}

if (process.argv.includes('--check')) {
	if (a !== b) {
		console.error(
			'src/lib/chess/protocol.ts differs from api/src/lib/protocol.ts.\n' +
				'Edit api/src/lib/protocol.ts and run `node scripts/sync-protocol.mjs`.'
		);
		process.exit(1);
	}
	console.log('protocol.ts copies are identical');
} else {
	writeFileSync(target, a);
	console.log('Copied api/src/lib/protocol.ts -> src/lib/chess/protocol.ts');
}

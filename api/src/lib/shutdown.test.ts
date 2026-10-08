import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { SHUTDOWN_FORCE_EXIT_MS } from './shutdown';

const flyToml = readFileSync(join(__dirname, '../../fly.toml'), 'utf8');

describe('fly.toml process lifecycle (CR3-6)', () => {
	it('restarts the machine whatever the exit code', () => {
		expect(flyToml).toMatch(/^\[\[restart\]\]\s*\n\s*policy = "always"/m);
	});

	it("gives the server's own forced exit time to run before Fly kills it", () => {
		const match = /^kill_timeout = (\d+)$/m.exec(flyToml);
		expect(match).not.toBeNull();
		expect(SHUTDOWN_FORCE_EXIT_MS).toBeLessThan(Number(match![1]) * 1000);
	});
});

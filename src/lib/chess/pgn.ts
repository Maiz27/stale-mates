import type { GameOver } from './types';

export type PgnInfo = {
	moves: string[]; // SAN
	white: string;
	black: string;
	result: GameOver;
	event?: string;
	site?: string;
	date?: Date;
};

/** PGN result token: "1-0", "0-1", "1/2-1/2" or "*" for an unfinished game. */
export function resultToken(result: GameOver): string {
	if (!result.isOver) return '*';
	if (result.winner === 'white') return '1-0';
	if (result.winner === 'black') return '0-1';
	if (result.winner === 'draw') return '1/2-1/2';
	return '*';
}

function pgnDate(date: Date): string {
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`;
}

/** Escape a PGN tag value (backslash and double quote). */
const tag = (name: string, value: string) =>
	`[${name} "${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`;

/** Movetext only: "1. e4 e5 2. Nf3", wrapped at 80 columns, ending with the result token. */
export function movetext(moves: string[], result: GameOver): string {
	const tokens: string[] = [];
	moves.forEach((san, i) => {
		if (i % 2 === 0) tokens.push(`${i / 2 + 1}.`);
		tokens.push(san);
	});
	tokens.push(resultToken(result));
	const lines: string[] = [];
	let line = '';
	for (const token of tokens) {
		if (line && line.length + 1 + token.length > 80) {
			lines.push(line);
			line = token;
		} else {
			line = line ? `${line} ${token}` : token;
		}
	}
	if (line) lines.push(line);
	return lines.join('\n');
}

/** A complete PGN with the Seven Tag Roster. */
export function buildPgn({
	moves,
	white,
	black,
	result,
	event = 'Casual game',
	site = 'https://stalemates.magedfaiz.xyz',
	date = new Date()
}: PgnInfo): string {
	const headers = [
		tag('Event', event),
		tag('Site', site),
		tag('Date', pgnDate(date)),
		tag('Round', '-'),
		tag('White', white),
		tag('Black', black),
		tag('Result', resultToken(result))
	];
	return `${headers.join('\n')}\n\n${movetext(moves, result)}\n`;
}

/**
 * Screen-reader text for a move: who moved, the move, and check/mate.
 * `index` is the 0-based ply number.
 */
export function describeMove(index: number, san: string): string {
	const side = index % 2 === 0 ? 'White' : 'Black';
	let suffix = '';
	if (san.endsWith('#')) suffix = ', checkmate';
	else if (san.endsWith('+')) suffix = ', check';
	return `${side} played ${san.replace(/[+#]$/, '')}${suffix}`;
}

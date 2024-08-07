export const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export const DIFFICULTY_OPTIONS = [
	{ value: 1, label: 'Beginner' },
	{ value: 3, label: 'Casual' },
	{ value: 7, label: 'Intermediate' },
	{ value: 11, label: 'Advanced' },
	{ value: 15, label: 'Expert' },
	{ value: 18, label: 'Master' },
	{ value: 20, label: 'Grandmaster' }
];

export const COLOR_OPTIONS = [
	{ value: 'white', label: 'White' },
	{ value: 'black', label: 'Black' }
];

export const PROMOTION_OPTIONS = [
	{ value: 'q', label: 'Queen' },
	{ value: 'r', label: 'Rook' },
	{ value: 'b', label: 'Bishop' },
	{ value: 'n', label: 'Knight' }
];

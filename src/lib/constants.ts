export const MOVE_AUDIOS_PATHS = {
	normal: '/audio/move-self.mp3',
	capture: '/audio/capture.mp3',
	castle: '/audio/castle.mp3',
	check: '/audio/move-check.mp3',
	promote: '/audio/promote.mp3',
	'game-start': '/audio/game-start.mp3',
	'game-end': '/audio/game-end.mp3'
};

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

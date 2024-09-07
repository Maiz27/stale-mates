export const PLAYER_ID_EXPIRATION = 4 * 60 * 60 * 1000; // 4 hours

export const STARTING_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export const MOVE_AUDIOS_PATHS = {
	normal: '/audio/move-self.mp3',
	capture: '/audio/capture.mp3',
	castle: '/audio/castle.mp3',
	check: '/audio/move-check.mp3',
	promote: '/audio/promote.mp3',
	'game-start': '/audio/game-start.mp3',
	'game-end': '/audio/game-end.mp3'
};

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

export const TIME_OPTIONS = [
	{ value: 0, label: 'Unlimited' },
	{ value: 1, label: '1 Minute Game' },
	{ value: 3, label: '3 Minutes Game' },
	{ value: 10, label: '10 Minutes Game' }
];

export const PROMOTION_OPTIONS = [
	{ value: 'q', label: 'Queen' },
	{ value: 'r', label: 'Rook' },
	{ value: 'b', label: 'Bishop' },
	{ value: 'n', label: 'Knight' }
];

import type { PageLoad } from './$types';
import type { Color } from 'chessground/types';

export const ssr = false;

export const load: PageLoad = ({ url }) => {
	const queryParams = url.searchParams;
	const color = (queryParams.get('color') || 'white') as Color;
	const difficulty = parseInt(queryParams.get('difficulty') || '10');
	const hints = queryParams.get('hints') === 'true';
	const undo = queryParams.get('undo') === 'true';

	return {
		color,
		difficulty,
		hints,
		undo
	};
};

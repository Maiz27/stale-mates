import type { PageLoad } from './$types';
import type { Color } from 'chessground/types';

export const ssr = false;

export const load: PageLoad = ({ url }) => {
	const queryParams = url.searchParams;
	const playerColor = (queryParams.get('color') || 'white') as Color;

	return {
		playerColor
	};
};

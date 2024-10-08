import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { cubicOut } from 'svelte/easing';
import type { TransitionConfig } from 'svelte/transition';
import Cookies from 'js-cookie';
import { DIFFICULTY_OPTIONS } from './constants';

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

type FlyAndScaleParams = {
	y?: number;
	x?: number;
	start?: number;
	duration?: number;
};

export const flyAndScale = (
	node: Element,
	params: FlyAndScaleParams = { y: -8, x: 0, start: 0.95, duration: 150 }
): TransitionConfig => {
	const style = getComputedStyle(node);
	const transform = style.transform === 'none' ? '' : style.transform;

	const scaleConversion = (valueA: number, scaleA: [number, number], scaleB: [number, number]) => {
		const [minA, maxA] = scaleA;
		const [minB, maxB] = scaleB;

		const percentage = (valueA - minA) / (maxA - minA);
		const valueB = percentage * (maxB - minB) + minB;

		return valueB;
	};

	const styleToString = (style: Record<string, number | string | undefined>): string => {
		return Object.keys(style).reduce((str, key) => {
			if (style[key] === undefined) return str;
			return str + `${key}:${style[key]};`;
		}, '');
	};

	return {
		duration: params.duration ?? 200,
		delay: 0,
		css: (t) => {
			const y = scaleConversion(t, [0, 1], [params.y ?? 5, 0]);
			const x = scaleConversion(t, [0, 1], [params.x ?? 0, 0]);
			const scale = scaleConversion(t, [0, 1], [params.start ?? 0.95, 1]);

			return styleToString({
				transform: `${transform} translate3d(${x}px, ${y}px, 0) scale(${scale})`,
				opacity: t
			});
		},
		easing: cubicOut
	};
};

export const getDifficultyLabel = (value: number): string => {
	return DIFFICULTY_OPTIONS.find((option) => option.value === value)?.label || '';
};

export const formatTime = (seconds: number): string => {
	if (seconds === Infinity) return 'Unlimited';

	const minutes = Math.floor(seconds / 60);
	const remainingSeconds = Math.round(seconds % 60);

	const minutesStr = minutes.toString().padStart(2, '0');
	const secondsStr = remainingSeconds.toString().padStart(2, '0');

	return `${minutesStr}:${secondsStr}`;
};

export function AddItemToCookies({
	key,
	value,
	expiration
}: {
	key: string;
	value: string;
	expiration: number;
}) {
	const cookie = {
		data: value
	};

	Cookies.set(key, JSON.stringify(cookie), {
		expires: expiration
	});
}

export function GetItemFromCookies(key: string) {
	const storedData = Cookies.get(key);
	if (storedData) {
		const { data } = JSON.parse(storedData);
		return data;
	}
	return null;
}

import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { DIFFICULTY_OPTIONS } from './constants';

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

// Helper types used by the shadcn-svelte (bits-ui 2) components.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChild<T> = T extends { child?: any } ? Omit<T, 'child'> : T;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChildren<T> = T extends { children?: any } ? Omit<T, 'children'> : T;
export type WithoutChildrenOrChild<T> = WithoutChildren<WithoutChild<T>>;
export type WithElementRef<T, U extends HTMLElement = HTMLElement> = T & { ref?: U | null };

export const getDifficultyLabel = (value: number): string => {
	return DIFFICULTY_OPTIONS.find((option) => option.value === value)?.label || '';
};

export const formatTime = (seconds: number): string => {
	if (seconds === Infinity) return 'Unlimited';

	// Floor, never round: 59.6s must read "00:59", not "00:60" (SM-2.7).
	const whole = Math.max(0, Math.floor(seconds));
	const minutes = Math.floor(whole / 60);
	const remainingSeconds = whole % 60;

	const minutesStr = minutes.toString().padStart(2, '0');
	const secondsStr = remainingSeconds.toString().padStart(2, '0');

	return `${minutesStr}:${secondsStr}`;
};

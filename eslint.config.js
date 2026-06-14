import js from '@eslint/js';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

/** @type {import('eslint').Linter.FlatConfig[]} */
export default [
	js.configs.recommended,
	...ts.configs.recommended,
	...svelte.configs['flat/recommended'],
	prettier,
	...svelte.configs['flat/prettier'],
	{
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.node
			}
		}
	},
	{
		files: ['**/*.svelte'],
		languageOptions: {
			parserOptions: {
				parser: ts.parser
			}
		},
		rules: {
			// $$Props/$$Events/$$Slots are Svelte's magic type names: consumed by the
			// compiler and svelte-check for typing, but never referenced in the script body.
			'@typescript-eslint/no-unused-vars': ['error', { varsIgnorePattern: '^\\$\\$' }]
		}
	},
	{
		ignores: ['build/', '.svelte-kit/', 'dist/', 'static/stockfish.js', '.vercel/']
	}
];

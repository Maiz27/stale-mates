declare global {
	namespace NodeJS {
		interface ProcessEnv {
			PORT: string;
			ORIGIN: string;
		}
	}
}

export {};

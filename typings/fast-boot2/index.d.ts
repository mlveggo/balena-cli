declare module 'fast-boot2' {
	export function start({
		cacheFile,
		cacheKiller,
		cacheScope,
	}: {
		cacheFile: string;
		cacheKiller: string;
		cacheScope: string;
	}): void;

	export function stop(): void;
}

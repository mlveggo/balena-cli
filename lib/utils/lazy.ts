/* eslint-disable no-restricted-imports */
/** the import blacklist is to enforce lazy loading so exempt this file  */
/*
Copyright 2020 Balena

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import type { Chalk } from 'chalk';

// Equivalent of _.once but avoiding the need to import lodash for lazy deps
const once = <T>(fn: () => T) => {
	let cached: T;
	return (): T => {
		if (!cached) {
			cached = fn();
		}
		return cached;
	};
};

export const onceAsync = <T>(fn: () => Promise<T>) => {
	let cached: T;
	return async (): Promise<T> => {
		if (!cached) {
			cached = await fn();
		}
		return cached;
	};
};

export const getBalenaSdk = once(async () => {
	const { fromSharedOptions } = await import('balena-sdk');
	return fromSharedOptions();
});

export const getVisuals = once(async () => await import('resin-cli-visuals'));

export const getChalk = once(async () => (await import('chalk')) as Chalk);

export const getCliForm = once(async () => await import('resin-cli-form'));

export const getCliUx = once(
	async () => await import('@oclif/core/lib/cli-ux'),
);

// Directly export stripIndent as we always use it immediately, but importing just `stripIndent` reduces startup time
import sI = require('common-tags/lib/stripIndent');
export { sI as stripIndent };

/**
 * @license
 * Copyright 2023 Balena Ltd.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import Dockerode = require('dockerode');
import { BuiltImage } from './compose-types';
import { ExpectedError } from '../errors';
import { stripIndent } from './lazy';
import { promises as fs } from 'fs';
import * as path from 'path';

// TODO: Document everything here! And consider moving them to some existing
//       file where they'd make more sense. During prototyping, I am trying to
//       keep significant amounts of added code separate of everything else, but
//       this may not be the best idea for the real implementation.

export function tagImagesWithArch(
	docker: Dockerode,
	builtImages: BuiltImage[],
	arch: string,
): Promise<any[]> {
	return Promise.all(
		builtImages.map((builtImage) => {
			const image = docker.getImage(builtImage.name);
			return image.tag({ repo: builtImage.name, tag: `${arch}` });
		}),
	);
}

// TODO: We should probably query for this info (for reference, I got these
// values via `balena devices supported`, so we should be able to them the same
// way -- whatever way this is).
//
// TODO: And then I guess we can used something like `once` (from `lazy.ts`) to
// cache the result.
export function isArchTag(tag?: string): boolean {
	return (
		tag !== undefined &&
		['aarch64', 'armv7hf', 'amd64', 'i386', 'rpi'].includes(tag)
	);
}

// TODO: Just a dummy for now, should check with the API. This is the convention
// I am using for now, though. A multi-arch fleet must be called like
// `name-arch1-arch2-archn-ma`. The `-ma` suffix identifies it as multi-arch.
export function isFleetMultiArch(fleet?: string): boolean {
	return fleet != null && fleet.endsWith('-ma');
}

// Ensures the project at `projectPath` can be built as a multi-arch project (as
// far as having the proper build files in it). Throws if it isn't.
// TODO: Name isn't great.
export async function ensureCanBuildProjectAsMultiArch(
	projectPath: string,
): Promise<void> {
	const files = await fs.readdir(projectPath);
	let okFound = false;

	for (const file of files) {
		const fullFilePath = path.join(projectPath, file);

		if (/^(Dockerfile|docker-compose.ya?ml|package.json)$/.test(file)) {
			// These are always valid as multi-arch build files.
			okFound = true;
		} else if (file === 'Dockerfile.template') {
			// A generic template is fine as long as it doesn't use any
			// device-type-specific constructs.
			const contents = await fs.readFile(fullFilePath);

			// TODO: We could accept it in comments. Very corner-casey, very low
			// gain-to-effort ratio, though.
			const containsMachineName = contents.includes('%%BALENA_MACHINE_NAME%%');

			if (containsMachineName) {
				throw new ExpectedError(stripIndent`
					Error: The "${fullFilePath}" file uses the "%%BALENA_MACHINE_NAME%%"
					build variable, which is not allowed in multi-arch builds.
				`);
			} else {
				okFound = true;
			}
		} else {
			const matches = /^Dockerfile\.(\S+)$/.exec(file);
			if (matches && !isArchTag(matches[1])) {
				throw new ExpectedError(stripIndent`
					Error: Only the "Dockerfile.template" and "Dockerfile.<arch>"
					template variants are compatible with multi-arch builds. Your
					project includes the "${fullFilePath}" file,
					where "${matches[1]}" is not recognized as a valid architecture.
				`);
			}
		}
	}

	if (!okFound) {
		throw new ExpectedError(stripIndent`
			Error: no "Dockerfile", architecture-specific "Dockerfile.*",
			"docker-compose.yml", or "package.json" file found in source folder
			"${projectPath}".
		`);
	}
}

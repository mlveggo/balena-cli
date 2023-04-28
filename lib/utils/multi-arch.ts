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

import { BuiltImage } from './compose-types';
import Dockerode = require('dockerode');

// TODO: Document everything here!

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
export function isArchTag(tag?: string): boolean {
	return (
		tag !== undefined &&
		['aarch64', 'armv7hf', 'amd64', 'i386', 'rpi'].includes(tag)
	);
}

// TODO: Just a dummy for now, should check with the API.
export function isFleetMultiArch(fleet?: string): boolean {
	return fleet != null && fleet.endsWith('-ma');
}

/**
 * @license
 * Copyright 2016-2020 Balena Ltd.
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

import { Flags, Args } from '@oclif/core';
import Command from '../../command';
import * as cf from '../../utils/common-flags';
import { stripIndent } from '../../utils/lazy';

export default class OsVersionsCmd extends Command {
	public static description = stripIndent`
		Show available balenaOS versions for the given device type.

		Show the available balenaOS versions for the given device type.
		Check available types with \`balena devices supported\`.

		balenaOS ESR versions can be listed with the '--esr' option. See also:
		https://www.balena.io/docs/reference/OS/extended-support-release/
	`;

	public static examples = ['$ balena os versions raspberrypi3'];

	public static args = {
		type: Args.string({
			description: 'device type',
			required: true,
		}),
	};

	public static usage = 'os versions <type>';

	public static flags = {
		help: cf.help,
		esr: Flags.boolean({
			description: 'select balenaOS ESR versions',
			default: false,
		}),
	};

	public async run() {
		const { args: params, flags: options } = await this.parse(OsVersionsCmd);

		const { formatOsVersion, getOsVersions } = await import(
			'../../utils/cloud'
		);
		const vs = await getOsVersions(params.type, !!options.esr);

		console.log(vs.map((v) => formatOsVersion(v)).join('\n'));
	}
}

/**
 * @license
 * Copyright 2017-2021 Balena Ltd.
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

import type { Renderer } from './compose_ts';
import type * as SDK from 'balena-sdk';
import type Dockerode = require('dockerode');
import * as path from 'path';
import type { Composition, ImageDescriptor } from '@balena/compose/dist/parse';
import type {
	BuiltImage,
	ComposeOpts,
	ComposeProject,
	Release,
	TaggedImage,
} from './compose-types';
import { getChalk } from './lazy';
import Logger = require('./logger');
import { ProgressCallback } from 'docker-progress';
import { ResolvableReturnType } from 'balena-sdk/typings/utils';

export async function generateOpts(options: {
	source?: string;
	projectName?: string;
	nologs: boolean;
	'noconvert-eol': boolean;
	dockerfile?: string;
	'multi-dockerignore': boolean;
	'noparent-check': boolean;
}): Promise<ComposeOpts> {
	const fs = await import('fs');
	return fs.promises.realpath(options.source || '.').then((projectPath) => ({
		projectName: options.projectName,
		projectPath,
		inlineLogs: !options.nologs,
		convertEol: !options['noconvert-eol'],
		dockerfilePath: options.dockerfile,
		multiDockerignore: !!options['multi-dockerignore'],
		noParentCheck: options['noparent-check'],
	}));
}

/** Parse the given composition and return a structure with info. Input is:
 * - composePath: the *absolute* path to the directory containing the compose file
 *  - composeStr: the contents of the compose file, as a string
 */
export async function createProject(
	composePath: string,
	composeStr: string,
	projectName = '',
	imageTag = '',
): Promise<ComposeProject> {
	// both methods below may throw.
	const yml = await import('js-yaml');
	const compose = await import('@balena/compose/dist/parse');
	const rawComposition = yml.load(composeStr);
	const composition = compose.normalize(rawComposition);

	projectName ||= path.basename(composePath);

	const descriptors = await Promise.all(
		compose.parse(composition).map(async function (descr) {
			// generate an image name based on the project and service names
			// if one is not given and the service requires a build
			if (
				typeof descr.image !== 'string' &&
				descr.image.context != null &&
				descr.image.tag == null
			) {
				const { makeImageName } = await import('./compose_ts');
				descr.image.tag = makeImageName(
					projectName,
					descr.serviceName,
					imageTag,
				);
			}
			return descr;
		}),
	);
	return {
		path: composePath,
		name: projectName,
		composition,
		descriptors,
	};
}

export const createRelease = async function (
	apiEndpoint: string,
	auth: string,
	userId: number,
	appId: number,
	composition: Composition,
	draft: boolean,
	semver?: string,
	contract?: string,
): Promise<Release> {
	const _ = await import('lodash');
	const crypto = await import('crypto');
	const releaseMod = await import('@balena/compose/dist/release');
	const client = releaseMod.createClient({ apiEndpoint, auth });

	const { release, serviceImages } = await releaseMod.create({
		client,
		user: userId,
		application: appId,
		composition,
		source: 'local',
		commit: crypto.pseudoRandomBytes(16).toString('hex').toLowerCase(),
		semver,
		is_final: !draft,
		contract,
	});

	return {
		client,
		release: _.pick(release, [
			'id',
			'status',
			'commit',
			'composition',
			'source',
			'is_final',
			'contract',
			'semver',
			'start_timestamp',
			'end_timestamp',
		]),
		serviceImages: _.mapValues(
			serviceImages,
			(serviceImage) =>
				_.omit(serviceImage, [
					'created_at',
					'is_a_build_of__service',
					'__metadata',
				]) as Omit<
					typeof serviceImage,
					'created_at' | 'is_a_build_of__service' | '__metadata'
				>,
		),
	};
};

export const tagServiceImages = (
	docker: Dockerode,
	images: BuiltImage[],
	serviceImages: Release['serviceImages'],
): Promise<TaggedImage[]> =>
	Promise.all(
		images.map(function (d) {
			const serviceImage = serviceImages[d.serviceName];
			const imageName = serviceImage.is_stored_at__image_location;
			const match = /(.*?)\/(.*?)(?::([^/]*))?$/.exec(imageName);
			if (match == null) {
				throw new Error(`Could not parse imageName: '${imageName}'`);
			}
			const [, registry, repo, tag = 'latest'] = match;
			const name = `${registry}/${repo}`;
			return docker
				.getImage(d.name)
				.tag({ repo: name, tag, force: true })
				.then(() => docker.getImage(`${name}:${tag}`))
				.then((localImage) => ({
					serviceName: d.serviceName,
					serviceImage,
					localImage,
					registry,
					repo,
					logs: d.logs,
					props: d.props,
				}));
		}),
	);

export const getPreviousRepos = async (
	sdk: SDK.BalenaSDK,
	logger: Logger,
	appID: number,
): Promise<string[]> => {
	try {
		const release = await sdk.pine.get<SDK.Release>({
			resource: 'release',
			options: {
				$select: 'id',
				$filter: {
					belongs_to__application: appID,
					status: 'success',
				},
				$expand: {
					contains__image: {
						$select: 'image',
						$expand: { image: { $select: 'is_stored_at__image_location' } },
					},
				},
				$orderby: 'id desc',
				$top: 1,
			},
		});
		// grab all images from the latest release, return all image locations in the registry
		if (release.length > 0) {
			const images = release[0].contains__image as Array<{
				image: [SDK.Image];
			}>;
			const { getRegistryAndName } = await import(
				'@balena/compose/dist/multibuild'
			);
			return Promise.all(
				images.map(function (d) {
					const imageName = d.image[0].is_stored_at__image_location || '';
					const registry = getRegistryAndName(imageName);
					logger.logDebug(
						`Requesting access to previously pushed image repo (${registry.imageName})`,
					);
					return registry.imageName;
				}),
			);
		} else {
			return [];
		}
	} catch (e) {
		logger.logDebug(`Failed to access previously pushed image repo: ${e}`);
		return [];
	}
};

export const authorizePush = function (
	sdk: SDK.BalenaSDK,
	tokenAuthEndpoint: string,
	registry: string,
	images: string[],
	previousRepos: string[],
): Promise<string> {
	if (!Array.isArray(images)) {
		images = [images];
	}

	images.push(...previousRepos);
	return sdk.request
		.send({
			baseUrl: tokenAuthEndpoint,
			url: '/auth/v1/token',
			qs: {
				service: registry,
				scope: images.map((repo) => `repository:${repo}:pull,push`),
			},
		})
		.then(({ body }) => body.token)
		.catch(() => '');
};

// utilities

const renderProgressBar = async function (
	percentage: number,
	stepCount: number,
) {
	const _ = await import('lodash');
	percentage = _.clamp(percentage, 0, 100);
	const barCount = Math.floor((stepCount * percentage) / 100);
	const spaceCount = stepCount - barCount;
	const bar = `[${_.repeat('=', barCount)}>${_.repeat(' ', spaceCount)}]`;
	return `${bar} ${_.padStart(`${percentage}`, 3)}%`;
};

export const pushProgressRenderer = function (
	tty: ResolvableReturnType<typeof import('./tty')>,
	prefix: string,
): ProgressCallback & { end: () => void } {
	const fn: ProgressCallback & { end: () => void } = async function (e) {
		const { error, percentage } = e;
		if (error != null) {
			throw new Error(error);
		}
		const bar = await renderProgressBar(percentage, 40);
		return tty.replaceLine(`${prefix}${bar}\r`);
	};
	fn.end = async () => {
		tty.clearLine();
	};
	return fn;
};

export class BuildProgressUI implements Renderer {
	public streams;
	private _prefix;
	private _prefixWidth;
	private _tty;
	private _services;
	private _startTime: undefined | number;
	private _ended;
	private _serviceToDataMap: Dictionary<{
		status?: string;
		progress?: number;
		error?: Error;
	}> = {};
	private _cancelled;
	private _spinner;
	private _runloop:
		| undefined
		| ReturnType<typeof import('./compose_ts').createRunLoop>;

	// these are to handle window wrapping
	private _maxLineWidth: undefined | number;
	private _lineWidths: number[] = [];

	constructor(
		_: typeof import('lodash'),
		through: typeof import('through2'),
		_spinner: typeof import('./compose_ts'),
		chalk: ResolvableReturnType<typeof getChalk>,
		tty: ResolvableReturnType<typeof import('./tty')>,
		descriptors: ImageDescriptor[],
	) {
		this._handleEvent = this._handleEvent.bind(this);
		this.start = this.start.bind(this);
		this.end = this.end.bind(this);
		this._display = this._display.bind(this);

		const eventHandler = this._handleEvent;
		const services = _.map(descriptors, 'serviceName');

		const streams = _(services)
			.map(function (service) {
				const stream = through.obj(function (event, _enc, cb) {
					eventHandler(service, event);
					return cb();
				});
				stream.pipe(tty.stream, { end: false });
				return [service, stream];
			})
			.fromPairs()
			.value();

		this._tty = tty;
		this._services = services;

		// Logger magically prefixes the log line with [Build] etc., but it doesn't
		// work well with the spinner we're also showing. Manually build the prefix
		// here and bypass the logger.
		const prefix = chalk.blue('[Build]') + '   ';

		const offset = 10; // account for escape sequences inserted for colouring
		this._prefixWidth =
			offset + prefix.length + _.max(_.map(services, (s) => s.length))!;
		this._prefix = prefix;

		this._ended = false;
		this._cancelled = false;
		this._spinner = _spinner.createSpinner();

		this.streams = streams;
	}

	public static CreateBuildProgressUI = async (
		tty: ResolvableReturnType<typeof import('./tty')>,
		descriptors: ImageDescriptor[],
	) => {
		const _ = await import('lodash');
		const through = await import('through2');
		const _spinner = await import('./compose_ts');
		const chalk = await getChalk();
		return new BuildProgressUI(_, through, _spinner, chalk, tty, descriptors);
	};

	_handleEvent(
		service: string,
		event: { status?: string; progress?: number; error?: Error },
	) {
		this._serviceToDataMap[service] = event;
	}

	async start() {
		this._tty.hideCursor();
		this._services.forEach((service) => {
			this.streams[service].write({ status: 'Preparing...' });
		});
		this._runloop = (await import('./compose_ts')).createRunLoop(this._display);
		this._startTime = Date.now();
	}

	async end(summary?: Dictionary<string>) {
		if (this._ended) {
			return;
		}
		this._ended = true;
		this._runloop?.end();
		this._runloop = undefined;

		this._clear();
		await this._renderStatus(true);
		await this._renderSummary(summary ?? (await this._getServiceSummary()));
		this._tty.showCursor();
	}

	async _display() {
		this._clear();
		await this._renderStatus();
		await this._renderSummary(await this._getServiceSummary());
		this._tty.cursorUp(this._services.length + 1); // for status line
	}

	_clear() {
		this._tty.deleteToEnd();
		this._maxLineWidth = this._tty.currentWindowSize().width;
	}

	async _getServiceSummary() {
		const _ = await import('lodash');

		const services = this._services;
		const serviceToDataMap = this._serviceToDataMap;

		return _(services)
			.map(async function (service) {
				const { status, progress, error } = serviceToDataMap[service] ?? {};
				if (error) {
					return `${error}`;
				} else if (progress) {
					const bar = await renderProgressBar(progress, 20);
					if (status) {
						return `${bar} ${status}`;
					}
					return `${bar}`;
				} else if (status) {
					return `${status}`;
				} else {
					return 'Waiting...';
				}
			})
			.map((data, index) => [services[index], data])
			.fromPairs()
			.value();
	}

	async _renderStatus(end = false) {
		const moment = await import('moment');
		const momentDurationFormatSetup = await import('moment-duration-format');
		momentDurationFormatSetup(moment);

		this._tty.clearLine();
		this._tty.write(this._prefix);
		if (end && this._cancelled) {
			this._tty.writeLine('Build cancelled');
		} else if (end) {
			const serviceCount = this._services.length;
			const serviceStr =
				serviceCount === 1 ? '1 service' : `${serviceCount} services`;
			const durationStr =
				this._startTime == null
					? 'unknown time'
					: moment
							.duration(
								Math.floor((Date.now() - this._startTime) / 1000),
								'seconds',
							)
							.format();
			this._tty.writeLine(`Built ${serviceStr} in ${durationStr}`);
		} else {
			this._tty.writeLine(`Building services... ${this._spinner()}`);
		}
	}

	async _renderSummary(serviceToStrMap: Dictionary<string>) {
		const _ = await import('lodash');
		const chalk = await getChalk();
		const truncate = await import('cli-truncate');
		const strlen = await import('string-width');

		this._services.forEach((service, index) => {
			let str = _.padEnd(this._prefix + chalk.bold(service), this._prefixWidth);
			str += serviceToStrMap[service];
			if (this._maxLineWidth != null) {
				str = truncate(str, this._maxLineWidth);
			}
			this._lineWidths[index] = strlen(str);

			this._tty.clearLine();
			this._tty.writeLine(str);
		});
	}
}

export class BuildProgressInline implements Renderer {
	public streams;
	private _prefixWidth;
	private _outStream;
	private _services;
	private _startTime: number | undefined;
	private _ended;

	constructor(
		_: typeof import('lodash'),
		through: typeof import('through2'),
		chalk: ResolvableReturnType<typeof getChalk>,
		outStream: NodeJS.ReadWriteStream,
		descriptors: Array<{ serviceName: string }>,
	) {
		this.start = this.start.bind(this);
		this.end = this.end.bind(this);
		this._renderEvent = this._renderEvent.bind(this);

		const services = _.map(descriptors, 'serviceName');
		const eventHandler = this._renderEvent;
		const streams = _(services)
			.map(function (service) {
				const stream = through.obj(function (event, _enc, cb) {
					eventHandler(_, chalk, service, event);
					return cb();
				});
				stream.pipe(outStream, { end: false });
				return [service, stream];
			})
			.fromPairs()
			.value();

		const offset = 10; // account for escape sequences inserted for colouring
		this._prefixWidth = offset + _.max(_.map(services, (s) => s.length))!;
		this._outStream = outStream;
		this._services = services;
		this._ended = false;

		this.streams = streams;
	}

	public static CreateBuildProgressInline = async (
		outStream: NodeJS.ReadWriteStream,
		descriptors: Array<{ serviceName: string }>,
	) => {
		const _ = await import('lodash');
		const through = await import('through2');
		const chalk = await getChalk();
		return new BuildProgressInline(_, through, chalk, outStream, descriptors);
	};

	start() {
		this._outStream.write('Building services...\n');
		this._services.forEach((service) => {
			this.streams[service].write({ status: 'Preparing...' });
		});
		this._startTime = Date.now();
	}

	async end(summary?: Dictionary<string>) {
		const _ = await import('lodash');
		const moment = await import('moment');
		const chalk = await getChalk();
		const momentDurationFormatSetup = await import('moment-duration-format');
		momentDurationFormatSetup(moment);

		if (this._ended) {
			return;
		}
		this._ended = true;

		if (summary != null) {
			this._services.forEach(async (service) => {
				this._renderEvent(_, chalk, service, { status: summary[service] });
			});
		}

		const serviceCount = this._services.length;
		const serviceStr =
			serviceCount === 1 ? '1 service' : `${serviceCount} services`;
		const durationStr =
			this._startTime == null
				? 'unknown time'
				: moment
						.duration(
							Math.floor((Date.now() - this._startTime) / 1000),
							'seconds',
						)
						.format();
		this._outStream.write(`Built ${serviceStr} in ${durationStr}\n`);
	}

	_renderEvent(
		_: typeof import('lodash'),
		chalk: ResolvableReturnType<typeof getChalk>,
		service: string,
		event: { status?: string; error?: Error },
	) {
		const str = (function () {
			const { status, error } = event;
			if (error) {
				return `${error}`;
			} else if (status) {
				return `${status}`;
			} else {
				return 'Waiting...';
			}
		})();

		const prefix = _.padEnd(chalk.bold(service), this._prefixWidth);
		this._outStream.write(prefix);
		this._outStream.write(str);
		this._outStream.write('\n');
	}
}

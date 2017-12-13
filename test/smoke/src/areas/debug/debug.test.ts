/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import * as stripJsonComments from 'strip-json-comments';
import { SpectronApplication, Quality } from '../../spectron/application';

export function setup() {
	describe('Debug', () => {
		let skip = false;

		before(async function () {
			const app = this.app as SpectronApplication;

			if (app.quality === Quality.Dev) {
				const extensionsPath = path.join(os.homedir(), '.vscode-oss-dev', 'extensions');

				const debugPath = path.join(extensionsPath, 'vscode-node-debug');
				const debugExists = fs.existsSync(debugPath);

				const debug2Path = path.join(extensionsPath, 'vscode-node-debug2');
				const debug2Exists = fs.existsSync(debug2Path);

				if (!debugExists) {
					console.warn(`Skipping debug tests because vscode-node-debug extension was not found in ${extensionsPath}`);
					skip = true;
					return;
				}

				if (!debug2Exists) {
					console.warn(`Skipping debug tests because vscode-node-debug2 extension was not found in ${extensionsPath}`);
					skip = true;
					return;
				}

				await new Promise((c, e) => fs.symlink(debugPath, path.join(app.extensionsPath, 'vscode-node-debug'), err => err ? e(err) : c()));
				await new Promise((c, e) => fs.symlink(debug2Path, path.join(app.extensionsPath, 'vscode-node-debug2'), err => err ? e(err) : c()));
				await app.reload();
			}

			this.app.suiteName = 'Debug';
		});

		it('configure launch json', async function () {
			if (skip) {
				this.skip();
				return;
			}

			const app = this.app as SpectronApplication;

			await app.workbench.debug.openDebugViewlet();
			await app.workbench.quickopen.openFile('app.js');
			await app.workbench.debug.configure();

			const launchJsonPath = path.join(app.workspacePath, '.vscode', 'launch.json');
			const content = fs.readFileSync(launchJsonPath, 'utf8');
			const config = JSON.parse(stripJsonComments(content));
			config.configurations[0].protocol = 'inspector';
			fs.writeFileSync(launchJsonPath, JSON.stringify(config, undefined, 4), 'utf8');

			await app.workbench.editor.waitForEditorContents('launch.json', contents => /"protocol": "inspector"/.test(contents));
			await app.screenCapturer.capture('launch.json file');

			assert.equal(config.configurations[0].request, 'launch');
			assert.equal(config.configurations[0].type, 'node');
			if (process.platform === 'win32') {
				assert.equal(config.configurations[0].program, '${workspaceFolder}\\bin\\www');
			} else {
				assert.equal(config.configurations[0].program, '${workspaceFolder}/bin/www');
			}
		});

		it('breakpoints', async function () {
			if (skip) {
				this.skip();
				return;
			}

			const app = this.app as SpectronApplication;

			await app.workbench.quickopen.openFile('index.js');
			await app.workbench.debug.setBreakpointOnLine(6);
			await app.screenCapturer.capture('breakpoints are set');
		});

		let port: number;
		it('start debugging', async function () {
			if (skip) {
				this.skip();
				return;
			}

			const app = this.app as SpectronApplication;

			port = await app.workbench.debug.startDebugging();
			await app.screenCapturer.capture('debugging has started');

			await new Promise((c, e) => {
				const request = http.get(`http://localhost:${port}`);
				request.on('error', e);
				app.workbench.debug.waitForStackFrame(sf => sf.name === 'index.js' && sf.lineNumber === 6, 'looking for index.js and line 6').then(c, e);
			});

			await app.screenCapturer.capture('debugging is paused');
		});

		it('focus stack frames and variables', async function () {
			if (skip) {
				this.skip();
				return;
			}

			const app = this.app as SpectronApplication;

			await app.client.waitFor(() => app.workbench.debug.getLocalVariableCount(), c => c === 4, 'there should be 4 local variables');

			await app.workbench.debug.focusStackFrame('layer.js', 'looking for layer.js');
			await app.client.waitFor(() => app.workbench.debug.getLocalVariableCount(), c => c === 5, 'there should be 5 local variables');

			await app.workbench.debug.focusStackFrame('route.js', 'looking for route.js');
			await app.client.waitFor(() => app.workbench.debug.getLocalVariableCount(), c => c === 3, 'there should be 3 local variables');

			await app.workbench.debug.focusStackFrame('index.js', 'looking for index.js');
			await app.client.waitFor(() => app.workbench.debug.getLocalVariableCount(), c => c === 4, 'there should be 4 local variables');
		});

		it('stepOver, stepIn, stepOut', async function () {
			if (skip) {
				this.skip();
				return;
			}

			const app = this.app as SpectronApplication;

			await app.workbench.debug.stepIn();
			await app.screenCapturer.capture('debugging has stepped in');

			const first = await app.workbench.debug.waitForStackFrame(sf => sf.name === 'response.js', 'looking for response.js');
			await app.workbench.debug.stepOver();
			await app.screenCapturer.capture('debugging has stepped over');

			await app.workbench.debug.waitForStackFrame(sf => sf.name === 'response.js' && sf.lineNumber === first.lineNumber + 1, `looking for response.js and line ${first.lineNumber + 1}`);
			await app.workbench.debug.stepOut();
			await app.screenCapturer.capture('debugging has stepped out');

			await app.workbench.debug.waitForStackFrame(sf => sf.name === 'index.js' && sf.lineNumber === 7, `looking for index.js and line 7`);
		});

		it('continue', async function () {
			if (skip) {
				this.skip();
				return;
			}

			const app = this.app as SpectronApplication;

			await app.workbench.debug.continue();
			await app.screenCapturer.capture('debugging has continued');

			await new Promise((c, e) => {
				const request = http.get(`http://localhost:${port}`);
				request.on('error', e);
				app.workbench.debug.waitForStackFrame(sf => sf.name === 'index.js' && sf.lineNumber === 6, `looking for index.js and line 6`).then(c, e);
			});

			await app.screenCapturer.capture('debugging is paused');
		});

		it('debug console', async function () {
			if (skip) {
				this.skip();
				return;
			}

			const app = this.app as SpectronApplication;

			await app.workbench.debug.waitForReplCommand('2 + 2', r => r === '4');
		});

		it('stop debugging', async function () {
			if (skip) {
				this.skip();
				return;
			}

			const app = this.app as SpectronApplication;

			await app.workbench.debug.stopDebugging();
			await app.screenCapturer.capture('debugging has stopped');
		});
	});
}
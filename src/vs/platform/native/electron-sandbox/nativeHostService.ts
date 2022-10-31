/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ProxyChannel } from 'vs/base/parts/ipc/common/ipc';
import { IMainProcessService } from 'vs/platform/ipc/electron-sandbox/services';
import { INativeHostService } from 'vs/platform/native/electron-sandbox/native';

// @ts-ignore: interface is implemented via proxy
export class NativeHostService implements INativeHostService {

	declare readonly $serviceBrand: undefined;

	constructor(
		readonly windowId: number,
		@IMainProcessService mainProcessService: IMainProcessService
	) {
		return ProxyChannel.toService<INativeHostService>(mainProcessService.getChannel('nativeHost'), {
			context: windowId,
			properties: (() => {
				const properties = new Map<string, unknown>();
				properties.set('windowId', windowId);

				return properties;
			})()
		});
	}
}

/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { mark } from 'vs/base/common/performance';
import { domContentLoaded, detectFullscreen, getCookieValue, WebFileSystemAccess } from 'vs/base/browser/dom';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { ILogService, ConsoleLogger, MultiplexLogService, getLogLevel } from 'vs/platform/log/common/log';
import { ConsoleLogInAutomationLogger } from 'vs/platform/log/browser/log';
import { Disposable, DisposableStore, toDisposable } from 'vs/base/common/lifecycle';
import { BrowserWorkbenchEnvironmentService } from 'vs/workbench/services/environment/browser/environmentService';
import { Workbench } from 'vs/workbench/browser/workbench';
import { RemoteFileSystemProvider } from 'vs/workbench/services/remote/common/remoteAgentFileSystemChannel';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IProductService } from 'vs/platform/product/common/productService';
import product from 'vs/platform/product/common/product';
import { RemoteAgentService } from 'vs/workbench/services/remote/browser/remoteAgentServiceImpl';
import { RemoteAuthorityResolverService } from 'vs/platform/remote/browser/remoteAuthorityResolverService';
import { IRemoteAuthorityResolverService } from 'vs/platform/remote/common/remoteAuthorityResolver';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';
import { IFileService } from 'vs/platform/files/common/files';
import { FileService } from 'vs/platform/files/common/fileService';
import { Schemas } from 'vs/base/common/network';
import { IWorkspaceContextService, toWorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import { IWorkbenchConfigurationService } from 'vs/workbench/services/configuration/common/configuration';
import { onUnexpectedError } from 'vs/base/common/errors';
import { setFullscreen } from 'vs/base/browser/browser';
import { encodePath, URI } from 'vs/base/common/uri';
import { isRecentFolder, IWorkspaceInitializationPayload, IWorkspacesService } from 'vs/platform/workspaces/common/workspaces';
import { WorkspaceService } from 'vs/workbench/services/configuration/browser/configurationService';
import { ConfigurationCache } from 'vs/workbench/services/configuration/common/configurationCache';
import { ISignService } from 'vs/platform/sign/common/sign';
import { SignService } from 'vs/platform/sign/browser/signService';
import type { IWorkbenchConstructionOptions, IWorkspace, IWorkbench } from 'vs/workbench/workbench.web.api';
import { BrowserStorageService } from 'vs/platform/storage/browser/storageService';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { BufferLogService } from 'vs/platform/log/common/bufferLog';
import { FileLogger } from 'vs/platform/log/common/fileLog';
import { toLocalISOString } from 'vs/base/common/date';
import { isWorkspaceToOpen, isFolderToOpen } from 'vs/platform/windows/common/windows';
import { getSingleFolderWorkspaceIdentifier, getWorkspaceIdentifier } from 'vs/workbench/services/workspaces/browser/workspaces';
import { coalesce } from 'vs/base/common/arrays';
import { InMemoryFileSystemProvider } from 'vs/platform/files/common/inMemoryFilesystemProvider';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IndexedDBFileSystemProvider } from 'vs/platform/files/browser/indexedDBFileSystemProvider';
import { BrowserRequestService } from 'vs/workbench/services/request/browser/requestService';
import { IRequestService } from 'vs/platform/request/common/request';
import { IUserDataInitializationService, UserDataInitializationService } from 'vs/workbench/services/userData/browser/userDataInit';
import { UserDataSyncStoreManagementService } from 'vs/platform/userDataSync/common/userDataSyncStoreService';
import { IUserDataSyncStoreManagementService } from 'vs/platform/userDataSync/common/userDataSync';
import { ILifecycleService } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { Action2, MenuId, registerAction2 } from 'vs/platform/actions/common/actions';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { localize } from 'vs/nls';
import { CATEGORIES } from 'vs/workbench/common/actions';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { IHostService } from 'vs/workbench/services/host/browser/host';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { UriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentityService';
import { BrowserWindow } from 'vs/workbench/browser/window';
import { ITimerService } from 'vs/workbench/services/timer/browser/timerService';
import { WorkspaceTrustEnablementService, WorkspaceTrustManagementService } from 'vs/workbench/services/workspaces/common/workspaceTrust';
import { IWorkspaceTrustEnablementService, IWorkspaceTrustManagementService } from 'vs/platform/workspace/common/workspaceTrust';
import { HTMLFileSystemProvider } from 'vs/platform/files/browser/htmlFileSystemProvider';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { safeStringify } from 'vs/base/common/objects';
import { ICredentialsService } from 'vs/workbench/services/credentials/common/credentials';
import { IndexedDB } from 'vs/base/browser/indexedDB';
import { CodeServerClientAdditions } from 'vs/workbench/browser/client';
import { BrowserWorkspacesService } from 'vs/workbench/services/workspaces/browser/workspacesService';

class BrowserMain extends Disposable {

	private readonly onWillShutdownDisposables = this._register(new DisposableStore());

	constructor(
		private readonly domElement: HTMLElement,
		private readonly configuration: IWorkbenchConstructionOptions
	) {
		super();

		this.init();
	}

	private init(): void {

		// Browser config
		setFullscreen(!!detectFullscreen());
	}

	async open(): Promise<IWorkbench> {

		// Init services and wait for DOM to be ready in parallel
		const [services] = await Promise.all([this.initServices(), domContentLoaded()]);

		// Create Workbench
		const workbench = new Workbench(this.domElement, undefined, services.serviceCollection, services.logService);

		// Listeners
		this.registerListeners(workbench, services.storageService, services.logService);

		// Startup
		const instantiationService = workbench.startup();

		/** @coder Initialize our own client-side additions. */
		if (!this.configuration.productConfiguration) {
			throw new Error('`productConfiguration` not present in workbench config');
		}

		const codeServerClientAdditions = this._register(instantiationService.createInstance(CodeServerClientAdditions, this.configuration.productConfiguration));

		await codeServerClientAdditions.startup();

		// Window
		this._register(instantiationService.createInstance(BrowserWindow));

		// Logging
		services.logService.trace('workbench configuration', safeStringify(this.configuration));

		// Return API Facade
		return instantiationService.invokeFunction(accessor => {
			const commandService = accessor.get(ICommandService);
			const lifecycleService = accessor.get(ILifecycleService);
			const timerService = accessor.get(ITimerService);
			const openerService = accessor.get(IOpenerService);
			const productService = accessor.get(IProductService);

			return {
				commands: {
					executeCommand: (command, ...args) => commandService.executeCommand(command, ...args)
				},
				env: {
					uriScheme: productService.urlProtocol,
					async retrievePerformanceMarks() {
						await timerService.whenReady();

						return timerService.getPerformanceMarks();
					},
					async openUri(uri: URI): Promise<boolean> {
						return openerService.open(uri, {});
					}
				},
				shutdown: () => lifecycleService.shutdown()
			};
		});
	}

	private registerListeners(workbench: Workbench, storageService: BrowserStorageService, logService: ILogService): void {

		// Workbench Lifecycle
		this._register(workbench.onWillShutdown(() => this.onWillShutdownDisposables.clear()));
		this._register(workbench.onDidShutdown(() => this.dispose()));
	}

	private async initServices(): Promise<{ serviceCollection: ServiceCollection, configurationService: IWorkbenchConfigurationService, logService: ILogService, storageService: BrowserStorageService }> {
		const serviceCollection = new ServiceCollection();

		// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
		// NOTE: DO NOT ADD ANY OTHER SERVICE INTO THE COLLECTION HERE.
		// CONTRIBUTE IT VIA WORKBENCH.WEB.MAIN.TS AND registerSingleton().
		// !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

		const payload = this.resolveWorkspaceInitializationPayload();

		// Product
		const productService: IProductService = { _serviceBrand: undefined, ...product, ...this.configuration.productConfiguration };
		serviceCollection.set(IProductService, productService);

		// Environment
		const logsPath = URI.file(toLocalISOString(new Date()).replace(/-|:|\.\d+Z$/g, '')).with({ scheme: 'vscode-log' });
		const environmentService = new BrowserWorkbenchEnvironmentService({ workspaceId: payload.id, logsPath, ...this.configuration }, productService);
		serviceCollection.set(IWorkbenchEnvironmentService, environmentService);

		// Log
		const logService = new BufferLogService(getLogLevel(environmentService));
		serviceCollection.set(ILogService, logService);

		// Remote
		const connectionToken = environmentService.options.connectionToken || getCookieValue('vscode-tkn');
		const remoteAuthorityResolverService = new RemoteAuthorityResolverService(connectionToken, this.configuration.resourceUriProvider);
		serviceCollection.set(IRemoteAuthorityResolverService, remoteAuthorityResolverService);

		// Signing
		const signService = new SignService(connectionToken);
		serviceCollection.set(ISignService, signService);

		// Remote Agent
		const remoteAgentService = this._register(new RemoteAgentService(this.configuration.webSocketFactory, environmentService, productService, remoteAuthorityResolverService, signService, logService));
		serviceCollection.set(IRemoteAgentService, remoteAgentService);

		// Files
		const fileService = this._register(new FileService(logService));
		serviceCollection.set(IFileService, fileService);
		await this.registerFileSystemProviders(environmentService, fileService, remoteAgentService, logService, logsPath);

		// URI Identity
		const uriIdentityService = new UriIdentityService(fileService);
		serviceCollection.set(IUriIdentityService, uriIdentityService);

		// Long running services (workspace, config, storage)
		const [configurationService, storageService] = await Promise.all([
			this.createWorkspaceService(payload, environmentService, fileService, remoteAgentService, uriIdentityService, logService).then(service => {

				// Workspace
				serviceCollection.set(IWorkspaceContextService, service);

				// Configuration
				serviceCollection.set(IWorkbenchConfigurationService, service);

				return service;
			}),

			this.createStorageService(payload, logService).then(service => {

				// Storage
				serviceCollection.set(IStorageService, service);

				return service;
			})
		]);

		/**
		 * Added to persist recent workspaces in the browser.
		 * These behaviors may disabled with the `--ignore-last-opened` argument.
		 *
		 * @author coder
		 * @example User specified a directory at startup.
		 * ```sh
		 * code-server ./path/to/project/
		 * ```
		 *
		 * @example Blank project without CLI arguments,
		 * using the last opened directory in the browser.
		 * ```sh
		 * code-server
		 * open http://localhost:8000/
		 * ```
		 *
		 * @example Query params override CLI arguments.
		 * ```sh
		 * code-server ./path/to/project/
		 * open http://localhost:8000/?folder=/path/to/different/project
		 * ```
		*/
		const browserWorkspacesService = new BrowserWorkspacesService(storageService, configurationService, logService, fileService, environmentService, uriIdentityService);
		serviceCollection.set(IWorkspacesService, browserWorkspacesService);
		const workspace = configurationService.getWorkspace();

		logService.debug('Workspace configuration', {
			workspaceFolders: workspace.folders,
			ignoreLastOpened: environmentService.ignoreLastOpened,
		});

		if (workspace.folders.length === 0 && !environmentService.ignoreLastOpened) {
			logService.debug('Workspace is empty. Checking for recent folders...');

			const recentlyOpened = await browserWorkspacesService.getRecentlyOpened();

			for (const recent of recentlyOpened.workspaces) {
				if (isRecentFolder(recent)) {
					logService.debug('Recent folder found...');
					const folder = toWorkspaceFolder(recent.folderUri);
					// Note that the `folders` property should be reassigned instead of pushed into.
					// This property has a setter which updates the workspace's file cache.
					workspace.folders = [folder];


					/**
					 * Opening a folder from the browser navigates to a URL including the folder param.
					 * However, since we're overriding the default state of a blank editor,
					 * we update the URL query param to match this behavior.
					 * This is especially useful when a user wants to share a link to server with a specific folder.
					 *
					 * @see `WorkspaceProvider.createTargetUrl`
					 * @see `WorkspaceProvider.QUERY_PARAM_FOLDER`
					 */
					const nextQueryParam = `?folder=${encodePath(folder.uri.path)}`;
					window.history.replaceState(null, '', nextQueryParam);
					break;
				}
			}
		}

		// Workspace Trust Service
		const workspaceTrustEnablementService = new WorkspaceTrustEnablementService(configurationService, environmentService);
		serviceCollection.set(IWorkspaceTrustEnablementService, workspaceTrustEnablementService);

		const workspaceTrustManagementService = new WorkspaceTrustManagementService(configurationService, remoteAuthorityResolverService, storageService, uriIdentityService, environmentService, configurationService, workspaceTrustEnablementService);
		serviceCollection.set(IWorkspaceTrustManagementService, workspaceTrustManagementService);

		// Update workspace trust so that configuration is updated accordingly
		configurationService.updateWorkspaceTrust(workspaceTrustManagementService.isWorkspaceTrusted());
		this._register(workspaceTrustManagementService.onDidChangeTrust(() => configurationService.updateWorkspaceTrust(workspaceTrustManagementService.isWorkspaceTrusted())));

		// Request Service
		const requestService = new BrowserRequestService(remoteAgentService, configurationService, logService);
		serviceCollection.set(IRequestService, requestService);

		// Userdata Sync Store Management Service
		const userDataSyncStoreManagementService = new UserDataSyncStoreManagementService(productService, configurationService, storageService);
		serviceCollection.set(IUserDataSyncStoreManagementService, userDataSyncStoreManagementService);

		// Userdata Initialize Service
		const userDataInitializationService = new UserDataInitializationService(environmentService, userDataSyncStoreManagementService, fileService, storageService, productService, requestService, logService, uriIdentityService);
		serviceCollection.set(IUserDataInitializationService, userDataInitializationService);

		if (await userDataInitializationService.requiresInitialization()) {
			mark('code/willInitRequiredUserData');

			// Initialize required resources - settings & global state
			await userDataInitializationService.initializeRequiredResources();

			// Important: Reload only local user configuration after initializing
			// Reloading complete configuraiton blocks workbench until remote configuration is loaded.
			await configurationService.reloadLocalUserConfiguration();

			mark('code/didInitRequiredUserData');
		}

		return { serviceCollection, configurationService, logService, storageService };
	}

	private async registerFileSystemProviders(environmentService: IWorkbenchEnvironmentService, fileService: IFileService, remoteAgentService: IRemoteAgentService, logService: BufferLogService, logsPath: URI): Promise<void> {

		// IndexedDB is used for logging and user data
		let indexedDB: IndexedDB | undefined;
		const userDataStore = 'vscode-userdata-store';
		const logsStore = 'vscode-logs-store';
		try {
			indexedDB = await IndexedDB.create('vscode-web-db', 2, [userDataStore, logsStore]);

			// Close onWillShutdown
			this.onWillShutdownDisposables.add(toDisposable(() => indexedDB?.close()));
		} catch (error) {
			logService.error('Error while creating IndexedDB', error);
		}

		// Logger
		if (indexedDB) {
			fileService.registerProvider(logsPath.scheme, new IndexedDBFileSystemProvider(logsPath.scheme, indexedDB, logsStore, false));
		} else {
			fileService.registerProvider(logsPath.scheme, new InMemoryFileSystemProvider());
		}
		logService.logger = new MultiplexLogService(coalesce([
			new ConsoleLogger(logService.getLevel()),
			new FileLogger('window', environmentService.logFile, logService.getLevel(), false, fileService),
			// Extension development test CLI: forward everything to test runner
			environmentService.isExtensionDevelopment && !!environmentService.extensionTestsLocationURI ? new ConsoleLogInAutomationLogger(logService.getLevel()) : undefined
		]));

		// User data
		let userDataProvider;
		if (indexedDB) {
			userDataProvider = new IndexedDBFileSystemProvider(logsPath.scheme, indexedDB, userDataStore, false);
			this.registerDeveloperActions(<IndexedDBFileSystemProvider>userDataProvider);
		} else {
			logService.info('Using in-memory user data provider');
			userDataProvider = new InMemoryFileSystemProvider();
		}
		fileService.registerProvider(Schemas.userData, userDataProvider);

		// Remote file system
		this._register(RemoteFileSystemProvider.register(remoteAgentService, fileService, logService));

		// Local file access (if supported by browser)
		if (WebFileSystemAccess.supported(window)) {
			fileService.registerProvider(Schemas.file, new HTMLFileSystemProvider());
		}

		// In-memory
		fileService.registerProvider(Schemas.tmp, new InMemoryFileSystemProvider());
	}

	private registerDeveloperActions(provider: IndexedDBFileSystemProvider): void {
		registerAction2(class ResetUserDataAction extends Action2 {
			constructor() {
				super({
					id: 'workbench.action.resetUserData',
					title: { original: 'Reset User Data', value: localize('reset', "Reset User Data") },
					category: CATEGORIES.Developer,
					menu: {
						id: MenuId.CommandPalette
					}
				});
			}

			async run(accessor: ServicesAccessor): Promise<void> {
				const dialogService = accessor.get(IDialogService);
				const hostService = accessor.get(IHostService);
				const storageService = accessor.get(IStorageService);
				const credentialsService = accessor.get(ICredentialsService);
				const result = await dialogService.confirm({
					message: localize('reset user data message', "Would you like to reset your data (settings, keybindings, extensions, snippets and UI State) and reload?")
				});

				if (result.confirmed) {
					await provider?.reset();
					if (storageService instanceof BrowserStorageService) {
						await storageService.clear();
					}

					if (credentialsService.clear) {
						await credentialsService.clear();
					}
				}

				hostService.reload();
			}
		});
	}

	private async createStorageService(payload: IWorkspaceInitializationPayload, logService: ILogService): Promise<BrowserStorageService> {
		const storageService = new BrowserStorageService(payload, logService);

		try {
			await storageService.initialize();

			// Register to close on shutdown
			this.onWillShutdownDisposables.add(toDisposable(() => storageService.close()));

			return storageService;
		} catch (error) {
			onUnexpectedError(error);
			logService.error(error);

			return storageService;
		}
	}

	private async createWorkspaceService(payload: IWorkspaceInitializationPayload, environmentService: IWorkbenchEnvironmentService, fileService: FileService, remoteAgentService: IRemoteAgentService, uriIdentityService: IUriIdentityService, logService: ILogService): Promise<WorkspaceService> {
		const configurationCache = new ConfigurationCache([Schemas.file, Schemas.userData, Schemas.tmp] /* Cache all non native resources */, environmentService, fileService);
		const workspaceService = new WorkspaceService({ remoteAuthority: this.configuration.remoteAuthority, configurationCache }, environmentService, fileService, remoteAgentService, uriIdentityService, logService);

		try {
			await workspaceService.initialize(payload);

			return workspaceService;
		} catch (error) {
			onUnexpectedError(error);
			logService.error(error);

			return workspaceService;
		}
	}

	private resolveWorkspaceInitializationPayload(): IWorkspaceInitializationPayload {
		let workspace: IWorkspace | undefined = undefined;
		if (this.configuration.workspaceProvider) {
			workspace = this.configuration.workspaceProvider.workspace;
		}

		// Multi-root workspace
		if (workspace && isWorkspaceToOpen(workspace)) {
			return getWorkspaceIdentifier(workspace.workspaceUri);
		}

		// Single-folder workspace
		if (workspace && isFolderToOpen(workspace)) {
			return getSingleFolderWorkspaceIdentifier(workspace.folderUri);
		}

		return { id: 'empty-window' };
	}
}

export function main(domElement: HTMLElement, options: IWorkbenchConstructionOptions): Promise<IWorkbench> {
	const workbench = new BrowserMain(domElement, options);

	return workbench.open();
}

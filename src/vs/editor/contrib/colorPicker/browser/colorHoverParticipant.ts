/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AsyncIterableObject } from 'vs/base/common/async';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Color, RGBA } from 'vs/base/common/color';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { Range } from 'vs/editor/common/core/range';
import { IModelDecoration, ITextModel } from 'vs/editor/common/model';
import { DocumentColorProvider, IColorInformation } from 'vs/editor/common/languages';
import { getColorPresentations, getColors } from 'vs/editor/contrib/colorPicker/browser/color';
import { ColorDetector } from 'vs/editor/contrib/colorPicker/browser/colorDetector';
import { ColorPickerModel } from 'vs/editor/contrib/colorPicker/browser/colorPickerModel';
import { HoverAnchor, HoverAnchorType, IEditorHoverParticipant, IEditorHoverRenderContext, IHoverPart } from 'vs/editor/contrib/hover/browser/hoverTypes';
import { IThemeService } from 'vs/platform/theme/common/themeService';
import { LanguageFeatureRegistry } from 'vs/editor/common/languageFeatureRegistry';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { HoverColorPicker, StandaloneColorPicker } from 'vs/editor/contrib/colorPicker/browser/colorPickerWidget';

export interface IColorHover {
	readonly range: Range;
	readonly model: ColorPickerModel;
	readonly provider: DocumentColorProvider;
}

export class ColorHover implements IHoverPart, IColorHover {

	/**
	 * Force the hover to always be rendered at this specific range,
	 * even in the case of multiple hover parts.
	 */
	public readonly forceShowAtRange: boolean = true;

	constructor(
		public readonly owner: IEditorHoverParticipant<ColorHover>,
		public readonly range: Range,
		public readonly model: ColorPickerModel,
		public readonly provider: DocumentColorProvider
	) { }

	public isValidForHoverAnchor(anchor: HoverAnchor): boolean {
		return (
			anchor.type === HoverAnchorType.Range
			&& this.range.startColumn <= anchor.range.startColumn
			&& this.range.endColumn >= anchor.range.endColumn
		);
	}

	public static from(owner: IEditorHoverParticipant<ColorHover>, colorHover: IColorHover): ColorHover {
		return new ColorHover(owner, colorHover.range, colorHover.model, colorHover.provider);
	}
}

export class ColorHoverParticipant implements IEditorHoverParticipant<ColorHover> {

	public readonly hoverOrdinal: number = 2;

	private _colorPicker: HoverColorPicker | undefined;

	constructor(
		private readonly _editor: ICodeEditor,
		@IThemeService private readonly _themeService: IThemeService,
	) { }

	public computeSync(_anchor: HoverAnchor, _lineDecorations: IModelDecoration[]): ColorHover[] {
		return [];
	}

	public computeAsync(anchor: HoverAnchor, lineDecorations: IModelDecoration[], token: CancellationToken): AsyncIterableObject<ColorHover> {
		return AsyncIterableObject.fromPromise(this._computeAsync(anchor, lineDecorations, token));
	}

	private async _computeAsync(_anchor: HoverAnchor, lineDecorations: IModelDecoration[], _token: CancellationToken): Promise<ColorHover[]> {
		if (!this._editor.hasModel()) {
			return [];
		}
		const colorDetector = ColorDetector.get(this._editor);
		if (!colorDetector) {
			return [];
		}
		for (const d of lineDecorations) {
			if (!colorDetector.isColorDecoration(d)) {
				continue;
			}

			const colorData = colorDetector.getColorData(d.range.getStartPosition());
			if (colorData) {
				const colorHover = await createColorHover(this._editor.getModel(), colorData.colorInfo, colorData.provider);
				return [ColorHover.from(this, colorHover)];
			}

		}
		return [];
	}

	public renderHoverParts(context: IEditorHoverRenderContext, hoverParts: ColorHover[]): IDisposable {
		if (hoverParts.length === 0 || !this._editor.hasModel()) {
			return Disposable.None;
		}
		this._colorPicker = new HoverColorPicker(this._editor, hoverParts[0], context, this._themeService);
		return this._colorPicker;
	}

	public handleResize(): void {
		this._colorPicker?.layout();
	}

	public isColorPickerVisible(): boolean {
		return !!this._colorPicker;
	}
}

export class StandaloneColorPickerParticipant {

	public readonly hoverOrdinal: number = 2;
	private _colorPicker: StandaloneColorPicker | undefined;

	constructor(
		private readonly _editor: ICodeEditor,
		@IThemeService private readonly _themeService: IThemeService,
	) { }

	public async createColorHover(defaultColorInfo: IColorInformation, defaultColorProvider: DocumentColorProvider, colorProviderRegistry: LanguageFeatureRegistry<DocumentColorProvider>): Promise<{ colorHover: IColorHover; foundInEditor: boolean } | null> {
		if (!this._editor.hasModel()) {
			return null;
		}
		const colorDetector = ColorDetector.get(this._editor);
		if (!colorDetector) {
			return null;
		}
		const colors = await getColors(colorProviderRegistry, this._editor.getModel(), CancellationToken.None);
		let foundColorInfo: IColorInformation | null = null;
		let foundColorProvider: DocumentColorProvider | null = null;
		for (const colorData of colors) {
			const colorInfo = colorData.colorInfo;
			if (Range.containsRange(colorInfo.range, defaultColorInfo.range)) {
				foundColorInfo = colorInfo;
				foundColorProvider = colorData.provider;
			}
		}
		const colorInfo = foundColorInfo ?? defaultColorInfo;
		const colorProvider = foundColorProvider ?? defaultColorProvider;
		const foundInEditor = !!foundColorInfo;
		const colorHover = await createColorHover(this._editor.getModel(), colorInfo, colorProvider);
		return { colorHover, foundInEditor };
	}

	public async updateEditorModel(colorHover: IColorHover): Promise<void> {
		this._colorPicker?.updateEditorModel(colorHover);
	}

	public renderColorPicker(context: IEditorHoverRenderContext, colorHover: IColorHover, foundInEditor: boolean): StandaloneColorPicker | undefined {
		if (!this._editor.hasModel()) {
			return;
		}
		this._colorPicker = new StandaloneColorPicker(this._editor, colorHover, foundInEditor, context, this._themeService);
		return this._colorPicker;
	}
}

async function createColorHover(editorModel: ITextModel, colorInfo: IColorInformation, provider: DocumentColorProvider): Promise<IColorHover> {
	const originalText = editorModel.getValueInRange(colorInfo.range);
	const { red, green, blue, alpha } = colorInfo.color;
	const rgba = new RGBA(Math.round(red * 255), Math.round(green * 255), Math.round(blue * 255), alpha);
	const color = new Color(rgba);

	const colorPresentations = await getColorPresentations(editorModel, colorInfo, provider, CancellationToken.None);
	const model = new ColorPickerModel(color, [], 0);
	model.colorPresentations = colorPresentations || [];
	model.guessColorPresentation(color, originalText);
	const range = Range.lift(colorInfo.range);
	return { range, model, provider };
}



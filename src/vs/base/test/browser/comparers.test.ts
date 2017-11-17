/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { compareFileNames, compareFileExtensions, setFileNameComparer } from 'vs/base/common/comparers';
import * as assert from 'assert';

suite('Comparers', () => {

	test('compareFileNames', () => {

		// Setup Intl
		setFileNameComparer(new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' }));

		assert(compareFileNames(null, null) === 0, 'null should be equal');
		assert(compareFileNames(null, 'abc') < 0, 'null should be come before real values');
		assert(compareFileNames('', '') === 0, 'empty should be equal');
		assert(compareFileNames('abc', 'abc') === 0, 'equal names should be equal');
		assert(compareFileNames('.abc', '.abc') === 0, 'equal full names should be equal');
		assert(compareFileNames('.env', '.env.example') < 0, 'filenames with extensions should come after those without');
		assert(compareFileNames('.env.example', '.gitattributes') < 0, 'filenames starting with dots and with extensions should still sort properly');
		assert(compareFileNames('1', '1') === 0, 'numerically equal full names should be equal');
		assert(compareFileNames('abc1.txt', 'abc1.txt') === 0, 'equal filenames with numbers should be equal');
		assert(compareFileNames('abc1.txt', 'abc2.txt') < 0, 'filenames with numbers should be in numerical order, not alphabetical order');
		assert(compareFileNames('abc2.txt', 'abc10.txt') < 0, 'filenames with numbers should be in numerical order even when they are multiple digits long');
		assert(compareFileNames('ABC', 'abc') < 0, 'uppercase should become before lowercase when the value of both strings are equal');
		assert(compareFileNames('XYZ', 'abc') > 0, 'uppercase should come after lowercase, when the lowercase name precedes the uppercase name alphabetically');
		assert(compareFileNames('ABD', 'ABc') > 0, 'all uppercase should come after partial uppercase, even when the lowercase name precedes the uppercase name alphabetically');

		// Same test for case sensitivity
		assert(compareFileNames(null, null, true) === 0, 'null should be equal');
		assert(compareFileNames(null, 'abc', true) < 0, 'null should be come before real values');
		assert(compareFileNames('', '', true) === 0, 'empty should be equal');
		assert(compareFileNames('abc', 'abc', true) === 0, 'equal names should be equal');
		assert(compareFileNames('.abc', '.abc', true) === 0, 'equal full names should be equal');
		assert(compareFileNames('.env', '.env.example', true) < 0, 'filenames with extensions should come after those without');
		assert(compareFileNames('.env.example', '.gitattributes', true) < 0, 'filenames starting with dots and with extensions should still sort properly');
		assert(compareFileNames('1', '1', true) === 0, 'numerically equal full names should be equal');
		assert(compareFileNames('abc1.txt', 'abc1.txt', true) === 0, 'equal filenames with numbers should be equal');
		assert(compareFileNames('abc1.txt', 'abc2.txt', true) < 0, 'filenames with numbers should be in numerical order, not alphabetical order');
		assert(compareFileNames('abc2.txt', 'abc10.txt', true) < 0, 'filenames with numbers should be in numerical order even when they are multiple digits long');
		assert(compareFileNames('ABC', 'abc', true) < 0, 'uppercase should come before lowercase when the value of both strings are equal');
		assert(compareFileNames('XYZ', 'abc', true) < 0, 'uppercase should come before lowercase, even when the lowercase name precedes the uppercase name alphabetically');
		assert(compareFileNames('ABD', 'ABc', true) < 0, 'all uppercase should come before partial uppercase, even when the lowercase name precedes the uppercase name alphabetically');

	});

	test('compareFileExtensions', () => {

		// Setup Intl
		setFileNameComparer(new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' }));

		assert(compareFileExtensions(null, null) === 0, 'null should be equal');
		assert(compareFileExtensions(null, '.abc') < 0, 'null should come before real files');
		assert(compareFileExtensions(null, 'abc') < 0, 'null should come before real files without extension');
		assert(compareFileExtensions('', '') === 0, 'empty should be equal');
		assert(compareFileExtensions('abc', 'abc') === 0, 'equal names should be equal');
		assert(compareFileExtensions('.abc', '.abc') === 0, 'equal full names should be equal');
		assert(compareFileExtensions('file.ext', 'file.ext') === 0, 'equal full names should be equal');
		assert(compareFileExtensions('a.ext', 'b.ext') < 0, 'if equal extensions, filenames should be compared');
		assert(compareFileExtensions('.ext', 'a.ext') < 0, 'if equal extensions, filenames should be compared, empty filename should come before others');
		assert(compareFileExtensions('file.aaa', 'file.bbb') < 0, 'files should be compared by extensions');
		assert(compareFileExtensions('bbb.aaa', 'aaa.bbb') < 0, 'files should be compared by extensions even if filenames compare differently');
		assert(compareFileExtensions('1', '1') === 0, 'numerically equal full names should be equal');
		assert(compareFileExtensions('abc1.txt', 'abc1.txt') === 0, 'equal filenames with numbers should be equal');
		assert(compareFileExtensions('abc1.txt', 'abc2.txt') < 0, 'filenames with numbers should be in numerical order, not alphabetical order');
		assert(compareFileExtensions('abc2.txt', 'abc10.txt') < 0, 'filenames with numbers should be in numerical order even when they are multiple digits long');
		assert(compareFileExtensions('txt.abc1', 'txt.abc1') === 0, 'equal extensions with numbers should be equal');
		assert(compareFileExtensions('txt.abc1', 'txt.abc2') < 0, 'extensions with numbers should be in numerical order, not alphabetical order');
		assert(compareFileExtensions('txt.abc2', 'txt.abc10') < 0, 'extensions with numbers should be in numerical order even when they are multiple digits long');
		assert(compareFileExtensions('a.ext1', 'b.ext1') < 0, 'if equal extensions with numbers, filenames should be compared');
		assert(compareFileExtensions('file2.ext2', 'file1.ext10') < 0, 'extensions with numbers should be in numerical order, not alphabetical order');
		assert(compareFileExtensions('file.ext01', 'file.ext1') < 0, 'extensions with equal numbers should be in alphabetical order');
	});
});

// electron/data-folder.spec.ts
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { dataFolderNotice, lastDataDirFile, readLastDataDir, writeLastDataDir } from './data-folder';

const DIRS = { primary: 'C:\\Docs\\OMNI Keypad Designer', fallback: 'C:\\AppData\\OMNI Keypad Designer\\Data' };

describe('dataFolderNotice', () => {
  it('says nothing while Documents works', () => {
    expect(dataFolderNotice(null, DIRS.primary, DIRS)).toBeNull();
    expect(dataFolderNotice(DIRS.primary, DIRS.primary, DIRS)).toBeNull();
  });

  it('says where the projects went the first time the fallback is used', () => {
    const notice = dataFolderNotice(null, DIRS.fallback, DIRS);
    expect(notice?.message).toContain(DIRS.fallback);
    expect(notice?.message).toContain('Controlled folder access');
    expect(dataFolderNotice(DIRS.primary, DIRS.fallback, DIRS)).not.toBeNull();
  });

  it('says it once, not on every start', () => {
    expect(dataFolderNotice(DIRS.fallback, DIRS.fallback.toUpperCase(), DIRS)).toBeNull();
  });

  it('points back to the fallback when Documents works again', () => {
    const notice = dataFolderNotice(DIRS.fallback, DIRS.primary, DIRS);
    expect(notice?.title).toContain('back in Documents');
    expect(notice?.message).toContain(DIRS.fallback);
  });

  it('says nothing with no fallback', () => {
    expect(dataFolderNotice(null, 'D:\\Try', { primary: 'D:\\Try', fallback: null })).toBeNull();
  });
});

describe('the last data folder', () => {
  it('is remembered between starts', () => {
    const file = lastDataDirFile(mkdtempSync(path.join(tmpdir(), 'profile-')));
    expect(readLastDataDir(file)).toBeNull();
    writeLastDataDir(file, DIRS.fallback);
    expect(readLastDataDir(file)).toBe(DIRS.fallback);
  });
});

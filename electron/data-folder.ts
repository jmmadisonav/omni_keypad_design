// electron/data-folder.ts
//
// Tells you when the designer keeps your projects somewhere other than
// Documents. Windows Security's Controlled folder access can stop the
// designer writing to Documents, and the server then uses the fallback
// folder in AppData instead -- see fallbackDataDir in electron/paths.ts.
// Nothing else would tell you, and projects saved there would seem to vanish
// the day Documents works again.
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AppDialogOptions } from './app-dialog';
import { APP_NAME } from './paths';

/** Where the folder used last time is kept, in the app's own data folder. */
export function lastDataDirFile(userDataDir: string): string {
  return path.join(userDataDir, 'data-folder.json');
}

/** The folder the designer used last time, or null the first time or if it
 * can't be read. */
export function readLastDataDir(file: string): string | null {
  try {
    const { dataDir } = JSON.parse(fs.readFileSync(file, 'utf8'));
    return typeof dataDir === 'string' ? dataDir : null;
  } catch {
    return null;
  }
}

/** Records the folder in use, so the next start knows if it changed. A
 * failure only costs a repeated notice, so it's logged, not thrown. */
export function writeLastDataDir(file: string, dataDir: string): void {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ dataDir }, null, 2));
  } catch (error) {
    console.error('Could not record the data folder:', error);
  }
}

function same(a: string | null, b: string | null): boolean {
  return a !== null && b !== null && path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
}

/**
 * What to tell you when the folder in use changes to or from the fallback,
 * or null when there is nothing new to say. Said once per change, not on
 * every start.
 */
export function dataFolderNotice(
  previous: string | null, current: string, dirs: { primary: string; fallback: string | null },
): AppDialogOptions | null {
  if (same(current, dirs.fallback) && !same(previous, dirs.fallback)) {
    return {
      title: 'Your projects are in a different folder',
      message:
        `Windows didn't let ${APP_NAME} save to ${dirs.primary}, so it keeps your projects, `
        + `backups, and library in ${current} instead. To open that folder, click Folder. `
        + `If Windows Security's Controlled folder access is on, and your IT policy allows it, `
        + `you can let ${APP_NAME} and its python.exe through to use Documents again.`,
      confirmLabel: 'OK',
      cancelLabel: null,
    };
  }
  if (same(current, dirs.primary) && same(previous, dirs.fallback)) {
    return {
      title: 'Your projects are back in Documents',
      message:
        `${APP_NAME} can save to ${dirs.primary} again, so it keeps your projects there. `
        + `Anything you saved while it couldn't is still in ${previous}. To keep working on it, `
        + `move it to ${dirs.primary}.`,
      confirmLabel: 'OK',
      cancelLabel: null,
    };
  }
  return null;
}

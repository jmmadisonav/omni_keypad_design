// electron/server-process.spec.ts
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseDataDir, parseServerUrl, PREFERRED_PORT, serverArgs, startServer } from './server-process';

const REPO_ROOT = path.join(__dirname, '..');
const PYTHON = process.env.OMNI_PYTHON || 'python';

describe('parseServerUrl', () => {
  it("finds the address in the server's start-up line", () => {
    expect(parseServerUrl('Button designer running at http://127.0.0.1:8044/. Press Ctrl+C to stop.'))
      .toBe('http://127.0.0.1:8044/');
  });

  it('is null until the line arrives', () => {
    expect(parseServerUrl('')).toBeNull();
    expect(parseServerUrl('Loading...')).toBeNull();
  });
});

describe('serverArgs', () => {
  it('runs server.py isolated, on the preferred port, with the data folder', () => {
    const args = serverArgs('C:\\app', 'C:\\Docs\\OMNI Keypad Designer');
    expect(args.slice(0, 2)).toEqual(['-I', path.join('C:\\app', 'designer', 'server.py')]);
    expect(args).toContain('--any-port');
    expect(args).toContain('--exit-with-parent');
    expect(args[args.indexOf('--port') + 1]).toBe(String(PREFERRED_PORT));
    expect(args[args.indexOf('--data-dir') + 1]).toBe('C:\\Docs\\OMNI Keypad Designer');
    expect(args).not.toContain('--fallback-data-dir');
  });

  it('passes the fallback folder when there is one', () => {
    const args = serverArgs('C:\\app', 'C:\\Docs\\OMNI Keypad Designer', 'C:\\AppData\\Data');
    expect(args[args.indexOf('--fallback-data-dir') + 1]).toBe('C:\\AppData\\Data');
  });
});

describe('parseDataDir', () => {
  it("finds the folder in the server's data folder line", () => {
    expect(parseDataDir('Data folder: C:\\Docs\\OMNI Keypad Designer\r\nButton designer running at'))
      .toBe('C:\\Docs\\OMNI Keypad Designer');
  });

  it('is null when the server never said', () => {
    expect(parseDataDir('Button designer running at http://127.0.0.1:8044/.')).toBeNull();
  });
});

describe('startServer', () => {
  it('starts the real designer server and resolves with its address', async () => {
    const dataDir = mkdtempSync(path.join(tmpdir(), 'designer-'));
    const args = serverArgs(REPO_ROOT, dataDir);
    args[args.indexOf('--port') + 1] = '0';           // Don't fight a designer you have open.
    const { url, child, dataDir: used } = await startServer(PYTHON, args);
    try {
      expect(used).toBe(dataDir);
      const response = await fetch(`${url}api/models`);
      expect(response.ok).toBe(true);
      expect((await response.json()).map((m: { id: string }) => m.id)).toContain('OMNI-KP-8BV');
    } finally {
      const exited = new Promise(resolve => child.on('exit', resolve));
      child.stdin?.end();                               // As when the app quits.
      expect(await exited).toBe(0);
    }
  }, 30_000);

  it('rejects with what the server printed when it fails', async () => {
    await expect(startServer(PYTHON, ['-c', 'import sys; sys.exit("no designer here")'], 10_000))
      .rejects.toThrow(/no designer here/);
  });
});

// electron/preload.ts
//
// The bridge between the designer page and the main process: the message
// boxes licensing asks the page to draw (see electron/app-dialog.ts), the
// menu bar (see electron/app-menu.ts), and the app's version and data
// folder. The page itself talks to its server over HTTP.
import { contextBridge, ipcRenderer } from 'electron';

interface AppDialogRequest {
  id: number;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string | null;
  logo?: boolean;
}

contextBridge.exposeInMainWorld('appDialog', {
  /** Everything asked for before the page started listening. */
  getPending: (): Promise<AppDialogRequest[]> => ipcRenderer.invoke('app-dialog:pending'),
  onShow: (callback: (request: AppDialogRequest) => void): void => {
    ipcRenderer.on('app-dialog:show', (_event, request: AppDialogRequest) => callback(request));
  },
  answer: (id: number, confirmed: boolean): void => ipcRenderer.send('app-dialog:answer', id, confirmed),
});

contextBridge.exposeInMainWorld('desktop', {
  /** The app's version, and the folder that holds projects, backups, and the library. */
  info: (): Promise<{ version: string; dataDir: string }> => ipcRenderer.invoke('desktop:info'),
  openDataFolder: (): Promise<string> => ipcRenderer.invoke('desktop:openDataFolder'),
  /** Tells the menu bar what it needs to show. */
  setMenuState: (state: unknown): void => ipcRenderer.send('menu:state', state),
  /** Calls back with each menu command you pick, such as "save", or "open" and a project name. */
  onMenuCommand: (callback: (command: string, arg?: string) => void): void => {
    ipcRenderer.on('menu:command', (_event, command: string, arg?: string) => callback(command, arg));
  },
});

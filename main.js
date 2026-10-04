const { app, BrowserWindow, Menu, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs/promises');
let mainWindow;
const modelDirectory = path.join(__dirname, 'model');
function safeModelPath(fileName) {
  if (typeof fileName !== 'string' || !/^[\w\p{L}-]+\.json$/iu.test(fileName)) {
    throw new Error('Nom de fichier JSON invalide.');
  }
  const resolved = path.resolve(modelDirectory, fileName);
  if (path.dirname(resolved) !== modelDirectory) throw new Error('Chemin de fichier invalide.');
  return resolved;
}
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1420,
    height: 900,
    minWidth: 760,
    minHeight: 600,
    fullscreen: false,
    resizable: true,
    webPreferences: {
      devTools: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  Menu.setApplicationMenu(null);
  mainWindow.setIcon(path.join(__dirname, 'assets/images/logo.ico'));
  mainWindow.loadFile('views/home.html');
  // mainWindow.webContents.openDevTools();
}
ipcMain.handle('models:list', async () => {
  const entries = await fs.readdir(modelDirectory, { withFileTypes: true });
  return entries.filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith('.json')).map(entry => entry.name).sort((a, b) => a.localeCompare(b, 'fr'));
});
ipcMain.handle('models:open-folder', async () => {
  const error = await shell.openPath(modelDirectory);
  if (error) throw new Error(error);
  return true;
});
ipcMain.handle('models:open-archive', async () => {
  const archiveDirectory = path.join(modelDirectory, 'archive');
  await fs.mkdir(archiveDirectory, { recursive: true });
  const error = await shell.openPath(archiveDirectory);
  if (error) throw new Error(error);
  return true;
});
ipcMain.handle('models:delete-archive', async (event, fileName) => {
  const sourcePath = safeModelPath(fileName);
  const archiveDirectory = path.join(modelDirectory, 'archive');
  await fs.mkdir(archiveDirectory, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const archiveName = `${path.basename(fileName, '.json')}-${timestamp}.json`;
  await fs.copyFile(sourcePath, path.join(archiveDirectory, archiveName), require('fs').constants.COPYFILE_EXCL);
  await fs.unlink(sourcePath);
  return archiveName;
});
ipcMain.handle('models:read', async (event, fileName) => {
  const content = await fs.readFile(safeModelPath(fileName), 'utf8');
  return JSON.parse(content);
});
ipcMain.handle('models:create', async (event, fileName, data) => {
  const filePath = safeModelPath(fileName);
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), { encoding: 'utf8', flag: 'wx' });
  return true;
});
ipcMain.handle('models:save', async (event, fileName, data) => {
  const filePath = safeModelPath(fileName);
  const content = JSON.stringify(data, null, 2);
  const temporaryPath = `${filePath}.tmp`;
  await fs.writeFile(temporaryPath, content, 'utf8');
  await fs.rename(temporaryPath, filePath);
  return true;
});
ipcMain.on('open-external-link', (event, url) => {
  shell.openExternal(url);
});
app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

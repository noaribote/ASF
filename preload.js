const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('asfAPI', {
  listModels: () => ipcRenderer.invoke('models:list'),
  readModel: fileName => ipcRenderer.invoke('models:read', fileName),
  createModel: (fileName, data) => ipcRenderer.invoke('models:create', fileName, data),
  saveModel: (fileName, data) => ipcRenderer.invoke('models:save', fileName, data),
  openModelsFolder: () => ipcRenderer.invoke('models:open-folder'),
  openArchiveFolder: () => ipcRenderer.invoke('models:open-archive'),
  deleteAndArchiveModel: fileName => ipcRenderer.invoke('models:delete-archive', fileName)
});

contextBridge.exposeInMainWorld('electronAPI', {
  listModels: () => ipcRenderer.invoke('models:list'),
  readModel: fileName => ipcRenderer.invoke('models:read', fileName),
  createModel: (fileName, data) => ipcRenderer.invoke('models:create', fileName, data),
  saveModel: (fileName, data) => ipcRenderer.invoke('models:save', fileName, data),
  openModelsFolder: () => ipcRenderer.invoke('models:open-folder'),
  openArchiveFolder: () => ipcRenderer.invoke('models:open-archive'),
  deleteAndArchiveModel: fileName => ipcRenderer.invoke('models:delete-archive', fileName)
});

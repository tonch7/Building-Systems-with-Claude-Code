// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  CLICBIZ TICKET MASTER v1.0 — PRELOAD (Context Bridge)                 ║
// ║  Gabriel Perdigão | Clicbiz Suporte                                    ║
// ╚══════════════════════════════════════════════════════════════════════════╝
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('CB', {
  // System
  sysInfo:      ()        => ipcRenderer.invoke('sys-info'),
  aiStatus:     ()        => ipcRenderer.invoke('ai-status'),
  openUserData: ()        => ipcRenderer.invoke('open-userdata'),

  // User Preferences (emitente — persisted)
  prefsLoad:    ()        => ipcRenderer.invoke('prefs-load'),
  prefsSave:    (prefs)   => ipcRenderer.invoke('prefs-save', prefs),

  // Audit & History
  auditGet:     (limit)   => ipcRenderer.invoke('audit-get', limit),
  ticketsGet:   (limit)   => ipcRenderer.invoke('tickets-get', limit),

  // AI
  aiFormalizar: (p)       => ipcRenderer.invoke('ai-formalizar', p),
  aiSugerir:    (p)       => ipcRenderer.invoke('ai-sugerir', p),

  // Ticket
  gerar:        (dados)   => ipcRenderer.invoke('gerar', dados),
  salvar:       (p)       => ipcRenderer.invoke('salvar', p),
  copiar:       (p)       => ipcRenderer.invoke('copiar', p),

  // Draft (renderer-side localStorage bridged for resilience)
  draftSave:    (data)    => ipcRenderer.invoke('draft-save', data),
  draftLoad:    ()        => ipcRenderer.invoke('draft-load'),
  draftClear:   ()        => ipcRenderer.invoke('draft-clear'),

  // Window controls
  winMin:       ()        => ipcRenderer.send('win-min'),
  winClose:     ()        => ipcRenderer.send('win-close'),
});

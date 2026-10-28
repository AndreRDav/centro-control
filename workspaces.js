// ========================================================
// GESTOR DINÁMICO DE VENTANAS (WORKSPACES MANAGER)
// Permite crear, renombrar, reordenar y eliminar ventanas,
// gestionar cuadros fijos (pinned), atajos 1-9 y morphing suave.
// ========================================================

const WorkspacesManager = (function() {
  'use strict';

  // Configuración de las 4 ventanas de fábrica (predeterminadas)
  const FACTORY_WORKSPACES = [
    {
      id: 'ws-1',
      name: 'Hoy y Enfoque',
      iconSvg: '<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
      order: 1,
      grid: {
        topKpisWrapper: { col: 1, colSpan: 12, row: 1, rowSpan: 3, isPinned: false, compact: false },
        todayFocusContainer: { col: 1, colSpan: 6, row: 4, rowSpan: 18, isPinned: false, compact: false },
        notesMiniCalendarPanel: { col: 7, colSpan: 6, row: 4, rowSpan: 8, isPinned: false, compact: false },
        interactiveListsPanel: { col: 7, colSpan: 6, row: 12, rowSpan: 14, isPinned: false, compact: false },
        tab1RecentExpensesBar: { col: 1, colSpan: 6, row: 22, rowSpan: 4, isPinned: false, compact: false },
        weekTableContainer: { col: 1, colSpan: 12, row: 26, rowSpan: 8, isPinned: false, compact: false }
      },
      sidebarWidgets: [],
      dockWidgets: []
    },
    {
      id: 'ws-2',
      name: 'Horario y Metas',
      iconSvg: '<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>',
      order: 2,
      grid: {
        tab2ModularHabitsSection: { col: 1, colSpan: 12, row: 1, rowSpan: 8, isPinned: false, compact: false },
        tab2ScheduleSection: { col: 1, colSpan: 8, row: 9, rowSpan: 14, isPinned: false, compact: false },
        tab2AttendanceRulesSection: { col: 9, colSpan: 4, row: 9, rowSpan: 14, isPinned: false, compact: false }
      },
      sidebarWidgets: [],
      dockWidgets: []
    },
    {
      id: 'ws-3',
      name: 'Finanzas Pro',
      iconSvg: '<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
      order: 3,
      grid: {
        tab3BudgetConfigCard: { col: 1, colSpan: 6, row: 1, rowSpan: 8, isPinned: false, compact: false },
        tab3SavingsGoalsCard: { col: 7, colSpan: 6, row: 1, rowSpan: 8, isPinned: false, compact: false },
        tab3PiggyCard: { col: 1, colSpan: 12, row: 9, rowSpan: 8, isPinned: false, compact: false },
        tab3FixedExpensesCard: { col: 1, colSpan: 5, row: 17, rowSpan: 8, isPinned: false, compact: false },
        tab3ExpensesTableCard: { col: 6, colSpan: 7, row: 17, rowSpan: 8, isPinned: false, compact: false }
      },
      sidebarWidgets: [],
      dockWidgets: []
    },
    {
      id: 'ws-4',
      name: 'Rendimiento',
      iconSvg: '<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>',
      order: 4,
      grid: {
        tab4StudyAuditSection: { col: 1, colSpan: 12, row: 1, rowSpan: 8, isPinned: false, compact: false },
        tab4CustomHabitsSection: { col: 1, colSpan: 6, row: 9, rowSpan: 8, isPinned: false, compact: false },
        tab4BiometricsSection: { col: 7, colSpan: 6, row: 9, rowSpan: 8, isPinned: false, compact: false },
        tab4EvolutionSection: { col: 1, colSpan: 12, row: 17, rowSpan: 12, isPinned: false, compact: false }
      },
      sidebarWidgets: [],
      dockWidgets: []
    }
  ];

  return {
    // Inicialización y migración transparente sin pérdida de datos
    ensureWorkspaces() {
      if (typeof state === 'undefined') return;

      if (!state.workspaces || !Array.isArray(state.workspaces) || state.workspaces.length === 0) {
        state.workspaces = JSON.parse(JSON.stringify(FACTORY_WORKSPACES));

        // Si el usuario tenía layouts guardados en versiones anteriores, migrarlos
        if (state.uiPreferences && state.uiPreferences.gridLayouts && state.uiPreferences.gridLayouts.desktop) {
          const desk = state.uiPreferences.gridLayouts.desktop;
          if (desk.tab1 && state.workspaces[0]) state.workspaces[0].grid = Object.assign({}, state.workspaces[0].grid, desk.tab1);
          if (desk.tab2 && state.workspaces[1]) state.workspaces[1].grid = Object.assign({}, state.workspaces[1].grid, desk.tab2);
          if (desk.tab3 && state.workspaces[2]) state.workspaces[2].grid = Object.assign({}, state.workspaces[2].grid, desk.tab3);
          if (desk.tab4 && state.workspaces[3]) state.workspaces[3].grid = Object.assign({}, state.workspaces[3].grid, desk.tab4);
        }
      }

      if (!state.activeWorkspaceId) {
        state.activeWorkspaceId = state.workspaces[0] ? state.workspaces[0].id : 'ws-1';
      }

      if (!state.globalSidebar) {
        state.globalSidebar = { isOpen: false, position: 'right', widgets: [] };
      }

      if (!state.globalDock) {
        state.globalDock = { widgets: ['dockPomoPill', 'dockExpensePill'] };
      }

      if (!this._shortcutsInitialized) {
        this.setupKeyboardShortcuts();
        this._shortcutsInitialized = true;
      }
    },

    getWorkspaces() {
      this.ensureWorkspaces();
      return state.workspaces.sort((a, b) => (a.order || 0) - (b.order || 0));
    },

    getActiveWorkspace() {
      this.ensureWorkspaces();
      const ws = state.workspaces.find(w => w.id === state.activeWorkspaceId);
      return ws || state.workspaces[0] || FACTORY_WORKSPACES[0];
    },

    getWorkspaceById(id) {
      this.ensureWorkspaces();
      return state.workspaces.find(w => w.id === id) || null;
    },

    // CRUD de Ventanas
    createWorkspace(name, iconSvg) {
      this.ensureWorkspaces();
      const newIndex = state.workspaces.length + 1;
      const newWs = {
        id: 'ws-' + Date.now(),
        name: name || ('Ventana ' + newIndex),
        iconSvg: iconSvg || '<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>',
        order: newIndex,
        grid: {},
        sidebarWidgets: [],
        dockWidgets: []
      };

      // Si hay widgets fijos globales (pinned), copiarlos a la nueva ventana
      this.syncPinnedWidgetsTo(newWs);

      state.workspaces.push(newWs);
      this.switchWorkspace(newWs.id);
      if (typeof saveState === 'function') saveState();
      return newWs;
    },

    renameWorkspace(id, newName) {
      const ws = this.getWorkspaceById(id);
      if (ws && newName && newName.trim()) {
        ws.name = newName.trim();
        this.renderNavBar();
        if (typeof saveState === 'function') saveState();
      }
    },

    deleteWorkspace(id) {
      this.ensureWorkspaces();
      if (state.workspaces.length <= 1) {
        if (typeof app !== 'undefined' && app.showToast) {
          app.showToast('No puedes eliminar la única ventana existente.', 'amber');
        }
        return false;
      }

      const idx = state.workspaces.findIndex(w => w.id === id);
      if (idx !== -1) {
        const deletedWs = state.workspaces.splice(idx, 1)[0];
        
        // Rescatar widgets inactivos al pool
        if (deletedWs && deletedWs.grid && window.WidgetsRegistry) {
          Object.keys(deletedWs.grid).forEach(widgetId => {
            window.WidgetsRegistry.parkWidget(widgetId);
          });
        }

        // Si era la activa, cambiar a la primera
        if (state.activeWorkspaceId === id) {
          state.activeWorkspaceId = state.workspaces[0].id;
        }

        this.renderNavBar();
        this.mountActiveWorkspace();
        if (typeof saveState === 'function') saveState();
        return true;
      }
      return false;
    },

    duplicateWorkspace(id) {
      this.ensureWorkspaces();
      const source = this.getWorkspaceById(id);
      if (!source) return null;
      const newId = 'ws-' + Date.now();
      const duplicated = {
        id: newId,
        name: source.name + ' (Copia)',
        iconSvg: source.iconSvg || '',
        order: state.workspaces.length + 1,
        grid: JSON.parse(JSON.stringify(source.grid || {})),
        sidebarWidgets: JSON.parse(JSON.stringify(source.sidebarWidgets || [])),
        dockWidgets: JSON.parse(JSON.stringify(source.dockWidgets || []))
      };
      state.workspaces.push(duplicated);
      this.switchWorkspace(newId);
      if (typeof saveState === 'function') saveState();
      if (typeof app !== 'undefined' && app.safeToast) {
        app.safeToast('Ventana "' + duplicated.name + '" creada.', 'emerald');
      }
      return duplicated;
    },

    restoreFactoryWorkspaces() {
      const doRestore = () => {
        state.workspaces = JSON.parse(JSON.stringify(FACTORY_WORKSPACES));
        state.activeWorkspaceId = 'ws-1';
        state.activeTab = 1;
        this.mountActiveWorkspace();
        this.renderNavBar();
        if (typeof app !== 'undefined' && app.applyGridLayout) app.applyGridLayout();
        if (typeof app !== 'undefined' && state.ui && state.ui.isBoardEditMode) {
          if (app.renderBoardEditHandles) app.renderBoardEditHandles();
          if (app.renderWidgetsDrawer) app.renderWidgetsDrawer();
        }
        if (typeof saveState === 'function') saveState();
        if (typeof app !== 'undefined' && app.safeToast) {
          app.safeToast('Ventanas predeterminadas restauradas de fábrica.', 'emerald');
        }
      };

      if (typeof app !== 'undefined' && app.showConfirm) {
        app.showConfirm({
          title: 'Restaurar Fábrica',
          message: '¿Restaurar todas las ventanas a su configuración original de fábrica? Se reiniciarán las pestañas predeterminadas.',
          confirmText: 'Restaurar Fábrica',
          cancelText: 'Cancelar',
          isDanger: true
        }).then(confirmed => {
          if (confirmed) doRestore();
        });
      } else {
        doRestore();
      }
    },

    // Sincroniza widgets marcados con chincheta 📌 entre todas las ventanas
    toggleWidgetPin(widgetId) {
      this.ensureWorkspaces();
      const currentWs = this.getActiveWorkspace();
      if (!currentWs || !currentWs.grid || !currentWs.grid[widgetId]) return;

      const cardCfg = currentWs.grid[widgetId];
      cardCfg.isPinned = !cardCfg.isPinned;

      // Si se acaba de pinear, propagar su posición exacta a todas las demás ventanas
      if (cardCfg.isPinned) {
        state.workspaces.forEach(ws => {
          if (ws.id !== currentWs.id) {
            if (!ws.grid) ws.grid = {};
            ws.grid[widgetId] = JSON.parse(JSON.stringify(cardCfg));
          }
        });
      }

      if (typeof app !== 'undefined' && app.renderBoardEditHandles) {
        app.renderBoardEditHandles();
      }
      if (typeof saveState === 'function') saveState();
    },

    syncPinnedWidgetsTo(targetWs) {
      const currentWs = this.getActiveWorkspace();
      if (!currentWs || !currentWs.grid) return;

      Object.keys(currentWs.grid).forEach(widgetId => {
        if (currentWs.grid[widgetId].isPinned) {
          targetWs.grid[widgetId] = JSON.parse(JSON.stringify(currentWs.grid[widgetId]));
        }
      });
    },

    // Transición suave entre ventanas con View Transitions API o FLIP
    switchWorkspace(targetId) {
      this.ensureWorkspaces();
      if (state.activeWorkspaceId === targetId) return;

      const fromWs = this.getActiveWorkspace();
      const toWs = this.getWorkspaceById(targetId);
      if (!toWs) return;

      state.activeWorkspaceId = targetId;

      // Actualizar índice para compatibilidad con código legado que use activeTab
      const targetIndex = state.workspaces.findIndex(w => w.id === targetId);
      if (targetIndex !== -1) {
        state.activeTab = targetIndex + 1;
      }

      const applyDomChanges = () => {
        this.mountActiveWorkspace();
        this.renderNavBar();
        if (typeof window !== 'undefined' && typeof window.renderApp === 'function') {
          try { window.renderApp(); } catch (e) { console.error('Error in renderApp from switchWorkspace:', e); }
        } else if (typeof renderApp === 'function') {
          try { renderApp(); } catch (e) { console.error('Error in renderApp from switchWorkspace:', e); }
        }
        if (typeof app !== 'undefined' && app.applyGridLayout) {
          app.applyGridLayout();
        }
        if (typeof app !== 'undefined' && state.ui && state.ui.isBoardEditMode) {
          if (typeof app.renderBoardEditHandles === 'function') app.renderBoardEditHandles();
          if (typeof app.renderWidgetsDrawer === 'function') app.renderWidgetsDrawer();
        }
        if (typeof saveState === 'function') saveState();
      };

      // Si el navegador soporta View Transitions API de forma nativa
      if (typeof document !== 'undefined' && document.startViewTransition) {
        // Asignar view-transition-name a los widgets presentes en ambas ventanas para que hagan morphing
        const sharedWidgets = Object.keys(fromWs.grid || {}).filter(id => toWs.grid && toWs.grid[id]);
        sharedWidgets.forEach(id => {
          const el = document.getElementById(id);
          if (el) el.style.viewTransitionName = 'widget-' + id;
        });

        const transition = document.startViewTransition(() => {
          applyDomChanges();
        });

        transition.finished.finally(() => {
          sharedWidgets.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.viewTransitionName = '';
          });
        });
      } else {
        // Fallback directo sin parpadeos
        applyDomChanges();
      }
    },

    // Monta los widgets de la ventana activa en el grid principal mediante Reparenting
    mountActiveWorkspace() {
      this.ensureWorkspaces();
      const ws = this.getActiveWorkspace();
      const gridContainer = document.getElementById('workspaceGrid') || document.getElementById('tab1MainGrid');
      if (!gridContainer || !window.WidgetsRegistry) return;

      // Asegurar que el contenedor principal del workspace sea visible
      const tab1 = document.getElementById('tab1');
      if (tab1) tab1.classList.remove('hidden');
      for (let i = 2; i <= 4; i++) {
        const tabOther = document.getElementById('tab' + i);
        if (tabOther) tabOther.classList.add('hidden');
      }

      const activeWidgets = ws.grid || {};
      const activeIds = Object.keys(activeWidgets);
      const sidebarWidgets = (ws.sidebarWidgets || []).concat((state.globalSidebar && state.globalSidebar.widgets) || []);
      const dockWidgets = ws.dockWidgets || [];
      const allActiveInWorkspace = new Set([...activeIds, ...sidebarWidgets, ...dockWidgets]);

      // Parquea en el pool los widgets que no forman parte de este workspace (ni en grid, ni en sidebar, ni en dock)
      window.WidgetsRegistry.parkInactiveWidgets(Array.from(allActiveInWorkspace));

      // Monta cada widget en el grid
      activeIds.forEach(widgetId => {
        const el = window.WidgetsRegistry.mountWidget(widgetId, gridContainer);
        if (el) {
          const cfg = activeWidgets[widgetId];
          if (cfg && cfg.compact) {
            el.classList.add('card-mode-compact');
          } else {
            el.classList.remove('card-mode-compact');
          }
          el.setAttribute('data-cols', String(cfg && cfg.colSpan ? cfg.colSpan : 12));
        }
      });

      // Monta widgets en la barra lateral (si los hay)
      const sidebarContainer = document.getElementById('sidebarWidgetsContainer');
      const sidebar = document.getElementById('workspaceSidebar');
      if (sidebarContainer) {
        sidebarWidgets.forEach(widgetId => {
          const sEl = window.WidgetsRegistry.mountWidget(widgetId, sidebarContainer);
          if (sEl) {
            sEl.setAttribute('data-cols', '3');
          }
        });
      }

      if (sidebar && !(state.ui && state.ui.isBoardEditMode)) {
        if (sidebarWidgets.length > 0) {
          sidebar.classList.remove('hidden', 'sidebar-collapsed');
          sidebar.classList.add('sidebar-open');
          document.body.classList.add('sidebar-view-open');
        } else {
          sidebar.classList.remove('sidebar-open');
          sidebar.classList.add('hidden', 'sidebar-collapsed');
          document.body.classList.remove('sidebar-view-open');
        }
      }

      // Sincronizar botones de barra de navegación móvil (1-4)
      const targetIndex = state.workspaces.findIndex(w => w.id === ws.id);
      for (let i = 1; i <= 4; i++) {
        const mBtn = document.getElementById(`mobileTabNav${i}`);
        if (mBtn) {
          if (i === (targetIndex + 1)) {
            mBtn.className = 'flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition text-theme-main font-bold';
          } else {
            mBtn.className = 'flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition text-stone-500 dark:text-slate-400 font-bold';
          }
        }
      }
    },

    // Renderiza la barra superior de ventanas
    renderNavBar() {
      const navContainer = document.getElementById('workspacesNavBar');
      if (!navContainer) return;

      const workspaces = this.getWorkspaces();
      navContainer.innerHTML = '';

      workspaces.forEach((ws, idx) => {
        const isActive = ws.id === state.activeWorkspaceId;
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.onclick = () => this.switchWorkspace(ws.id);
        btn.oncontextmenu = (e) => {
          e.preventDefault();
          if (typeof app !== 'undefined' && app.openWorkspaceTabContextMenu) {
            app.openWorkspaceTabContextMenu(e, ws.id);
          }
        };
        btn.className = isActive
          ? 'px-3 py-1.5 rounded-xl bg-theme-main text-white font-bold text-xs flex items-center gap-1.5 shadow-md border border-theme transition scale-[1.02]'
          : 'px-3 py-1.5 rounded-xl bg-theme-soft/50 hover:bg-theme-soft text-stone-300 hover:text-white font-semibold text-xs flex items-center gap-1.5 border border-theme/20 transition';
        
        btn.innerHTML = `
          <span class="shrink-0 text-theme-accent opacity-90">${ws.iconSvg || ''}</span>
          <span class="truncate max-w-[130px]">${ws.name}</span>
          <kbd class="hidden sm:inline px-1 py-0.2 rounded bg-black/40 text-[9px] font-mono opacity-60">${idx + 1}</kbd>
        `;
        navContainer.appendChild(btn);
      });

      // Botón añadir ventana (+)
      const addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.onclick = () => this.promptCreateWorkspace();
      addBtn.title = 'Crear nueva ventana';
      addBtn.className = 'w-7 h-7 rounded-xl bg-theme-soft/30 hover:bg-theme-soft text-theme-main hover:text-white border border-theme/30 flex items-center justify-center font-bold text-sm transition cursor-pointer';
      addBtn.innerHTML = '+';
      navContainer.appendChild(addBtn);
    },

    promptCreateWorkspace() {
      if (typeof app !== 'undefined' && app.showPrompt) {
        app.showPrompt({
          title: 'Nueva Ventana',
          message: 'Escribe el nombre de la nueva ventana de trabajo:',
          placeholder: 'Ej. Estudio Intensivo'
        }).then(val => {
          if (val && val.trim()) {
            this.createWorkspace(val.trim());
          }
        });
      } else {
        const name = window.prompt('Nombre de la nueva ventana:');
        if (name && name.trim()) {
          this.createWorkspace(name.trim());
        }
      }
    },

    // Configura listeners de atajos globales (teclas 1-9)
    setupKeyboardShortcuts() {
      if (typeof window === 'undefined') return;

      window.addEventListener('keydown', (e) => {
        // Ignorar atajos si el usuario está escribiendo en un input, textarea o contenteditable
        const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
        if (activeTag === 'input' || activeTag === 'textarea' || (document.activeElement && document.activeElement.isContentEditable)) {
          return;
        }

        // Teclas numéricas 1 a 9 para conmutar ventanas
        if (!e.ctrlKey && !e.altKey && !e.metaKey && e.key >= '1' && e.key <= '9') {
          const targetIndex = parseInt(e.key, 10) - 1;
          const workspaces = this.getWorkspaces();
          if (workspaces[targetIndex]) {
            e.preventDefault();
            this.switchWorkspace(workspaces[targetIndex].id);
          }
          return;
        }

        // Atajos de widgets y paneles (N, Z, B)
        if (!e.ctrlKey && !e.altKey && !e.metaKey) {
          const k = e.key.toLowerCase();
          if (k === 'n') {
            e.preventDefault();
            if (typeof app !== 'undefined' && app.toggleDockExpense) app.toggleDockExpense();
          } else if (k === 'z') {
            e.preventDefault();
            if (typeof app !== 'undefined' && app.toggleDockPomo) app.toggleDockPomo();
          } else if (k === 'b') {
            e.preventDefault();
            if (typeof app !== 'undefined' && app.toggleSidebar) app.toggleSidebar();
          } else if (k === 'e') {
            e.preventDefault();
            if (typeof app !== 'undefined' && app.toggleBoardEdit) {
              app.toggleBoardEdit();
            }
          }
        }

        // Atajo Escape para salir del modo edición
        if (e.key === 'Escape' && state && state.ui && state.ui.isBoardEditMode) {
          e.preventDefault();
          if (typeof app !== 'undefined' && app.toggleBoardEdit) {
            app.toggleBoardEdit();
          }
        }
      });
    }
  };
})();

if (typeof window !== 'undefined') {
  window.WorkspacesManager = WorkspacesManager;
}
if (typeof global !== 'undefined') {
  global.WorkspacesManager = WorkspacesManager;
}

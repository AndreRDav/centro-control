// CENTRO DE CONTROL - 12-COLUMN GRID ENGINE & DEVICE PROFILES
// Dynamic 12xH Layout, Drag & Drop, Auto-Compact & Device Library
'use strict';

var GridEngine = {
// GESTIÓN DE CUADRÍCULA TETRIS 12xH Y EDICIÓN DE TABLERO
        // ========================================================
        // 1. MEDICIÓN INTRÍNSECA SÍNCRONA ("A MÁS ANCHO, MENOS ALTO", CERO PARPADEO)
        measureNaturalRows(cardEl) {
          if (!cardEl || cardEl.classList.contains('hidden') || cardEl.style.display === 'none') {
            return 0;
          }
          if (cardEl.offsetParent === null) {
            const fallbackMins = {
              todayFocusContainer: 18,
              notesMiniCalendarPanel: 8,
              interactiveListsPanel: 14,
              tab1RecentExpensesBar: 4,
              weekTableContainer: 8,
              tab2ModularHabitsSection: 8,
              tab2ScheduleSection: 14,
              tab2AttendanceRulesSection: 14,
              tab3BudgetConfigCard: 8,
              tab3SavingsGoalsCard: 8,
              tab3PiggyCard: 8,
              tab3FixedExpensesCard: 8,
              tab3ExpensesTableCard: 8,
              tab4StudyAuditSection: 8,
              tab4CustomHabitsSection: 8,
              tab4BiometricsSection: 8,
              tab4EvolutionSection: 12
            };
            const normalFallback = fallbackMins[cardEl.id] || 4;
            return cardEl.classList.contains('card-mode-compact')
              ? Math.max(2, Math.round(normalFallback * 0.45))
              : normalFallback;
          }

          // Guardar temporalmente estilos inline
          const prevAlignSelf = cardEl.style.alignSelf;
          const prevHeight = cardEl.style.height;
          const prevMinHeight = cardEl.style.minHeight;

          // Ocultar temporalmente controles y tiradores para no inflar la medición
          const overlays = cardEl.querySelectorAll('.card-resize-handle, .card-drag-shield, .board-edit-ctrl-overlay');
          overlays.forEach(el => { el.style.display = 'none'; });

          // Aplicar síncronamente sin alterar gridColumn para respetar el ancho exacto
          cardEl.style.alignSelf = 'start';
          cardEl.style.height = 'auto';
          cardEl.style.minHeight = '0px';

          // Leer altura natural del contenido vivo
          const naturalHeightPx = cardEl.getBoundingClientRect().height;

          // Restaurar inmediatamente en la línea siguiente (mismo tick síncrono de JS, cero parpadeo)
          cardEl.style.alignSelf = prevAlignSelf;
          cardEl.style.height = prevHeight;
          cardEl.style.minHeight = prevMinHeight;
          overlays.forEach(el => { el.style.display = ''; });

          const requiredRows = Math.ceil((naturalHeightPx + 12) / 52);
          return Math.max(2, requiredRows);
        },

        // 2. RESOLUCIÓN DE COLISIONES 2D EN CASCADA (CASCADE PUSH)
        resolveGridCollisions(tabKey, priorityId) {
          tabKey = tabKey || ('tab' + (state.activeTab || 1));
          const layout = this.getGridLayout(tabKey);
          const cards = Object.keys(layout).map(id => ({ id, ...layout[id] }));

          let hasCollision = true;
          let iterations = 0;
          const maxIterations = 50;

          while (hasCollision && iterations < maxIterations) {
            hasCollision = false;
            iterations++;

            // Ordenar por fila ascendente, priorizando la tarjeta movida/redimensionada
            cards.sort((a, b) => {
              if (a.id === priorityId) return -1;
              if (b.id === priorityId) return 1;
              return a.row - b.row || a.col - b.col;
            });

            for (let i = 0; i < cards.length; i++) {
              for (let j = i + 1; j < cards.length; j++) {
                const a = cards[i];
                const b = cards[j];

                // Condición 2D de solapamiento estricto
                const colsOverlap = Math.max(a.col, b.col) < Math.min(a.col + a.colSpan, b.col + b.colSpan);
                const rowsOverlap = Math.max(a.row, b.row) < Math.min(a.row + a.rowSpan, b.row + b.rowSpan);

                if (colsOverlap && rowsOverlap) {
                  hasCollision = true;
                  // La tarjeta superior/prioritaria empuja a la inferior justo debajo
                  b.row = a.row + a.rowSpan;
                }
              }
            }
          }

          cards.forEach(c => {
            layout[c.id].row = c.row;
          });
        },

        // 3. GRAVEDAD Y COMPACTACIÓN SKYLINE DE 12 COLUMNAS (0 HUECOS Y 0 SOLAPAMIENTOS)
        compactGrid(tabKey) {
          tabKey = tabKey || ('tab' + (state.activeTab || 1));
          const layout = this.getGridLayout(tabKey);

          // 1. Recalcular minRows para todas las tarjetas visibles
          Object.keys(layout).forEach(id => {
            const el = document.getElementById(id);
            if (el) {
              const minReq = this.measureNaturalRows(el);
              if (minReq > 0) layout[id].minRows = minReq;
            }
            // Alto efectivo: respeta manualRows solo si es mayor que minRows
            layout[id].rowSpan = (layout[id].manualRows && layout[id].manualRows > (layout[id].minRows || 2))
              ? layout[id].manualRows
              : (layout[id].minRows || 2);
          });

          // 2. Algoritmo Skyline de 12 columnas (horizonte de filas libres)
          const cards = Object.keys(layout).map(id => ({ id, ...layout[id] }));
          cards.sort((a, b) => a.row - b.row || a.col - b.col);

          const skyline = new Array(13).fill(1); // Columnas 1 a 12

          cards.forEach(item => {
            const slice = skyline.slice(item.col, item.col + item.colSpan);
            const newRow = Math.max(...slice);
            item.row = newRow;

            const newTop = item.row + item.rowSpan;
            for (let c = item.col; c < item.col + item.colSpan; c++) {
              skyline[c] = newTop;
            }
          });

          cards.forEach(c => {
            layout[c.id].row = c.row;
          });

          this.applyGridLayout(tabKey);
          if (state.ui && state.ui.isBoardEditMode) this.renderBoardEditHandles(tabKey);
          if (typeof saveState === 'function') saveState();
          this.showToast('Tablero compactado hacia arriba (0 huecos y 0 solapamientos).', 'emerald');
        },

        autoFlowGrid(tabKey) {
          // No altera posiciones a menos que se invoque compactGrid explícitamente
        },

        autoLevelGrid(tabKey) {
          this.compactGrid(tabKey);
        },

        getDefaultGridLayout(tabKey) {
          const DEFAULTS = {
            tab1: {
              todayFocusContainer: { col: 1, colSpan: 6, row: 1, minRows: 18, manualRows: null, rowSpan: 18, name: 'Hoy y Hábitos' },
              notesMiniCalendarPanel: { col: 7, colSpan: 6, row: 1, minRows: 8, manualRows: null, rowSpan: 8, name: 'Calendario' },
              interactiveListsPanel: { col: 7, colSpan: 6, row: 9, minRows: 14, manualRows: null, rowSpan: 14, name: 'Listas y Tareas' },
              tab1RecentExpensesBar: { col: 1, colSpan: 6, row: 19, minRows: 4, manualRows: null, rowSpan: 4, name: 'Movimientos Recientes' },
              weekTableContainer: { col: 1, colSpan: 12, row: 23, minRows: 8, manualRows: null, rowSpan: 8, name: 'Matriz Semanal' }
            },
            tab2: {
              tab2ModularHabitsSection: { col: 1, colSpan: 12, row: 1, minRows: 8, manualRows: null, rowSpan: 8, name: 'Plantilla de Metas' },
              tab2ScheduleSection: { col: 1, colSpan: 8, row: 9, minRows: 14, manualRows: null, rowSpan: 14, name: 'Horario Semanal' },
              tab2AttendanceRulesSection: { col: 9, colSpan: 4, row: 9, minRows: 14, manualRows: null, rowSpan: 14, name: 'Reglas de Asistencia' }
            },
            tab3: {
              tab3BudgetConfigCard: { col: 1, colSpan: 6, row: 1, minRows: 8, manualRows: null, rowSpan: 8, name: 'Presupuesto Semanal' },
              tab3SavingsGoalsCard: { col: 7, colSpan: 6, row: 1, minRows: 8, manualRows: null, rowSpan: 8, name: 'Metas de Ahorro' },
              tab3PiggyCard: { col: 1, colSpan: 12, row: 9, minRows: 8, manualRows: null, rowSpan: 8, name: 'Hucha Global' },
              tab3FixedExpensesCard: { col: 1, colSpan: 5, row: 17, minRows: 8, manualRows: null, rowSpan: 8, name: 'Gastos Fijos' },
              tab3ExpensesTableCard: { col: 6, colSpan: 7, row: 17, minRows: 8, manualRows: null, rowSpan: 8, name: 'Tabla de Gastos' }
            },
            tab4: {
              tab4StudyAuditSection: { col: 1, colSpan: 12, row: 1, minRows: 8, manualRows: null, rowSpan: 8, name: 'Auditoría de Estudio' },
              tab4CustomHabitsSection: { col: 1, colSpan: 6, row: 9, minRows: 8, manualRows: null, rowSpan: 8, name: 'Hábitos Personalizados' },
              tab4BiometricsSection: { col: 7, colSpan: 6, row: 9, minRows: 8, manualRows: null, rowSpan: 8, name: 'Biometría y Salud' },
              tab4EvolutionSection: { col: 1, colSpan: 12, row: 17, minRows: 12, manualRows: null, rowSpan: 12, name: 'Histórico y Gráficos' }
            }
          };
          return JSON.parse(JSON.stringify(DEFAULTS[tabKey] || DEFAULTS.tab1));
        },

        getGridLayout(tabKey) {
          if (window.WorkspacesManager && typeof window.WorkspacesManager.getActiveWorkspace === 'function') {
            const ws = window.WorkspacesManager.getActiveWorkspace();
            if (ws && ws.grid) return ws.grid;
          }
          tabKey = tabKey || ('tab' + (state.activeTab || 1));
          if (!state.uiPreferences) state.uiPreferences = {};
          if (!state.uiPreferences.gridLayouts) {
            state.uiPreferences.gridLayouts = {
              desktop: {
                tab1: this.getDefaultGridLayout('tab1'),
                tab2: this.getDefaultGridLayout('tab2'),
                tab3: this.getDefaultGridLayout('tab3'),
                tab4: this.getDefaultGridLayout('tab4')
              },
              mobile: {
                tab1: ['todayFocusContainer', 'interactiveListsPanel', 'tab1RecentExpensesBar', 'notesMiniCalendarPanel', 'weekTableContainer'],
                tab2: ['tab2ModularHabitsSection', 'tab2ScheduleSection', 'tab2AttendanceRulesSection'],
                tab3: ['tab3BudgetConfigCard', 'tab3SavingsGoalsCard', 'tab3PiggyCard', 'tab3ExpensesTableCard', 'tab3FixedExpensesCard'],
                tab4: ['tab4StudyAuditSection', 'tab4CustomHabitsSection', 'tab4BiometricsSection', 'tab4EvolutionSection']
              }
            };
          }
          if (!state.uiPreferences.gridLayouts.desktop) state.uiPreferences.gridLayouts.desktop = {};
          if (!state.uiPreferences.gridLayouts.desktop[tabKey]) {
            state.uiPreferences.gridLayouts.desktop[tabKey] = this.getDefaultGridLayout(tabKey);
          }

          const current = state.uiPreferences.gridLayouts.desktop[tabKey];
          const defaults = this.getDefaultGridLayout(tabKey);

          Object.keys(defaults).forEach(id => {
            if (!current[id]) {
              current[id] = Object.assign({}, defaults[id]);
            } else {
              if (!current[id].name) current[id].name = defaults[id].name;
              if (current[id].manualRows === undefined) current[id].manualRows = null;
              if (current[id].minRows === undefined) current[id].minRows = defaults[id].minRows || 4;
            }
          });

          return current;
        },

        resetToDefaultLayout(tabKey) {
          tabKey = tabKey || ('tab' + (state.activeTab || 1));
          const ws = window.WorkspacesManager ? window.WorkspacesManager.getActiveWorkspace() : null;
          const wsName = ws ? ws.name : 'Ventana Activa';

          const doReset = () => {
            this.recordUndo('Restablecer diseño predeterminado');
            const FACTORY_WORKSPACES = [
              {
                id: 'ws-1',
                name: 'Hoy y Enfoque',
                grid: {
                  topKpisWrapper: { col: 1, colSpan: 12, row: 1, rowSpan: 2, isPinned: false, compact: false },
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
                grid: {
                  tab4StudyAuditSection: { col: 1, colSpan: 12, row: 1, rowSpan: 8, isPinned: false, compact: false },
                  tab4CustomHabitsSection: { col: 1, colSpan: 6, row: 9, rowSpan: 8, isPinned: false, compact: false },
                  tab4BiometricsSection: { col: 7, colSpan: 6, row: 9, rowSpan: 8, isPinned: false, compact: false },
                  tab4EvolutionSection: { col: 1, colSpan: 12, row: 17, rowSpan: 12, isPinned: false, compact: false }
                },
                sidebarWidgets: [],
                dockWidgets: []
              },
              {
                id: 'ws-5',
                name: 'Histórico',
                grid: {
                  tab5HistoryControlsCard: { col: 1, colSpan: 12, row: 1, rowSpan: 8, isPinned: false, compact: false }
                },
                sidebarWidgets: [],
                dockWidgets: []
              }
            ];

            const match = FACTORY_WORKSPACES.find(w => ws && w.id === ws.id) || FACTORY_WORKSPACES[0];
            if (ws) {
              ws.grid = JSON.parse(JSON.stringify(match.grid));
              ws.sidebarWidgets = JSON.parse(JSON.stringify(match.sidebarWidgets || []));
              ws.dockWidgets = JSON.parse(JSON.stringify(match.dockWidgets || []));
            }

            if (state.uiPreferences && state.uiPreferences.gridLayouts && state.uiPreferences.gridLayouts.desktop) {
              state.uiPreferences.gridLayouts.desktop[tabKey] = JSON.parse(JSON.stringify(match.grid));
            }

            if (window.WorkspacesManager && typeof window.WorkspacesManager.mountActiveWorkspace === 'function') {
              window.WorkspacesManager.mountActiveWorkspace();
            }

            this.compactGrid(tabKey);
            this.applyGridLayout(tabKey);
            this.renderBoardEditHandles(tabKey);
            this.renderWidgetsDrawer();
            this.renderDockWidgets();

            if (typeof saveState === 'function') saveState();
            this.safeToast('Diseño predeterminado de "' + wsName + '" restaurado con éxito.', 'emerald');
          };

          if (typeof app !== 'undefined' && app.showConfirm) {
            app.showConfirm({
              title: 'Restablecer Diseño Predeterminado',
              message: '¿Deseas restablecer la ventana actual ("' + wsName + '") a su disposición original predeterminada? Todos los módulos volverán a su posición inicial.',
              confirmText: 'Restablecer',
              cancelText: 'Cancelar',
              isDanger: true
            }).then(confirmed => {
              if (confirmed) doReset();
            });
          } else {
            doReset();
          }
        },

        applyDefaultPreset(tabKey) {
          this.resetToDefaultLayout(tabKey);
        },

        applyDrawingPreset(tabKey) {
          this.resetToDefaultLayout(tabKey);
        },

        restoreFactoryWorkspaces() {
          if (window.WorkspacesManager && typeof window.WorkspacesManager.restoreFactoryWorkspaces === 'function') {
            window.WorkspacesManager.restoreFactoryWorkspaces();
          }
        },

        applyThreeInRowPreset(tabKey) {
          tabKey = tabKey || ('tab' + (state.activeTab || 1));
          const layout = this.getGridLayout(tabKey);
          if (tabKey === 'tab1') {
            layout.todayFocusContainer = { col: 1, colSpan: 6, row: 1, manualRows: null, name: 'Hoy y Hábitos' };
            layout.notesMiniCalendarPanel = { col: 7, colSpan: 3, row: 1, manualRows: null, name: 'Calendario' };
            layout.tab1RecentExpensesBar = { col: 10, colSpan: 3, row: 1, manualRows: null, name: 'Movimientos Recientes' };
            layout.interactiveListsPanel = { col: 7, colSpan: 6, row: 9, manualRows: null, name: 'Listas y Tareas' };
            layout.weekTableContainer = { col: 1, colSpan: 12, row: 20, manualRows: null, name: 'Matriz Semanal' };
          } else {
            const ids = Object.keys(layout);
            if (ids.length >= 3) {
              layout[ids[0]].col = 1; layout[ids[0]].colSpan = 4; layout[ids[0]].row = 1; layout[ids[0]].manualRows = null;
              layout[ids[1]].col = 5; layout[ids[1]].colSpan = 4; layout[ids[1]].row = 1; layout[ids[1]].manualRows = null;
              layout[ids[2]].col = 9; layout[ids[2]].colSpan = 4; layout[ids[2]].row = 1; layout[ids[2]].manualRows = null;
              for (let i = 3; i < ids.length; i++) {
                layout[ids[i]].col = 1; layout[ids[i]].colSpan = 12; layout[ids[i]].row = 20 + i * 10; layout[ids[i]].manualRows = null;
              }
            }
          }
          this.compactGrid(tabKey);
          this.safeToast('Preset 3 en fila aplicado.', 'indigo');
        },

        applyFiftyFiftyPreset(tabKey) {
          tabKey = tabKey || ('tab' + (state.activeTab || 1));
          const layout = this.getGridLayout(tabKey);
          const ids = Object.keys(layout);
          ids.forEach((id, i) => {
            const isLeft = (i % 2 === 0);
            layout[id].col = isLeft ? 1 : 7;
            layout[id].colSpan = 6;
            layout[id].row = 1 + Math.floor(i / 2) * 15;
            layout[id].manualRows = null;
          });
          this.compactGrid(tabKey);
          this.safeToast('Preset 50% / 50% aplicado.', 'emerald');
        },

        applyFullWidthPreset(tabKey) {
          tabKey = tabKey || ('tab' + (state.activeTab || 1));
          const layout = this.getGridLayout(tabKey);
          const ids = Object.keys(layout);
          ids.forEach((id, i) => {
            layout[id].col = 1;
            layout[id].colSpan = 12;
            layout[id].row = 1 + i * 12;
            layout[id].manualRows = null;
          });
          this.compactGrid(tabKey);
          this.safeToast('Todos los módulos en 100% de anchura.', 'emerald');
        },

        // APLICACIÓN DE LAYOUT (DESKTOP: CUADRÍCULA 12xH / MÓVIL: APILADO VERTICAL LIMPIO)
        applyGridLayout(tabKey) {
          tabKey = tabKey || ('tab' + (state.activeTab || 1));
          const isDesktop = (typeof window !== 'undefined' && window.innerWidth >= 1024);
          const layout = this.getGridLayout(tabKey);

          if (isDesktop) {
            Object.keys(layout).forEach(id => {
              const el = document.getElementById(id);
              if (el) {
                const cfg = layout[id];
                const def = window.WidgetsRegistry ? window.WidgetsRegistry.getWidgetDef(id) : null;
                const minCols = (def && def.minColSpan) || cfg.minColSpan || 3;
                if (!cfg.colSpan || cfg.colSpan < minCols) {
                  cfg.colSpan = minCols;
                  if (cfg.col + cfg.colSpan - 1 > 12) {
                    cfg.col = Math.max(1, 13 - cfg.colSpan);
                  }
                }
                // Sincronizar clase card-mode-compact según estado del bloque
                if (cfg.compact) {
                  el.classList.add('card-mode-compact');
                } else {
                  el.classList.remove('card-mode-compact');
                }
                // Calcular filas mínimas según contenido vivo
                const minReq = this.measureNaturalRows(el);
                if (minReq > 0) cfg.minRows = minReq;
                const finalSpan = (cfg.manualRows && cfg.manualRows > cfg.minRows) ? cfg.manualRows : cfg.minRows;
                cfg.rowSpan = finalSpan;

                el.style.gridColumn = cfg.col + ' / span ' + cfg.colSpan;
                el.style.gridRow = cfg.row + ' / span ' + finalSpan;
                el.style.width = '100%';
                el.setAttribute('data-cols', String(cfg.colSpan || 12));
                if (el.closest && el.closest('#sidebarWidgetsContainer')) {
                  el.setAttribute('data-cols', '3');
                }

                if (window.PolymorphicCards) {
                  window.PolymorphicCards.updateCardAspect(id, cfg.colSpan, finalSpan);
                  window.PolymorphicCards.applyVerticalJustification(el, (cfg.manualRows && cfg.manualRows > cfg.minRows));
                }
              }
            });
          } else {
            // MÓVIL (<1024px): desactivar posicionamiento por celdas y permitir apilado vertical limpio
            const mobList = (state.uiPreferences && state.uiPreferences.gridLayouts && state.uiPreferences.gridLayouts.mobile && state.uiPreferences.gridLayouts.mobile[tabKey]) || Object.keys(layout);
            mobList.forEach((id, idx) => {
              const el = document.getElementById(id);
              if (el) {
                el.style.gridColumn = '';
                el.style.gridRow = '';
                el.style.height = '';
                el.style.width = '100%';
                el.style.order = String(idx);
              }
            });
          }
        },

        isBoardEditMode() {
          return !!(state.ui && state.ui.isBoardEditMode);
        },

        
        // ========================================================
        // SISTEMA UNIFICADO DE PERSONALIZACIÓN DEL TABLERO (IN-PLACE)
        // ========================================================
        safeToast(msg, type, duration) {
          if (typeof app !== 'undefined' && typeof app.showToast === 'function') {
            app.showToast(msg, type, duration);
          } else if (typeof window !== 'undefined' && window.app && typeof window.app.showToast === 'function') {
            window.app.showToast(msg, type, duration);
          } else {
            console.log('[Toast ' + (type || 'info') + ']', msg);
          }
        },

        showToast(msg, type, duration) {
          this.safeToast(msg, type, duration);
        },

        recordUndo(actionName = 'Ajustar tablero') {
          if (typeof window !== 'undefined' && typeof window.pushUndo === 'function') {
            window.pushUndo(actionName);
          } else if (typeof pushUndo === 'function') {
            pushUndo(actionName);
          }
        },

        openBlueprintStudio() {
          this.toggleBoardEdit();
        },

        closeBlueprintStudio() {
          if (state && state.ui && state.ui.isBoardEditMode) {
            this.toggleBoardEdit();
          }
        },

        toggleBoardEdit(tabKey) {
          tabKey = tabKey || ('tab' + (state.activeTab || 1));
          if (!state.ui) state.ui = {};
          state.ui.isBoardEditMode = !state.ui.isBoardEditMode;

          const btn = document.getElementById('boardEditToggleBtn') || document.getElementById('personalizeBoardBtn');
          const btnLabel = document.getElementById('boardEditToggleText') || document.getElementById('personalizeBtnLabel') || (btn ? btn.querySelector('span') : null);
          const mainGrid = document.getElementById('tab1MainGrid') || document.querySelector('.dashboard-grid-12');
          const sidebar = document.getElementById('workspaceSidebar');
          const toolbar = document.getElementById('boardEditToolbar');

          if (state.ui.isBoardEditMode) {
            if (btn) {
              btn.className = 'px-3 py-1.5 rounded-xl bg-theme-main text-white font-bold border border-theme text-xs flex items-center gap-1.5 shadow-md transition whitespace-nowrap cursor-pointer';
            }
            if (btnLabel) btnLabel.textContent = 'Guardar';

            document.body.classList.add('board-edit-active');
            if (toolbar) toolbar.classList.remove('hidden');
            if (mainGrid) mainGrid.classList.add('board-edit-active');
            if (sidebar) {
              sidebar.classList.remove('hidden', 'sidebar-collapsed');
              sidebar.classList.add('sidebar-open', 'sidebar-edit-active');
              document.body.classList.add('sidebar-view-open');
              const sContainer = document.getElementById('sidebarWidgetsContainer');
              const ws = window.WorkspacesManager ? window.WorkspacesManager.getActiveWorkspace() : null;
              if (sContainer && (!ws || !ws.sidebarWidgets || ws.sidebarWidgets.length === 0)) {
                let emptyDrop = document.getElementById('sidebarEmptyDropPlaceholder');
                if (!emptyDrop) {
                  emptyDrop = document.createElement('div');
                  emptyDrop.id = 'sidebarEmptyDropPlaceholder';
                  emptyDrop.className = 'p-4 rounded-xl border-2 border-dashed border-theme/40 text-center text-xs text-stone-400 italic my-2';
                  emptyDrop.textContent = 'Arrastra cuadros aquí o pulsa "+ Panel" para fijarlos en el Panel Lateral';
                  sContainer.appendChild(emptyDrop);
                }
              }
            }

            try { this.resolveGridCollisions(tabKey, null); } catch (e) { console.warn('resolveGridCollisions:', e); }
            try { this.applyGridLayout(tabKey); } catch (e) { console.warn('applyGridLayout:', e); }
            try { this.renderBoardEditHandles(tabKey); } catch (e) { console.warn('renderBoardEditHandles:', e); }
            try { this.renderWidgetsDrawer(); } catch (e) { console.warn('renderWidgetsDrawer:', e); }
            try { this.renderDockWidgets(); } catch (e) { console.warn('renderDockWidgets:', e); }
            this.safeToast('Modo Diseño activado: Ajusta y mueve los cuadros en el tablero.', 'emerald');
          } else {
            if (btn) {
              btn.className = 'px-2.5 py-1.5 rounded-xl subpanel-bg border text-xs font-bold flex items-center gap-1.5 hover:border-theme-main transition text-stone-700 dark:text-slate-200 cursor-pointer whitespace-nowrap';
            }
            if (btnLabel) btnLabel.textContent = 'Diseño';

            document.body.classList.remove('board-edit-active', 'drawer-studio-open');
            if (toolbar) toolbar.classList.add('hidden');
            if (mainGrid) mainGrid.classList.remove('board-edit-active');
            if (sidebar) {
              sidebar.classList.remove('sidebar-edit-active');
              const emptyDrop = document.getElementById('sidebarEmptyDropPlaceholder');
              if (emptyDrop) emptyDrop.remove();
              const ws = window.WorkspacesManager ? window.WorkspacesManager.getActiveWorkspace() : null;
              if (!ws || !ws.sidebarWidgets || ws.sidebarWidgets.length === 0) {
                sidebar.classList.remove('sidebar-open');
                sidebar.classList.add('hidden', 'sidebar-collapsed');
                document.body.classList.remove('sidebar-view-open');
              }
            }
            this.closeWidgetsDrawer();

            try { this.removeBoardEditHandles(); } catch (e) { console.warn('removeBoardEditHandles:', e); }
            try { this.applyGridLayout(tabKey); } catch (e) { console.warn('applyGridLayout:', e); }
            if (window.WorkspacesManager) {
              try { window.WorkspacesManager.mountActiveWorkspace(); } catch (e) { console.warn('mountActiveWorkspace:', e); }
            }
            try { this.renderDockWidgets(); } catch (e) { console.warn('renderDockWidgets:', e); }
            if (typeof saveState === 'function') saveState();
            this.safeToast('Diseño del tablero guardado con éxito.', 'emerald');
          }
        },

        renderBoardEditHandles(tabKey) {
          tabKey = tabKey || ('tab' + (state.activeTab || 1));
          const layout = this.getGridLayout(tabKey);
          this.removeBoardEditHandles();

          // Renderizar controles en tarjetas de la cuadrícula
          Object.keys(layout).forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            el.classList.add('card-edit-mode');
            const cfg = layout[id];

            // Escudo protector de arrastre
            const shield = document.createElement('div');
            shield.className = 'card-drag-shield board-edit-ctrl-overlay';
            shield.title = 'Arrastra para mover este cuadro de posición o arrástralo al panel lateral';
            shield.onpointerdown = (e) => this.startCardDrag(e, id);
            el.appendChild(shield);

            // Barra superior de herramientas sobre la tarjeta con nombre humano real y botones nítidos
            const bar = document.createElement('div');
            bar.className = 'board-edit-header-bar board-edit-ctrl-overlay';

            const isPinned = cfg.isPinned || false;
            const isCompact = cfg.compact || el.classList.contains('card-mode-compact');
            const idealRows = (window.PolymorphicCards) ? window.PolymorphicCards.computeIdealRows(el) : (cfg.rowSpan || 6);
            const def = (window.WidgetsRegistry) ? window.WidgetsRegistry.getWidgetDef(id) : { name: id, iconSvg: '' };
            const cardTitle = def.name || cfg.name || id;

            bar.innerHTML = `
              <div class="header-bar-left">
                <span class="header-bar-icon">${def.iconSvg || '<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>'}</span>
                <span class="header-bar-title">${cardTitle}</span>
                <span class="header-bar-coords">${cfg.colSpan}/12c · ${cfg.rowSpan || 4}f</span>
              </div>
              <div class="header-bar-actions">
                <button type="button" onclick="event.stopPropagation(); app.adjustCardSpan('${id}', -1)" title="Reducir ancho (-1 col)" class="header-bar-btn">–</button>
                <button type="button" onclick="event.stopPropagation(); app.adjustCardSpan('${id}', 1)" title="Aumentar ancho (+1 col)" class="header-bar-btn">+</button>
                <button type="button" onclick="event.stopPropagation(); app.toggleWidgetPin('${id}')" title="${isPinned ? 'Desfijar de otras ventanas' : 'Fijar en todas las ventanas'}" class="header-bar-btn ${isPinned ? 'is-active-pin' : ''}">
                  <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14l-1.5-6h-11L5 17z"/><path d="M9 11V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v7"/></svg>
                </button>
                <button type="button" onclick="event.stopPropagation(); app.toggleCompactMode('${id}')" title="Modo Compacto" class="header-bar-btn ${isCompact ? 'is-active-compact' : ''}">
                  <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
                </button>
                <button type="button" onclick="event.stopPropagation(); app.snapCardToIdeal('${id}')" title="Ajustar a tamaño ideal (${idealRows} filas)" class="header-bar-btn">
                  <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                </button>
                <button type="button" onclick="event.stopPropagation(); app.moveCardToSidebar('${id}')" title="Mover a panel lateral" class="header-bar-btn-lateral">
                  <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="15" y1="3" x2="15" y2="21"/></svg>
                  <span>Lateral</span>
                </button>
                <button type="button" onclick="event.stopPropagation(); app.sendWidgetToDrawer('${id}')" title="Inactivar y guardar en cajón" class="header-bar-btn-close">
                  <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
            `;
            el.insertBefore(bar, el.firstChild);

            // Tiradores de redimensión en los 4 bordes y esquina
            const dirMap = { s: 'resize-b', e: 'resize-r', w: 'resize-l', n: 'resize-t', se: 'resize-br' };
            ['s', 'e', 'w', 'n', 'se'].forEach(dir => {
              const handle = document.createElement('div');
              handle.className = 'card-resize-handle ' + dirMap[dir] + ' board-edit-ctrl-overlay';
              handle.title = dir === 'se' ? 'Arrastra para cambiar ancho y altura' : (dir === 'e' || dir === 'w' ? 'Arrastra para cambiar ancho' : 'Arrastra para cambiar altura (Doble clic para ceñir al contenido)');
              handle.onpointerdown = (e) => this.startCardResize(e, id, dir);
              if (dir === 's') {
                handle.ondblclick = (e) => {
                  e.stopPropagation();
                  this.resetCardManualHeight(id);
                };
              }
              el.appendChild(handle);
            });
          });

          // Renderizar controles en tarjetas del panel lateral
          const ws = window.WorkspacesManager ? window.WorkspacesManager.getActiveWorkspace() : null;
          const sidebarCards = (ws && ws.sidebarWidgets) ? ws.sidebarWidgets : [];
          sidebarCards.forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            el.classList.add('card-edit-mode');

            // Escudo de arrastre para mover del sidebar a la cuadrícula
            const sidebarShield = document.createElement('div');
            sidebarShield.className = 'card-drag-shield board-edit-ctrl-overlay';
            sidebarShield.title = 'Arrastra hacia la izquierda para devolver este cuadro al tablero';
            sidebarShield.onpointerdown = (e) => this.startCardDrag(e, id);
            el.appendChild(sidebarShield);

            const bar = document.createElement('div');
            bar.className = 'board-edit-header-bar board-edit-ctrl-overlay';
            const def = (window.WidgetsRegistry) ? window.WidgetsRegistry.getWidgetDef(id) : { name: id };
            const cardTitle = def.name || id;
            bar.innerHTML = `
              <div class="header-bar-left">
                <span class="header-bar-coords">PANEL</span>
                <span class="header-bar-title">${cardTitle}</span>
              </div>
              <div class="header-bar-actions">
                <button type="button" onclick="event.stopPropagation(); app.moveCardFromSidebarToGrid('${id}')" title="Mover a cuadrícula principal" class="header-bar-btn-lateral">
                  <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg>
                  <span>Al Tablero</span>
                </button>
                <button type="button" onclick="event.stopPropagation(); app.sendWidgetToDrawer('${id}')" title="Inactivar y guardar en cajón" class="header-bar-btn-close">
                  <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
            `;
            el.insertBefore(bar, el.firstChild);
          });
        },

        removeBoardEditHandles() {
          document.querySelectorAll('.board-edit-ctrl-overlay').forEach(el => el.remove());
          document.querySelectorAll('.card-blueprint-wireframe').forEach(el => el.remove());
          document.querySelectorAll('.card-edit-mode').forEach(el => el.classList.remove('card-edit-mode'));
          const placeholder = document.getElementById('gridDropPlaceholder');
          if (placeholder) placeholder.style.display = 'none';
        },

        moveCardToSidebar(cardId) {
          if (!window.WorkspacesManager) return;
          const ws = window.WorkspacesManager.getActiveWorkspace();
          if (!ws) return;
          this.recordUndo('Mover a panel lateral');
          if (!ws.sidebarWidgets) ws.sidebarWidgets = [];
          delete ws.grid[cardId];
          if (!ws.sidebarWidgets.includes(cardId)) {
            ws.sidebarWidgets.push(cardId);
          }
          const sidebarContainer = document.getElementById('sidebarWidgetsContainer');
          if (sidebarContainer && window.WidgetsRegistry) {
            window.WidgetsRegistry.mountWidget(cardId, sidebarContainer);
          }
          this.compactGrid();
          this.applyGridLayout();
          this.renderBoardEditHandles();
          this.renderWidgetsDrawer();
          if (typeof saveState === 'function') saveState();
          this.safeToast('Módulo movido a la Barra Lateral.', 'info');
        },

        moveCardFromSidebarToGrid(cardId) {
          if (!window.WorkspacesManager) return;
          const ws = window.WorkspacesManager.getActiveWorkspace();
          if (!ws) return;
          this.recordUndo('Mover a cuadrícula');
          ws.sidebarWidgets = (ws.sidebarWidgets || []).filter(id => id !== cardId);
          const def = (window.WidgetsRegistry) ? window.WidgetsRegistry.getWidgetDef(cardId) : {};
          const maxRow = Object.values(ws.grid || {}).reduce((max, c) => Math.max(max, (c.row || 1) + (c.rowSpan || 6)), 1);
          if (!ws.grid) ws.grid = {};
          ws.grid[cardId] = {
            col: 1,
            colSpan: def.defaultColSpan || 12,
            row: maxRow,
            rowSpan: def.defaultRowSpan || 8,
            minRows: 4,
            manualRows: null,
            isPinned: false,
            compact: false,
            name: def.name || cardId
          };
          const gridContainer = document.getElementById('tab1MainGrid') || document.getElementById('workspaceGrid');
          if (gridContainer && window.WidgetsRegistry) {
            window.WidgetsRegistry.mountWidget(cardId, gridContainer);
          }
          this.resolveGridCollisions(null, cardId);
          this.compactGrid();
          this.applyGridLayout();
          this.renderBoardEditHandles();
          this.renderWidgetsDrawer();
          if (typeof saveState === 'function') saveState();
          this.safeToast('Módulo devuelto a la Cuadrícula.', 'emerald');
        },

        snapCardToIdeal(cardId) {
          if (!window.WorkspacesManager || !window.PolymorphicCards) return;
          const ws = window.WorkspacesManager.getActiveWorkspace();
          if (!ws || !ws.grid || !ws.grid[cardId]) return;
          const el = document.getElementById(cardId);
          if (!el) return;
          const idealRows = window.PolymorphicCards.computeIdealRows(el);
          ws.grid[cardId].rowSpan = idealRows;
          ws.grid[cardId].manualRows = idealRows;
          this.compactGrid();
          this.applyGridLayout();
          this.renderBoardEditHandles();
          if (typeof saveState === 'function') saveState();
          this.safeToast('Módulo ajustado a ' + idealRows + ' filas.', 'emerald');
        },

        renderWidgetsDrawer(selectedCategory = 'all') {
          let drawer = document.getElementById('widgetsDrawer');
          if (!drawer) {
            drawer = document.createElement('div');
            drawer.id = 'widgetsDrawer';
            document.body.appendChild(drawer);
          }

          const ws = (window.WorkspacesManager) ? window.WorkspacesManager.getActiveWorkspace() : null;
          const gridLayout = this.getGridLayout();
          const activeGridIds = new Set(Object.keys(gridLayout || {}));
          const activeSidebarIds = new Set((ws && ws.sidebarWidgets) ? ws.sidebarWidgets : []);
          const activeDockIds = new Set((ws && ws.dockWidgets) ? ws.dockWidgets : []);
          const catalog = (window.WidgetsRegistry) ? window.WidgetsRegistry.getCatalog() : {};

          // Solo excluye los que están activos en la ventana actual
          const isPlacedInWindow = (id) => {
            return activeGridIds.has(id) || activeSidebarIds.has(id) || activeDockIds.has(id);
          };

          const inactiveWidgets = Object.keys(catalog).filter(id => !isPlacedInWindow(id));

          const CATEGORIES = {
            all: 'Todos',
            agenda: 'Notas & Listas',
            habits: 'Hábitos',
            finance: 'Finanzas Pro',
            performance: 'Rendimiento'
          };

          const filteredWidgets = (selectedCategory === 'all')
            ? inactiveWidgets
            : inactiveWidgets.filter(id => {
                const def = catalog[id];
                return def && (def.category === selectedCategory || (selectedCategory === 'performance' && def.category === 'kpis'));
              });

          drawer.className = 'w-80 shrink-0 sticky top-0 h-screen overflow-y-auto z-50 border-r border-theme panel-bg shadow-2xl flex flex-col drawer-open';
          drawer.classList.remove('hidden');
          document.body.classList.add('drawer-studio-open');

          drawer.innerHTML = `
            <div class="p-3 border-b border-theme flex items-center justify-between shrink-0 subpanel-bg">
              <div>
                <h3 class="font-serif font-bold text-xs text-stone-900 dark:text-stone-100 flex items-center gap-1.5">
                  <span class="w-2.5 h-2.5 rounded-full bg-theme-main animate-pulse"></span>
                  <span>Módulos Disponibles (${inactiveWidgets.length})</span>
                </h3>
                <p class="text-[10px] text-stone-500 dark:text-slate-400">Arrastra una miniatura al tablero (crece al 100%)</p>
              </div>
              <button type="button" onclick="app.closeWidgetsDrawer()" class="w-6 h-6 rounded-lg subpanel-bg border border-theme text-stone-500 hover:text-stone-900 dark:hover:text-white flex items-center justify-center text-xs font-bold cursor-pointer" title="Cerrar estudio">✕</button>
            </div>

            <div class="px-2.5 py-1.5 border-b border-theme flex items-center gap-1 overflow-x-auto text-[11px] shrink-0">
              ${Object.keys(CATEGORIES).map(catKey => {
                const isActive = (selectedCategory === catKey);
                return `
                  <button type="button" onclick="app.renderWidgetsDrawer('${catKey}')" class="px-2 py-0.5 rounded-lg text-[10px] font-bold border transition cursor-pointer whitespace-nowrap ${isActive ? 'bg-theme-main text-white border-theme-main shadow-xs' : 'subpanel-bg text-stone-600 dark:text-slate-300 border-theme hover:text-stone-900 dark:hover:text-white'}">
                    ${CATEGORIES[catKey]}
                  </button>
                `;
              }).join('')}
            </div>

            <div class="flex-1 overflow-y-auto p-2.5 space-y-3">
              ${filteredWidgets.length === 0 ? '<p class="text-xs text-stone-400 italic text-center py-6">No hay módulos inactivos en esta categoría.</p>' : ''}
              ${filteredWidgets.map(id => {
                const def = catalog[id] || { name: id, iconSvg: '', defaultColSpan: 6, idealRows: 8 };
                return `
                  <div class="mini-card-item space-y-1" data-cat="${def.category || 'all'}" data-id="${id}">
                    <div class="flex items-center justify-between text-[11px] font-bold text-stone-800 dark:text-slate-200 px-0.5">
                      <span class="flex items-center gap-1.5 truncate">
                        <span class="text-theme-main shrink-0">${def.iconSvg || ''}</span>
                        <span class="truncate">${def.name}</span>
                      </span>
                      <span class="text-[9px] font-mono px-1 rounded bg-theme-soft text-theme-main font-bold border border-theme/30">${def.defaultColSpan || 6}c · ${def.idealRows || 8}f</span>
                    </div>

                    <div class="mini-card-box cursor-grab" onpointerdown="app.startMiniWidgetDrag(event, '${id}')" title="Haz clic y arrastra al tablero para agrandar">
                      <div class="mini-card-scaled">
                        <div class="flex items-center justify-between border-b pb-1 border-stone-300 dark:border-slate-800 font-bold text-xs text-stone-800 dark:text-slate-200">
                          <span class="truncate">${def.name}</span>
                          <span class="w-3.5 h-3.5 rounded bg-theme-soft"></span>
                        </div>
                        <div class="space-y-1.5 opacity-70">
                          <div class="h-6 rounded bg-theme-soft/50 border border-theme/20 w-full"></div>
                          <div class="grid grid-cols-2 gap-1">
                            <div class="h-7 rounded bg-theme-soft/50 border border-theme/20"></div>
                            <div class="h-7 rounded bg-theme-soft/50 border border-theme/20"></div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div class="flex items-center justify-end gap-1 pt-0.5">
                      <button type="button" onclick="app.addInactiveWidgetToGrid('${id}')" class="px-2 py-0.5 rounded bg-theme-soft text-theme-main hover:bg-theme-main hover:text-white text-[10px] font-bold border border-theme transition cursor-pointer">+ Cuadrícula</button>
                      <button type="button" onclick="app.moveCardToSidebar('${id}')" class="px-1.5 py-0.5 rounded subpanel-bg text-stone-600 dark:text-slate-300 hover:border-theme-main text-[10px] font-bold border border-theme transition cursor-pointer">+ Panel</button>
                      <button type="button" onclick="app.addWidgetToDock('${id}')" class="px-1.5 py-0.5 rounded bg-theme-accent-soft text-theme-accent hover:bg-theme-accent hover:text-white text-[10px] font-bold border border-theme transition cursor-pointer" title="Añadir al dock">+ Dock</button>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          `;
        },

        closeWidgetsDrawer() {
          const drawer = document.getElementById('widgetsDrawer');
          if (drawer) {
            drawer.className = 'hidden w-80 shrink-0 sticky top-0 h-screen overflow-y-auto z-50 border-r border-theme panel-bg shadow-2xl flex flex-col';
          }
          document.body.classList.remove('drawer-studio-open');
        },

        toggleWidgetsDrawer() {
          if (document.body.classList.contains('drawer-studio-open')) {
            this.closeWidgetsDrawer();
          } else {
            this.renderWidgetsDrawer();
          }
        },

        // ARRASTRE DE MINIATURAS DEL CAJÓN AL TABLERO (50% ➔ 100%)
        startMiniWidgetDrag(e, widgetId) {
          if (e.button !== 0 && e.pointerType === 'mouse') return;
          e.preventDefault();
          e.stopPropagation();

          const tabKey = 'tab' + (state.activeTab || 1);
          const def = (window.WidgetsRegistry) ? window.WidgetsRegistry.getWidgetDef(widgetId) : { name: widgetId, defaultColSpan: 6, idealRows: 8 };
          const colSpan = def.defaultColSpan || 6;
          const rowSpan = def.idealRows || 8;

          const container = document.getElementById('tab1MainGrid') || document.querySelector('.dashboard-grid-12');
          if (!container) return;

          const ghost = document.getElementById('boardGridDragGhost');
          const badge = document.getElementById('boardGridGhostBadge');
          let placeholder = document.getElementById('gridDropPlaceholder');
          if (!placeholder && container) {
            placeholder = document.createElement('div');
            placeholder.id = 'gridDropPlaceholder';
            placeholder.className = 'grid-drop-placeholder';
            container.appendChild(placeholder);
          }

          const gap = 12;
          const curContainerRect = container.getBoundingClientRect();
          const colWidth = (curContainerRect.width - 11 * gap) / 12;
          const colPitch = colWidth + gap;
          const rowPitch = 40 + gap;

          const ghostW = Math.round(colSpan * colPitch - gap);
          const ghostH = Math.round(rowSpan * rowPitch - gap);

          if (ghost) {
            ghost.style.width = ghostW + 'px';
            ghost.style.height = ghostH + 'px';
            ghost.style.left = (e.clientX - 100) + 'px';
            ghost.style.top = (e.clientY - 40) + 'px';
            ghost.style.display = 'flex';
            ghost.classList.remove('ghost-scaling-up');
            void ghost.offsetWidth;
            ghost.classList.add('ghost-scaling-up');
            if (badge) badge.textContent = 'Módulo: ' + (def.name || widgetId);
          }

          let targetCol = 1;
          let targetRow = 1;
          let isHoveringSidebar = false;

          const updateMiniDragPos = (me) => {
            const curX = me.clientX;
            const curY = me.clientY;

            // Auto-scroll si está cerca de bordes
            const edgeZone = 65;
            const scrollSpeed = 15;
            if (curY > window.innerHeight - edgeZone) {
              window.scrollBy({ top: scrollSpeed, behavior: 'instant' });
            } else if (curY < edgeZone && window.scrollY > 0) {
              window.scrollBy({ top: -scrollSpeed, behavior: 'instant' });
            }

            // Detección de panel lateral
            const sidebarEl = document.getElementById('workspaceSidebar');
            const sidebarRect = (sidebarEl && !sidebarEl.classList.contains('hidden')) ? sidebarEl.getBoundingClientRect() : null;
            isHoveringSidebar = !!(sidebarRect && (
              curX >= sidebarRect.left && curX <= sidebarRect.right &&
              curY >= sidebarRect.top && curY <= sidebarRect.bottom
            ));

            if (isHoveringSidebar) {
              if (ghost) {
                ghost.style.left = (sidebarRect.left + 8) + 'px';
                ghost.style.top = Math.max(sidebarRect.top + 45, curY - 25) + 'px';
                ghost.style.width = (sidebarRect.width - 16) + 'px';
                ghost.style.height = '60px';
              }
              if (placeholder) placeholder.style.display = 'none';
              if (badge) badge.textContent = (def.name || widgetId) + ' → Soltar en Panel Lateral';
              return;
            }

            const cRect = container.getBoundingClientRect();
            const relX = curX - (ghostW / 2) - cRect.left;
            const relY = curY - 30 - cRect.top;

            let c = Math.round(relX / colPitch) + 1;
            let r = Math.round(relY / rowPitch) + 1;

            c = Math.max(1, Math.min(13 - colSpan, c));
            r = Math.max(1, r);

            targetCol = c;
            targetRow = r;

            const snapLeft = cRect.left + (c - 1) * colPitch;
            const snapTop = cRect.top + (r - 1) * rowPitch;

            if (ghost) {
              ghost.style.left = snapLeft + 'px';
              ghost.style.top = snapTop + 'px';
              ghost.style.width = ghostW + 'px';
              ghost.style.height = ghostH + 'px';
            }
            if (placeholder) {
              placeholder.style.gridColumn = targetCol + ' / span ' + colSpan;
              placeholder.style.gridRow = targetRow + ' / span ' + rowSpan;
              placeholder.style.display = 'block';
            }
            if (badge) {
              badge.textContent = (def.name || widgetId) + ' → Col ' + targetCol + ' · Fila ' + targetRow;
            }
          };

          const onPointerMove = (me) => updateMiniDragPos(me);

          const onPointerUp = () => {
            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('pointerup', onPointerUp);
            window.removeEventListener('pointercancel', onPointerUp);

            if (ghost) {
              ghost.style.display = 'none';
              ghost.classList.remove('ghost-scaling-up');
            }
            if (placeholder) placeholder.style.display = 'none';

            this.recordUndo('Añadir módulo');
            if (isHoveringSidebar) {
              this.moveCardToSidebar(widgetId);
              return;
            }

            this.addInactiveWidgetToGrid(widgetId, targetCol, targetRow, colSpan, rowSpan);
          };

          window.addEventListener('pointermove', onPointerMove);
          window.addEventListener('pointerup', onPointerUp);
          window.addEventListener('pointercancel', onPointerUp);
        },

        addWidgetToDock(widgetId) {
          if (!window.WorkspacesManager) return;
          const ws = window.WorkspacesManager.getActiveWorkspace();
          if (!ws) return;
          this.recordUndo('Añadir al Dock');
          if (!ws.dockWidgets) ws.dockWidgets = [];
          if (!ws.dockWidgets.includes(widgetId)) {
            ws.dockWidgets.push(widgetId);
          }
          if (ws.grid && ws.grid[widgetId]) delete ws.grid[widgetId];
          if (ws.sidebarWidgets) ws.sidebarWidgets = ws.sidebarWidgets.filter(x => x !== widgetId);
          
          this.renderDockWidgets();
          this.compactGrid();
          this.applyGridLayout();
          this.renderBoardEditHandles();
          this.renderWidgetsDrawer();
          if (typeof saveState === 'function') saveState();
          this.safeToast('Módulo añadido al Dock como popup.', 'emerald');
        },

        removeWidgetFromDock(widgetId) {
          if (!window.WorkspacesManager) return;
          const ws = window.WorkspacesManager.getActiveWorkspace();
          if (!ws || !ws.dockWidgets) return;
          this.recordUndo('Quitar del Dock');
          ws.dockWidgets = ws.dockWidgets.filter(x => x !== widgetId);
          if (window.WidgetsRegistry) {
            window.WidgetsRegistry.parkWidget(widgetId);
          }
          this.renderDockWidgets();
          this.renderWidgetsDrawer();
          if (typeof saveState === 'function') saveState();
          this.safeToast('Módulo quitado del Dock.', 'info');
        },

        renderDockWidgets() {
          const ws = (window.WorkspacesManager) ? window.WorkspacesManager.getActiveWorkspace() : null;
          const dockList = (ws && ws.dockWidgets) ? ws.dockWidgets : [];
          let container = document.getElementById('dockCustomPills');
          if (!container) {
            const pillsWrap = document.querySelector('#floatingDock > .flex.items-center.gap-2');
            if (pillsWrap) {
              container = document.createElement('div');
              container.id = 'dockCustomPills';
              container.className = 'flex items-center gap-2';
              pillsWrap.appendChild(container);
            }
          }
          if (!container) return;
          container.innerHTML = '';

          const isEditMode = (state.ui && state.ui.isBoardEditMode);
          dockList.forEach(id => {
            const def = (window.WidgetsRegistry) ? window.WidgetsRegistry.getWidgetDef(id) : { name: id, iconSvg: '' };
            const pill = document.createElement('div');
            pill.className = 'dock-glass border px-2.5 py-1.5 rounded-full flex items-center gap-1.5 text-xs font-bold shadow-lg transition-all cursor-pointer relative';
            pill.setAttribute('data-dock-pill-id', id);
            pill.innerHTML = `
              <span class="text-emerald-400 shrink-0">${def.iconSvg || ''}</span>
              <span class="text-[11px] truncate max-w-[90px]">${def.name}</span>
              ${isEditMode ? `<button type="button" onclick="event.stopPropagation(); app.removeWidgetFromDock('${id}')" class="w-4 h-4 rounded-full bg-rose-500/20 text-rose-400 hover:bg-rose-500 hover:text-white flex items-center justify-center text-[10px] ml-1">✕</button>` : ''}
            `;
            pill.onclick = () => {
              this.toggleDockCustomWindow(id);
            };
            container.appendChild(pill);
          });
        },

        toggleDockCustomWindow(widgetId) {
          const sidebar = document.getElementById('dockRightSidebar');
          const isVisible = sidebar && !sidebar.classList.contains('hidden');
          if (isVisible && typeof app !== 'undefined' && app.activeDockTool === widgetId) {
            if (app.closeDockSidebar) app.closeDockSidebar();
          } else {
            if (typeof app !== 'undefined' && app.openDockSidebar) {
              app.openDockSidebar(widgetId);
            }
          }
        },

        toggleWidgetPin(cardId) {
          if (window.WorkspacesManager) {
            window.WorkspacesManager.toggleWidgetPin(cardId);
            this.safeToast('Estado de fijado actualizado para este cuadro.', 'emerald');
          }
        },

        toggleCompactMode(cardId) {
          return this.toggleCardCompact(cardId);
        },

        toggleCardCompact(cardId) {
          const el = document.getElementById(cardId);
          if (window.PolymorphicCards) {
            this.recordUndo('Modo compacto');
            const isComp = window.PolymorphicCards.toggleCompactMode(cardId);
            if (el) {
              if (isComp) el.classList.add('card-mode-compact');
              else el.classList.remove('card-mode-compact');
            }
            const ws = window.WorkspacesManager ? window.WorkspacesManager.getActiveWorkspace() : null;
            if (ws && ws.grid && ws.grid[cardId]) {
              const cfg = ws.grid[cardId];
              cfg.compact = isComp;
              if (isComp) {
                const liveCompRows = this.measureNaturalRows(el);
                const compactRows = Math.max(2, liveCompRows);
                cfg.rowSpan = compactRows;
                cfg.manualRows = compactRows;
              } else {
                const liveNormRows = this.measureNaturalRows(el);
                cfg.rowSpan = Math.max(3, liveNormRows);
                cfg.manualRows = null;
              }
            }
            this.compactGrid();
            this.applyGridLayout();
            this.renderBoardEditHandles();
            if (cardId === 'todayFocusContainer') {
              if (typeof window.renderDailyHabits === 'function') window.renderDailyHabits();
              else if (typeof app !== 'undefined' && typeof app.renderDailyHabits === 'function') app.renderDailyHabits();
            }
            this.safeToast(isComp ? 'Modo Compacto activado: micro-cuadrícula acoplada (espacio economizado).' : 'Modo Normal restaurado.', 'emerald');
            if (typeof saveState === 'function') saveState();
            return isComp;
          }
          return false;
        },

        sendWidgetToDrawer(cardId) {
          const ws = window.WorkspacesManager ? window.WorkspacesManager.getActiveWorkspace() : null;
          this.recordUndo('Inactivar módulo');
          const layout = this.getGridLayout();
          let cardName = cardId;
          if (layout && layout[cardId]) {
            cardName = layout[cardId].name || cardId;
            delete layout[cardId];
          }
          if (ws && ws.sidebarWidgets && ws.sidebarWidgets.includes(cardId)) {
            ws.sidebarWidgets = ws.sidebarWidgets.filter(x => x !== cardId);
          }
          if (ws && ws.dockWidgets && ws.dockWidgets.includes(cardId)) {
            ws.dockWidgets = ws.dockWidgets.filter(x => x !== cardId);
          }
          if (window.WidgetsRegistry) {
            const def = window.WidgetsRegistry.getWidgetDef(cardId);
            if (def) cardName = def.name;
            window.WidgetsRegistry.parkWidget(cardId);
          }
          this.compactGrid();
          this.applyGridLayout();
          this.renderBoardEditHandles();
          this.renderWidgetsDrawer();
          this.renderDockWidgets();
          if (typeof saveState === 'function') saveState();
          this.safeToast('Módulo "' + cardName + '" guardado en el Cajón de Inactivos.', 'indigo');
        },
        addInactiveWidgetToGrid(widgetId, customCol, customRow, customColSpan, customRowSpan) {
          const tabKey = 'tab' + (state.activeTab || 1);
          const layout = this.getGridLayout(tabKey);
          if (!layout || !window.WidgetsRegistry) return;

          const def = window.WidgetsRegistry.getWidgetDef(widgetId);
          if (!def) return;

          this.recordUndo('Añadir módulo a cuadrícula');

          const maxRow = Object.values(layout).reduce((max, c) => Math.max(max, (c.row || 1) + (c.rowSpan || 2)), 1);
          const cCol = (customCol !== undefined && customCol !== null) ? customCol : 1;
          const cRow = (customRow !== undefined && customRow !== null) ? customRow : maxRow;
          const cSpan = customColSpan || def.defaultColSpan || 6;
          const rSpan = customRowSpan || def.idealRows || def.minRows || 6;

          layout[widgetId] = {
            col: cCol,
            colSpan: cSpan,
            row: cRow,
            minRows: def.minRows || 4,
            rowSpan: rSpan,
            manualRows: null,
            isPinned: false,
            compact: false,
            name: def.name
          };

          const ws = (window.WorkspacesManager) ? window.WorkspacesManager.getActiveWorkspace() : null;
          if (ws && ws.sidebarWidgets) {
            ws.sidebarWidgets = ws.sidebarWidgets.filter(id => id !== widgetId);
          }
          if (ws && ws.dockWidgets) {
            ws.dockWidgets = ws.dockWidgets.filter(id => id !== widgetId);
          }

          const gridContainer = document.getElementById('workspaceGrid') || document.getElementById('tab' + (state.activeTab || 1) + 'MainGrid') || document.getElementById('tab1MainGrid');
          if (gridContainer) {
            window.WidgetsRegistry.mountWidget(widgetId, gridContainer);
          }

          this.resolveGridCollisions(tabKey, widgetId);
          this.compactGrid(tabKey);
          this.applyGridLayout(tabKey);
          this.renderBoardEditHandles(tabKey);
          this.renderWidgetsDrawer();
          this.renderDockWidgets();
          if (typeof saveState === 'function') saveState();
          this.showToast('Cuadro "' + def.name + '" añadido al tablero.', 'emerald');
        },
        resetCardManualHeight(cardId) {
          const tabKey = 'tab' + (state.activeTab || 1);
          const layout = this.getGridLayout(tabKey);
          if (!layout[cardId]) return;
          const cfg = layout[cardId];
          cfg.manualRows = null;
          const el = document.getElementById(cardId);
          if (el) {
            const natural = this.measureNaturalRows(el);
            if (natural > 0) {
              cfg.minRows = natural;
              cfg.rowSpan = natural;
            }
          }
          this.compactGrid(tabKey);
          this.applyGridLayout(tabKey);
          this.renderBoardEditHandles(tabKey);
          if (typeof saveState === 'function') saveState();
          this.safeToast('Tarjeta auto-ceñida a su contenido.', 'emerald');
        },

        // REGLA "A MÁS ANCHO, MENOS ALTO": AL CAMBIAR COLSPAN, RECALCULA MINROWS AUTOMÁTICAMENTE
        adjustCardSpan(cardId, delta) {
          const tabKey = 'tab' + (state.activeTab || 1);
          const layout = this.getGridLayout(tabKey);
          const cfg = layout[cardId];
          const el = document.getElementById(cardId);
          if (!cfg || !el) return;

          const def = window.WidgetsRegistry ? window.WidgetsRegistry.getWidgetDef(cardId) : null;
          const minColSpan = (def && def.minColSpan) || cfg.minColSpan || 3;
          const newSpan = cfg.colSpan + delta;
          if (newSpan >= minColSpan && cfg.col + newSpan - 1 <= 12) {
            this.recordUndo('Ajustar tamaño de tarjeta');
            cfg.colSpan = newSpan;
            cfg.manualRows = null; // Resetear altura manual para que se ciña a la nueva anchura

            // Aplicar nuevo gridColumn síncronamente para que los hijos hagan reflow
            el.style.gridColumn = cfg.col + ' / span ' + newSpan;
            cfg.minRows = this.measureNaturalRows(el);
            cfg.rowSpan = cfg.minRows;

            this.resolveGridCollisions(tabKey, cardId);
            this.applyGridLayout(tabKey);
            this.renderBoardEditHandles(tabKey);
            if (typeof saveState === 'function') saveState();
          }
        },

        adjustCardCol(cardId, delta) {
          const tabKey = 'tab' + (state.activeTab || 1);
          const layout = this.getGridLayout(tabKey);
          const cfg = layout[cardId];
          if (!cfg) return;
          const newCol = cfg.col + delta;
          if (newCol >= 1 && newCol + cfg.colSpan - 1 <= 12) {
            this.recordUndo('Mover tarjeta');
            cfg.col = newCol;
            this.resolveGridCollisions(tabKey, cardId);
            this.applyGridLayout(tabKey);
            this.renderBoardEditHandles(tabKey);
            if (typeof saveState === 'function') saveState();
          }
        },

        adjustCardRow(cardId, delta) {
          const tabKey = 'tab' + (state.activeTab || 1);
          const layout = this.getGridLayout(tabKey);
          const cfg = layout[cardId];
          if (!cfg) return;
          const newRow = cfg.row + delta;
          if (newRow >= 1) {
            cfg.row = newRow;
            this.resolveGridCollisions(tabKey, cardId);
            this.applyGridLayout(tabKey);
            this.renderBoardEditHandles(tabKey);
            if (typeof saveState === 'function') saveState();
          }
        },

        // ARRASTRE FLUIDO ENTRE CUADRÍCULA Y PANEL LATERAL (.grid-drop-placeholder)
        startCardDrag(e, cardId) {
          if (e.button !== 0 && e.pointerType === 'mouse') return;
          e.preventDefault();
          e.stopPropagation();

          const tabKey = 'tab' + (state.activeTab || 1);
          const layout = this.getGridLayout(tabKey);
          const cfg = layout[cardId] || { col: 1, colSpan: 12, row: 1, rowSpan: 6, name: cardId };
          const el = document.getElementById(cardId);
          if (!el) return;

          const ws = window.WorkspacesManager ? window.WorkspacesManager.getActiveWorkspace() : null;
          const isFromSidebar = ws && ws.sidebarWidgets && ws.sidebarWidgets.includes(cardId);

          const container = document.getElementById('tab1MainGrid') || el.parentElement || el;
          const cardRect = el.getBoundingClientRect();

          // Offset exacto del cursor respecto a la esquina superior izquierda de la tarjeta
          const grabOffsetX = e.clientX - cardRect.left;
          const grabOffsetY = e.clientY - cardRect.top;

          const gap = 12;

          const ghost = document.getElementById('boardGridDragGhost');
          const badge = document.getElementById('boardGridGhostBadge');
          let placeholder = document.getElementById('gridDropPlaceholder');
          if (!placeholder && container) {
            placeholder = document.createElement('div');
            placeholder.id = 'gridDropPlaceholder';
            placeholder.className = 'grid-drop-placeholder';
            container.appendChild(placeholder);
          }

          if (ghost) {
            ghost.style.width = cardRect.width + 'px';
            ghost.style.height = cardRect.height + 'px';
            ghost.style.left = cardRect.left + 'px';
            ghost.style.top = cardRect.top + 'px';
            ghost.style.display = 'flex';
            if (badge) badge.textContent = 'Moviendo: ' + (cfg.name || cardId);
          }
          if (placeholder && !isFromSidebar) {
            placeholder.style.gridColumn = cfg.col + ' / span ' + cfg.colSpan;
            placeholder.style.gridRow = cfg.row + ' / span ' + cfg.rowSpan;
            placeholder.style.display = 'block';
          }
          el.style.opacity = '0.35';

          let targetCol = cfg.col || 1;
          let targetRow = cfg.row || 1;
          let lastMoveEvent = e;
          let isHoveringSidebar = false;
          let isHoveringDrawer = false;

          const updateDragPosition = (moveEvent) => {
            if (moveEvent) lastMoveEvent = moveEvent;
            const evt = moveEvent || lastMoveEvent;
            if (!evt) return;

            const curX = evt.clientX;
            const curY = evt.clientY;

            // Auto-scroll suave si el usuario arrastra cerca de los bordes del viewport
            const edgeZone = 65;
            const scrollSpeed = 15;
            if (curY > window.innerHeight - edgeZone) {
              window.scrollBy({ top: scrollSpeed, behavior: 'instant' });
            } else if (curY < edgeZone && window.scrollY > 0) {
              window.scrollBy({ top: -scrollSpeed, behavior: 'instant' });
            }

            // Detección de arrastre sobre el cajón de módulos inactivos (#widgetsDrawer)
            const drawerEl = document.getElementById('widgetsDrawer');
            const drawerRect = (drawerEl && drawerEl.classList.contains('drawer-open') && !drawerEl.classList.contains('hidden'))
              ? drawerEl.getBoundingClientRect()
              : null;
            isHoveringDrawer = !!(drawerRect && (
              curX >= drawerRect.left && curX <= drawerRect.right &&
              curY >= drawerRect.top && curY <= drawerRect.bottom
            ));

            if (isHoveringDrawer) {
              if (ghost) {
                ghost.style.left = (drawerRect.left + 16) + 'px';
                ghost.style.top = Math.max(drawerRect.top + 50, curY - 30) + 'px';
                ghost.style.width = (drawerRect.width - 32) + 'px';
                ghost.style.height = '64px';
              }
              if (placeholder) placeholder.style.display = 'none';
              if (badge) badge.textContent = (cfg.name || cardId) + ' → Soltar para Inactivar y Guardar en Cajón';
              drawerEl.classList.add('drawer-drop-highlight');
              return;
            } else if (drawerEl) {
              drawerEl.classList.remove('drawer-drop-highlight');
            }

            // Detección de arrastre sobre el panel lateral (sidebar)
            const sidebarEl = document.getElementById('workspaceSidebar');
            const sidebarRect = (sidebarEl && !sidebarEl.classList.contains('hidden')) ? sidebarEl.getBoundingClientRect() : null;
            isHoveringSidebar = !!(sidebarRect && (
              curX >= sidebarRect.left && curX <= sidebarRect.right &&
              curY >= sidebarRect.top && curY <= sidebarRect.bottom
            ));

            if (isHoveringSidebar) {
              if (ghost) {
                ghost.style.left = (sidebarRect.left + 8) + 'px';
                ghost.style.top = Math.max(sidebarRect.top + 45, curY - 25) + 'px';
                ghost.style.width = (sidebarRect.width - 16) + 'px';
                ghost.style.height = '60px';
              }
              if (placeholder) placeholder.style.display = 'none';
              if (badge) badge.textContent = (cfg.name || cardId) + ' → Soltar en Panel Lateral';
              return;
            }

            // Medición DINÁMICA en vivo de la posición del contenedor en el viewport actual (inmune a scroll)
            const curContainerRect = container.getBoundingClientRect ? container.getBoundingClientRect() : el.getBoundingClientRect();
            const colWidth = (curContainerRect.width - 11 * gap) / 12;
            const colPitch = colWidth + gap;
            const rowPitch = 40 + gap; // 52px

            // Coordenadas exactas relativas al contenedor en tiempo real
            const cardLeft = curX - grabOffsetX;
            const cardTop = curY - grabOffsetY;
            const relX = cardLeft - curContainerRect.left;
            const relY = cardTop - curContainerRect.top;

            const effectiveColSpan = cfg.colSpan || 12;
            let c = Math.round(relX / colPitch) + 1;
            let r = Math.round(relY / rowPitch) + 1;

            c = Math.max(1, Math.min(13 - effectiveColSpan, c));
            r = Math.max(1, r);

            targetCol = c;
            targetRow = r;

            // Recuadro fantasma y placeholder imantados exactamente a la misma celda física
            const snapLeft = curContainerRect.left + (c - 1) * colPitch;
            const snapTop = curContainerRect.top + (r - 1) * rowPitch;
            const snapWidth = effectiveColSpan * colPitch - gap;
            const snapHeight = ((cfg.rowSpan || 4) * rowPitch) - gap;

            if (ghost) {
              ghost.style.left = snapLeft + 'px';
              ghost.style.top = snapTop + 'px';
              ghost.style.width = snapWidth + 'px';
              ghost.style.height = snapHeight + 'px';
            }
            if (placeholder) {
              placeholder.style.gridColumn = targetCol + ' / span ' + effectiveColSpan;
              placeholder.style.gridRow = targetRow + ' / span ' + (cfg.rowSpan || 4);
              placeholder.style.display = 'block';
            }

            if (badge) {
              badge.textContent = (cfg.name || cardId) + ' → Columna ' + targetCol + ' · Fila ' + targetRow;
            }
          };

          const onPointerMove = (moveEvent) => {
            updateDragPosition(moveEvent);
          };

          const onScroll = () => {
            updateDragPosition(lastMoveEvent);
          };

          const onPointerUp = () => {
            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('pointerup', onPointerUp);
            window.removeEventListener('pointercancel', onPointerUp);
            window.removeEventListener('scroll', onScroll);

            const drawerEl = document.getElementById('widgetsDrawer');
            if (drawerEl) drawerEl.classList.remove('drawer-drop-highlight');

            if (ghost) ghost.style.display = 'none';
            if (placeholder) placeholder.style.display = 'none';
            el.style.opacity = '1';

            if (isHoveringDrawer || isHoveringSidebar || isFromSidebar || targetCol !== cfg.col || targetRow !== cfg.row) {
              this.recordUndo('Mover cuadro');
            }

            if (isHoveringDrawer) {
              this.sendWidgetToDrawer(cardId);
              return;
            }

            if (isHoveringSidebar) {
              this.moveCardToSidebar(cardId);
              return;
            }

            if (isFromSidebar) {
              this.moveCardFromSidebarToGrid(cardId);
              const curLayout = this.getGridLayout(tabKey);
              if (curLayout && curLayout[cardId]) {
                curLayout[cardId].col = targetCol;
                curLayout[cardId].row = targetRow;
              }
            } else {
              cfg.col = targetCol;
              cfg.row = targetRow;
            }

            // Resolver colisiones 2D en cascada
            this.resolveGridCollisions(tabKey, cardId);
            this.applyGridLayout(tabKey);
            this.renderBoardEditHandles(tabKey);
            if (typeof saveState === 'function') saveState();
          };

          window.addEventListener('pointermove', onPointerMove);
          window.addEventListener('pointerup', onPointerUp);
          window.addEventListener('pointercancel', onPointerUp);
          window.addEventListener('scroll', onScroll, { passive: true });
        },

        // REDIMENSIÓN MANUAL DIRECTA EN LOS 4 BORDES Y ESQUINAS (TOP, BOTTOM, LEFT, RIGHT)
        startCardResize(e, cardId, direction) {
          if (e.button !== 0 && e.pointerType === 'mouse') return;
          e.preventDefault();
          e.stopPropagation();

          const tabKey = 'tab' + (state.activeTab || 1);
          const layout = this.getGridLayout(tabKey);
          const cfg = layout[cardId];
          const el = document.getElementById(cardId);
          if (!cfg || !el) return;

          const container = document.getElementById('tab1MainGrid') || el.parentElement || el;
          const cardRect = el.getBoundingClientRect();

          // Puntos iniciales absolutos inmunes al scroll
          const startX = e.clientX + window.scrollX;
          const startY = e.clientY + window.scrollY;

          const origCol = cfg.col;
          const origColSpan = cfg.colSpan;
          const origRow = cfg.row;
          const origRowSpan = cfg.rowSpan || 2;

          // Medir altura mínima y tamaño óptimo recomendados
          let liveMinRows = this.measureNaturalRows(el);
          cfg.minRows = liveMinRows;
          const liveIdealRows = (window.PolymorphicCards && typeof window.PolymorphicCards.computeIdealRows === 'function')
            ? window.PolymorphicCards.computeIdealRows(el)
            : liveMinRows;

          const gap = 12;

          const ghost = document.getElementById('boardGridDragGhost');
          const badge = document.getElementById('boardGridGhostBadge');
          let placeholder = document.getElementById('gridDropPlaceholder');
          if (!placeholder && container) {
            placeholder = document.createElement('div');
            placeholder.id = 'gridDropPlaceholder';
            placeholder.className = 'grid-drop-placeholder';
            container.appendChild(placeholder);
          }

          if (ghost) {
            ghost.style.left = cardRect.left + 'px';
            ghost.style.top = cardRect.top + 'px';
            ghost.style.width = cardRect.width + 'px';
            ghost.style.height = cardRect.height + 'px';
            ghost.style.display = 'flex';
          }
          if (placeholder) {
            placeholder.style.gridColumn = cfg.col + ' / span ' + cfg.colSpan;
            placeholder.style.gridRow = cfg.row + ' / span ' + cfg.rowSpan;
            placeholder.style.display = 'block';
          }
          el.style.opacity = '0.35';

          let finalCol = origCol;
          let finalColSpan = origColSpan;
          let finalRow = origRow;
          let finalRowSpan = origRowSpan;
          let lastResizeEvent = e;

          const isLeft = direction.includes('l') || direction.includes('w');
          const isRight = direction.includes('r') || direction.includes('e');
          const isTop = direction.includes('t') || direction.includes('n');
          const isBottom = direction.includes('b') || direction.includes('s');

          const updateResizePosition = (moveEvent) => {
            if (moveEvent) lastResizeEvent = moveEvent;
            const evt = moveEvent || lastResizeEvent;
            if (!evt) return;

            // Medición DINÁMICA en vivo del contenedor
            const curContainerRect = container.getBoundingClientRect ? container.getBoundingClientRect() : el.getBoundingClientRect();
            const colWidth = (curContainerRect.width - 11 * gap) / 12;
            const colPitch = colWidth + gap;
            const rowPitch = 40 + gap; // 52px

            const curPageX = evt.clientX + window.scrollX;
            const curPageY = evt.clientY + window.scrollY;
            const dx = curPageX - startX;
            const dy = curPageY - startY;

            const deltaCols = Math.round(dx / colPitch);
            const deltaRows = Math.round(dy / rowPitch);

            let c = origCol;
            let cSpan = origColSpan;
            let r = origRow;
            let rSpan = origRowSpan;

            const def = window.WidgetsRegistry ? window.WidgetsRegistry.getWidgetDef(cardId) : null;
            const minColSpan = (def && def.minColSpan) || cfg.minColSpan || 3;

            if (isLeft) {
              const origRight = origCol + origColSpan;
              c = Math.max(1, Math.min(origRight - minColSpan, origCol + deltaCols));
              cSpan = Math.max(minColSpan, origRight - c);
            } else if (isRight) {
              const maxSpan = 13 - origCol;
              cSpan = Math.max(minColSpan, Math.min(maxSpan, origColSpan + deltaCols));
            }

            // Reflow en vivo de tarjetas internas al arrastrar bordes horizontales
            if (isLeft || isRight) {
              el.style.gridColumn = c + ' / span ' + cSpan;
              el.setAttribute('data-cols', String(cSpan));
              liveMinRows = this.measureNaturalRows(el);
              cfg.minRows = liveMinRows;
            }

            if (isTop) {
              const origBottom = origRow + origRowSpan;
              r = Math.max(1, Math.min(origBottom - liveMinRows, origRow + deltaRows));
              rSpan = origBottom - r;
            } else if (isBottom) {
              // Relación inversa: si empuja hacia arriba más allá del mínimo
              if ((origRowSpan + deltaRows) < liveMinRows) {
                // Auto-compactación inteligente al encoger hacia arriba
                if (!cfg.compact && window.PolymorphicCards) {
                  window.PolymorphicCards.toggleCompactMode(cardId, true);
                  liveMinRows = this.measureNaturalRows(el);
                }
                // Si aún así no cabe, intentar ensanchar hacia la derecha o izquierda
                if ((origRowSpan + deltaRows) < liveMinRows) {
                  if (c + cSpan <= 12) {
                    cSpan = Math.min(12, cSpan + 1);
                  } else if (c > 1) {
                    c = c - 1;
                    cSpan = cSpan + 1;
                  }
                  el.style.gridColumn = c + ' / span ' + cSpan;
                  el.setAttribute('data-cols', String(cSpan));
                  liveMinRows = this.measureNaturalRows(el);
                  cfg.minRows = liveMinRows;
                }
              }

              // Estirar hacia abajo o encoger con tope en liveMinRows
              let targetRows = Math.max(liveMinRows, origRowSpan + deltaRows);

              // Imán elástico sutil (micro-snap solo si la distancia en píxeles es <= 4px)
              const currentHeight = cardRect.height + dy;
              const idealHeightPx = (liveIdealRows * 40) + ((liveIdealRows - 1) * 12);
              if (Math.abs(currentHeight - idealHeightPx) <= 4) {
                targetRows = liveIdealRows;
              }
              rSpan = targetRows;
            }

            finalCol = c;
            finalColSpan = cSpan;
            finalRow = r;
            finalRowSpan = rSpan;

            const snapLeft = curContainerRect.left + (c - 1) * colPitch;
            const snapTop = curContainerRect.top + (r - 1) * rowPitch;
            const snapWidth = cSpan * colPitch - gap;
            const snapHeight = rSpan * rowPitch - gap;

            if (ghost) {
              ghost.style.left = snapLeft + 'px';
              ghost.style.top = snapTop + 'px';
              ghost.style.width = snapWidth + 'px';
              ghost.style.height = snapHeight + 'px';
            }
            if (placeholder) {
              placeholder.style.gridColumn = c + ' / span ' + cSpan;
              placeholder.style.gridRow = r + ' / span ' + rSpan;
            }

            const pct = Math.round((finalColSpan / 12) * 100);
            const isOptimal = (finalRowSpan === liveIdealRows);
            if (badge) {
              const optimalBadge = isOptimal ? '[Óptimo] ' : '';
              badge.textContent = (cfg.name || cardId) + ' → ' + optimalBadge + pct + '% (' + finalColSpan + '/12 cols) · ' + finalRowSpan + ' filas';
            }
          };

          const onPointerMove = (moveEvent) => {
            updateResizePosition(moveEvent);
          };

          const onScroll = () => {
            updateResizePosition(lastResizeEvent);
          };

          const onPointerUp = () => {
            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('pointerup', onPointerUp);
            window.removeEventListener('pointercancel', onPointerUp);
            window.removeEventListener('scroll', onScroll);

            if (ghost) ghost.style.display = 'none';
            if (placeholder) placeholder.style.display = 'none';
            el.style.opacity = '1';

            if (finalColSpan !== cfg.colSpan || finalRowSpan !== cfg.rowSpan || finalCol !== cfg.col || finalRow !== cfg.row) {
              this.recordUndo('Redimensionar cuadro');
            }

            cfg.col = finalCol;
            cfg.colSpan = finalColSpan;
            cfg.row = finalRow;
            cfg.rowSpan = finalRowSpan;
            cfg.manualRows = finalRowSpan;
            el.setAttribute('data-cols', String(finalColSpan));

            this.resolveGridCollisions(tabKey, cardId);
            this.compactGrid(tabKey);
            this.applyGridLayout(tabKey);
            this.renderBoardEditHandles(tabKey);
            if (typeof saveState === 'function') saveState();
          };

          window.addEventListener('pointermove', onPointerMove);
          window.addEventListener('pointerup', onPointerUp);
          window.addEventListener('pointercancel', onPointerUp);
          window.addEventListener('scroll', onScroll, { passive: true });
        },

        // OBSERVADOR REACTIVO AUTOMÁTICO (RESIZEOBSERVER) PARA CONTENIDO VIVO
        initGridAutoObservers() {
          if (typeof ResizeObserver === 'undefined') return;
          if (this._gridAutoObserver) return;

          let debounceTimer = null;
          this._gridAutoObserver = new ResizeObserver(() => {
            if (this.isBoardEditMode()) return;
            if (typeof window !== 'undefined' && window.innerWidth < 1024) return;

            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
              const tabKey = 'tab' + (state.activeTab || 1);
              const layout = this.getGridLayout(tabKey);
              let changed = false;

              Object.keys(layout).forEach(id => {
                const el = document.getElementById(id);
                if (el) {
                  const natural = this.measureNaturalRows(el);
                  if (natural > 0 && layout[id].minRows !== natural) {
                    layout[id].minRows = natural;
                    if (!layout[id].manualRows || layout[id].manualRows < natural) {
                      layout[id].rowSpan = natural;
                      changed = true;
                    }
                  }
                }
              });

              if (changed) {
                this.compactGrid(tabKey);
              }
            }, 80);
          });

          ['todayFocusContainer', 'notesMiniCalendarPanel', 'interactiveListsPanel', 'tab1RecentExpensesBar', 'weekTableContainer',
           'tab2ModularHabitsSection', 'tab2ScheduleSection', 'tab2AttendanceRulesSection',
           'tab3BudgetConfigCard', 'tab3SavingsGoalsCard', 'tab3PiggyCard', 'tab3FixedExpensesCard', 'tab3ExpensesTableCard',
           'tab4StudyAuditSection', 'tab4CustomHabitsSection', 'tab4BiometricsSection', 'tab4EvolutionSection'].forEach(id => {
            const el = document.getElementById(id);
            if (el) this._gridAutoObserver.observe(el);
          });
        },

        saveBoardDesign() {
          const tabKey = 'tab' + (state.activeTab || 1);
          this.autoFlowGrid(tabKey);
          this.applyGridLayout(tabKey);
          this.toggleBoardEdit(tabKey);
          saveState();
          this.showToast('Diseño de cuadrícula 12×H guardado con éxito.', 'emerald');
        },

        cancelBoardDesign() {
          const tabKey = 'tab' + (state.activeTab || 1);
          this.applyGridLayout(tabKey);
          this.toggleBoardEdit(tabKey);
          this.showToast('Diseño restablecido a la configuración previa.', 'info');
        },

        saveUiPreferences() {
          if (!state.uiPreferences) state.uiPreferences = {};
          const getVal = id => {
            const el = document.getElementById(id);
            return el ? el.checked : true;
          };

          state.uiPreferences.showSystemBanners = getVal('prefShowSystemBanners');
          state.uiPreferences.showOverdueAlert = getVal('prefShowOverdueAlert');
          state.uiPreferences.showUpcomingMilestone = getVal('prefShowUpcomingMilestone');

          state.uiPreferences.showKpis = getVal('prefShowKpis');
          state.uiPreferences.showDailyCards = getVal('prefShowDailyCards');
          state.uiPreferences.showWeekMatrix = getVal('prefShowWeekMatrix');
          state.uiPreferences.showRecentExpenses = getVal('prefShowRecentExpenses');
          state.uiPreferences.showListsPanel = getVal('prefShowListsPanel');
          state.uiPreferences.showMiniCalendar = getVal('prefShowMiniCalendar');
          state.uiPreferences.showDocks = getVal('prefShowDocks');

          state.uiPreferences.tab2ShowGoals = getVal('prefTab2ShowGoals');
          state.uiPreferences.tab2ShowSchedule = getVal('prefTab2ShowSchedule');
          state.uiPreferences.tab2ShowAttendance = getVal('prefTab2ShowAttendance');

          state.uiPreferences.tab3ShowBudget = getVal('prefTab3ShowBudget');
          state.uiPreferences.tab3ShowSavingsGoals = getVal('prefTab3ShowSavingsGoals');
          state.uiPreferences.tab3ShowPiggy = getVal('prefTab3ShowPiggy');
          state.uiPreferences.tab3ShowFixedExpenses = getVal('prefTab3ShowFixedExpenses');
          state.uiPreferences.tab3ShowExpensesTable = getVal('prefTab3ShowExpensesTable');
          state.uiPreferences.tab3ShowExpenseCharts = getVal('prefTab3ShowExpenseCharts');

          state.uiPreferences.tab4ShowStudyAudit = getVal('prefTab4ShowStudyAudit');
          state.uiPreferences.tab4ShowCustomHabits = getVal('prefTab4ShowCustomHabits');
          state.uiPreferences.tab4ShowBiometrics = getVal('prefTab4ShowBiometrics');
          state.uiPreferences.tab4ShowEvolution = getVal('prefTab4ShowEvolution');

          state.uiPreferences.activePreset = null; // Modo personalizado
          this.applyUiPreferences();
          renderDailyHabits();
          renderMilestoneWidget();
          saveState();
        },

        setDensity(density) {
          if (!state.uiPreferences) state.uiPreferences = {};
          state.uiPreferences.density = density;
          this.applyUiPreferences();
          saveState();
        },

        resetUiPreferences() {
          state.uiPreferences = null;
          try {
            sessionStorage.clear();
          } catch(e) {}
          if (state.ui) state.ui.dismissedBanners = {};
          this.applyPreset('balanced');
          this.showToast('Preferencias restablecidas al modo Equilibrado.', 'info', 1500);
        },

        applyPreset(presetKey) {
          if (!state.uiPreferences) state.uiPreferences = {};
          state.uiPreferences.activePreset = presetKey;

          if (presetKey === 'focus') {
            state.uiPreferences.showSystemBanners = false;
            state.uiPreferences.showOverdueAlert = false;
            state.uiPreferences.showUpcomingMilestone = false;

            state.uiPreferences.showKpis = false;
            state.uiPreferences.showDailyCards = true;
            state.uiPreferences.showWeekMatrix = false;
            state.uiPreferences.showRecentExpenses = false;
            state.uiPreferences.showListsPanel = true;
            state.uiPreferences.showMiniCalendar = false;
            state.uiPreferences.showDocks = false;

            state.uiPreferences.tab2ShowGoals = true;
            state.uiPreferences.tab2ShowSchedule = false;
            state.uiPreferences.tab2ShowAttendance = false;

            state.uiPreferences.tab3ShowBudget = true;
            state.uiPreferences.tab3ShowSavingsGoals = false;
            state.uiPreferences.tab3ShowPiggy = false;
            state.uiPreferences.tab3ShowFixedExpenses = false;
            state.uiPreferences.tab3ShowExpensesTable = true;
            state.uiPreferences.tab3ShowExpenseCharts = false;

            state.uiPreferences.tab4ShowStudyAudit = false;
            state.uiPreferences.tab4ShowCustomHabits = false;
            state.uiPreferences.tab4ShowBiometrics = false;
            state.uiPreferences.tab4ShowEvolution = true;

            state.uiPreferences.density = 'compact';
            state.uiPreferences.kpisCollapsed = true;
            state.ui.weekTableCollapsed = true;
            this.showToast('Modo Enfoque activado: Máxima concentración en lo de hoy.', 'info', 1800);
          } else if (presetKey === 'balanced') {
            state.uiPreferences.showSystemBanners = true;
            state.uiPreferences.showOverdueAlert = true;
            state.uiPreferences.showUpcomingMilestone = true;

            state.uiPreferences.showKpis = true;
            state.uiPreferences.showDailyCards = true;
            state.uiPreferences.showWeekMatrix = true;
            state.uiPreferences.showRecentExpenses = true;
            state.uiPreferences.showListsPanel = true;
            state.uiPreferences.showMiniCalendar = true;
            state.uiPreferences.showDocks = true;

            state.uiPreferences.tab2ShowGoals = true;
            state.uiPreferences.tab2ShowSchedule = true;
            state.uiPreferences.tab2ShowAttendance = true;

            state.uiPreferences.tab3ShowBudget = true;
            state.uiPreferences.tab3ShowSavingsGoals = true;
            state.uiPreferences.tab3ShowPiggy = true;
            state.uiPreferences.tab3ShowFixedExpenses = true;
            state.uiPreferences.tab3ShowExpensesTable = true;
            state.uiPreferences.tab3ShowExpenseCharts = true;

            state.uiPreferences.tab4ShowStudyAudit = true;
            state.uiPreferences.tab4ShowCustomHabits = true;
            state.uiPreferences.tab4ShowBiometrics = true;
            state.uiPreferences.tab4ShowEvolution = true;

            state.uiPreferences.density = 'cozy';
            state.uiPreferences.kpisCollapsed = true;
            state.ui.weekTableCollapsed = false;
            this.showToast('Modo Equilibrado activado: Hoy y Matriz lado a lado.', 'info', 1800);
          } else if (presetKey === 'pro') {
            state.uiPreferences.showSystemBanners = true;
            state.uiPreferences.showOverdueAlert = true;
            state.uiPreferences.showUpcomingMilestone = true;

            state.uiPreferences.showKpis = true;
            state.uiPreferences.showDailyCards = true;
            state.uiPreferences.showWeekMatrix = true;
            state.uiPreferences.showRecentExpenses = true;
            state.uiPreferences.showListsPanel = true;
            state.uiPreferences.showMiniCalendar = true;
            state.uiPreferences.showDocks = true;

            state.uiPreferences.tab2ShowGoals = true;
            state.uiPreferences.tab2ShowSchedule = true;
            state.uiPreferences.tab2ShowAttendance = true;

            state.uiPreferences.tab3ShowBudget = true;
            state.uiPreferences.tab3ShowSavingsGoals = true;
            state.uiPreferences.tab3ShowPiggy = true;
            state.uiPreferences.tab3ShowFixedExpenses = true;
            state.uiPreferences.tab3ShowExpensesTable = true;
            state.uiPreferences.tab3ShowExpenseCharts = true;

            state.uiPreferences.tab4ShowStudyAudit = true;
            state.uiPreferences.tab4ShowCustomHabits = true;
            state.uiPreferences.tab4ShowBiometrics = true;
            state.uiPreferences.tab4ShowEvolution = true;

            state.uiPreferences.density = 'cozy';
            state.uiPreferences.kpisCollapsed = false;
            state.ui.weekTableCollapsed = false;
            this.showToast('Modo Mucha Info activado: Todas las métricas y paneles visibles.', 'info', 1800);
          }
          this.applyUiPreferences();
          renderDailyHabits();
          renderMilestoneWidget();
          saveState();
        },

        toggleKpisAccordion(forceState = null) {
          if (!state.uiPreferences) state.uiPreferences = {};
          const body = document.getElementById('kpisCollapsibleBody');
          const txt = document.getElementById('kpisSlimStatusText');
          const arrow = document.getElementById('kpisSlimArrow');
          if (!body) return;
          const isCurrentlyHidden = body.classList.contains('hidden');
          const shouldShow = forceState !== null ? forceState : isCurrentlyHidden;
          body.classList.toggle('hidden', !shouldShow);
          if (txt) txt.textContent = shouldShow ? 'Plegar' : 'Mostrar';
          if (arrow) arrow.textContent = shouldShow ? '▲' : '▼';
          state.uiPreferences.kpisCollapsed = !shouldShow;
          saveState();
        },

        rebalanceTab1Layout() {
          if (!state.uiPreferences) return;
          const p = state.uiPreferences;
          const isMatrixCollapsed = (state.ui.weekTableCollapsed !== false) || (p.showWeekMatrix === false);

          const todayWrap = document.getElementById('todayFocusContainer');
          const listsP = document.getElementById('interactiveListsPanel');
          const miniCal = document.getElementById('notesMiniCalendarPanel');
          const recExp = document.getElementById('tab1RecentExpensesBar');
          const matrixWrap = document.getElementById('weekTableContainer');
          const toggleBtn = document.getElementById('toggleWeekTableBtn');

          const todayVisible = (p.showDailyCards !== false);
          const matrixVisible = (p.showWeekMatrix !== false && state.ui.weekTableCollapsed !== true);
          const recExpVisible = (p.showRecentExpenses !== false);
          const miniCalVisible = (p.showMiniCalendar !== false);
          const listsVisible = (p.showListsPanel !== false);

          if (todayWrap) todayWrap.classList.toggle('hidden', !todayVisible);
          if (matrixWrap) matrixWrap.classList.toggle('hidden', !matrixVisible);
          if (toggleBtn) {
            toggleBtn.classList.toggle('hidden', p.showWeekMatrix === false);
            toggleBtn.innerHTML = isMatrixCollapsed
              ? '<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/><path d="M9 3v18"/><path d="M15 3v18"/></svg> <span class="hidden sm:inline">Ver Matriz</span><span class="sm:hidden">Matriz</span> <span class="text-[9px]">▼</span>'
              : '<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/><path d="M9 3v18"/><path d="M15 3v18"/></svg> <span class="hidden sm:inline">Plegar Matriz</span><span class="sm:hidden">Plegar</span> <span class="text-[9px]">▲</span>';
          }
          if (miniCal) miniCal.classList.toggle('hidden', !miniCalVisible);
          if (recExp) recExp.classList.toggle('hidden', !recExpVisible);
          if (listsP) listsP.classList.toggle('hidden', !listsVisible);

          this.applyGridLayout('tab1');
        },

  // ========================================================
  // BIBLIOTECA DE DISPOSITIVOS GUARDADOS Y MODOS CONTEXTUALES
  // ========================================================
  openDeviceProfilesModal() {
    this.renderDeviceProfilesList();
    const modal = document.getElementById('modalDeviceProfiles');
    if (modal) modal.classList.remove('hidden');
  },

  closeDeviceProfilesModal() {
    const modal = document.getElementById('modalDeviceProfiles');
    if (modal) modal.classList.add('hidden');
  },

  saveCurrentLayoutAsProfile() {
    const nameInput = document.getElementById('newProfileNameInput');
    const typeSelect = document.getElementById('newProfileDeviceType');
    const modeSelect = document.getElementById('newProfileMode');

    const name = nameInput ? nameInput.value.trim() : '';
    if (!name) {
      this.showToast('Por favor, introduce un nombre para el perfil (ej. Portátil 14\").', 'warning');
      if (nameInput) nameInput.focus();
      return;
    }

    const deviceType = typeSelect ? typeSelect.value : 'desktop';
    const mode = modeSelect ? modeSelect.value : 'general';
    const profileId = 'prof_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);

    if (!state.deviceProfiles) state.deviceProfiles = {};

    state.deviceProfiles[profileId] = {
      id: profileId,
      name: name,
      deviceType: deviceType,
      mode: mode,
      gridLayouts: JSON.parse(JSON.stringify(state.uiPreferences?.gridLayouts || {})),
      uiPreferences: JSON.parse(JSON.stringify(state.uiPreferences || {})),
      updatedAt: Date.now()
    };
    state.activeDeviceProfileId = profileId;

    saveState();
    this.showToast('Perfil "' + name + '" guardado en la Biblioteca con éxito.', 'success');
    if (nameInput) nameInput.value = '';
    this.renderDeviceProfilesList();
  },

  applyDeviceProfile(profileId) {
    if (!state.deviceProfiles || !state.deviceProfiles[profileId]) {
      this.showToast('El perfil solicitado no existe.', 'error');
      return;
    }

    const prof = state.deviceProfiles[profileId];
    if (prof.gridLayouts) {
      if (!state.uiPreferences) state.uiPreferences = {};
      state.uiPreferences.gridLayouts = JSON.parse(JSON.stringify(prof.gridLayouts));
    }
    if (prof.uiPreferences) {
      Object.assign(state.uiPreferences, JSON.parse(JSON.stringify(prof.uiPreferences)));
    }

    state.activeDeviceProfileId = profileId;
    saveState();

    this.applyUiPreferences();
    this.applyGridLayout('tab' + (state.activeTab || 1));
    this.showToast('Perfil "' + prof.name + '" aplicado a este dispositivo.', 'success');
    this.closeDeviceProfilesModal();
  },

  deleteDeviceProfile(profileId) {
    if (!state.deviceProfiles || !state.deviceProfiles[profileId]) return;
    const profName = state.deviceProfiles[profileId].name;

    delete state.deviceProfiles[profileId];
    if (state.activeDeviceProfileId === profileId) {
      state.activeDeviceProfileId = null;
    }
    saveState();
    this.showToast('Perfil "' + profName + '" eliminado.', 'info');
    this.renderDeviceProfilesList();
  },

  renderDeviceProfilesList() {
    const container = document.getElementById('deviceProfilesListContainer');
    const badge = document.getElementById('deviceProfilesCountBadge');
    if (!container) return;

    const profiles = Object.values(state.deviceProfiles || {});
    if (badge) badge.textContent = profiles.length + (profiles.length === 1 ? ' perfil' : ' perfiles');

    if (profiles.length === 0) {
      container.innerHTML = '<div class="p-4 rounded-2xl subpanel-bg border border-dashed border-stone-300 dark:border-slate-700 text-center text-xs text-stone-500 dark:text-slate-400">Aún no has guardado ningún perfil de dispositivo. Puedes guardar la disposición actual arriba.</div>';
      return;
    }

    const typeIcons = {
      desktop: '<svg class="w-4 h-4 text-theme-main" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>',
      mobile: '<svg class="w-4 h-4 text-theme-main" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>',
      tablet: '<svg class="w-4 h-4 text-theme-main" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/></svg>'
    };

    const modeLabels = {
      general: 'Modo General',
      study: 'Modo Estudio',
      vacation: 'Modo Vacaciones',
      minimal: 'Modo Minimalista'
    };

    container.innerHTML = profiles.map(p => {
      const isActive = state.activeDeviceProfileId === p.id;
      const icon = typeIcons[p.deviceType] || typeIcons.desktop;
      const modeText = modeLabels[p.mode] || 'General';
      const dateStr = p.updatedAt ? new Date(p.updatedAt).toLocaleDateString() : '';

      return '<div class="p-3 rounded-2xl subpanel-bg border ' + (isActive ? 'border-theme-main ring-1 ring-theme-main' : 'border-stone-200 dark:border-slate-800') + ' flex flex-wrap items-center justify-between gap-2.5 transition">' +
        '<div class="flex items-center gap-2.5">' +
          '<div class="w-8 h-8 rounded-xl bg-theme-soft flex items-center justify-center shrink-0">' + icon + '</div>' +
          '<div>' +
            '<div class="font-bold text-xs text-stone-900 dark:text-white flex items-center gap-1.5">' +
              '<span>' + escapeHtml(p.name) + '</span>' +
              (isActive ? '<span class="px-1.5 py-0.2 rounded font-mono text-[9px] bg-theme-main text-white font-bold">ACTIVO</span>' : '') +
            '</div>' +
            '<div class="text-[10px] text-stone-500 dark:text-slate-400 flex items-center gap-2 mt-0.5">' +
              '<span class="px-1.5 py-0.2 rounded bg-stone-200 dark:bg-slate-800 font-medium">' + modeText + '</span>' +
              '<span>' + dateStr + '</span>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="flex items-center gap-1.5">' +
          '<button type="button" onclick="app.applyDeviceProfile(\'' + p.id + '\')" class="px-2.5 py-1.5 rounded-xl bg-theme-main text-white font-bold text-[11px] hover:opacity-90 active:scale-95 transition cursor-pointer flex items-center gap-1">' +
            '<svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>' +
            '<span>Aplicar</span>' +
          '</button>' +
          '<button type="button" onclick="app.deleteDeviceProfile(\'' + p.id + '\')" class="p-1.5 rounded-xl subpanel-bg border hover:border-theme-accent text-stone-400 hover:text-theme-accent transition cursor-pointer" title="Eliminar perfil">' +
            '<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>' +
          '</button>' +
        '</div>' +
      '</div>';
    }).join('');
  }
};

if (typeof window !== 'undefined') {
  window.GridEngine = GridEngine;
}
if (typeof global !== 'undefined') {
  global.GridEngine = GridEngine;
}

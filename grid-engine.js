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
              tab4AnatomyCard: 8,
              tab4RunningRadarCard: 8,
              tab4EvolutionSection: 12
            };
            const normalFallback = fallbackMins[cardEl.id] || 4;
            return cardEl.classList.contains('card-mode-compact')
              ? Math.max(2, Math.round(normalFallback * 0.45))
              : normalFallback;
          }

          // Guardar temporalmente estilos inline y clase de estiramiento
          const hadExtraClass = cardEl.classList.contains('card-has-extra-height');
          if (hadExtraClass) cardEl.classList.remove('card-has-extra-height');

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
          if (hadExtraClass) cardEl.classList.add('card-has-extra-height');
          cardEl.style.alignSelf = prevAlignSelf;
          cardEl.style.height = prevHeight;
          cardEl.style.minHeight = prevMinHeight;
          overlays.forEach(el => { el.style.display = ''; });

          const requiredRows = Math.ceil((naturalHeightPx + 12) / 52);
          const minAllowed = (cardEl.id === 'topKpisWrapper' && state.uiPreferences && state.uiPreferences.kpisCollapsed) ? 1 : 2;
          return Math.max(minAllowed, requiredRows);
        },

        // 2. RESOLUCIÓN DE COLISIONES 2D EN CASCADA (CASCADE PUSH) CON PRIORIDAD PARA RECUADROS FIJADOS (PIN)
        resolveGridCollisions(tabKeyOrLayout, priorityId) {
          let layout;
          if (tabKeyOrLayout && typeof tabKeyOrLayout === 'object') {
            layout = tabKeyOrLayout;
          } else {
            const tabKey = tabKeyOrLayout || ('tab' + (state.activeTab || 1));
            layout = this.getGridLayout(tabKey);
          }
          if (!layout) return;

          const cards = Object.keys(layout).map(id => ({ id, ...layout[id] }));

          let hasCollision = true;
          let iterations = 0;
          const maxIterations = 60;

          while (hasCollision && iterations < maxIterations) {
            hasCollision = false;
            iterations++;

            // Ordenar: Tarjetas fijadas (isPinned === true) u obstáculo prioritario (priorityId)
            // tienen máxima prioridad inamovible
            cards.sort((a, b) => {
              const aPinned = !!a.isPinned;
              const bPinned = !!b.isPinned;
              if (aPinned && !bPinned) return -1;
              if (!aPinned && bPinned) return 1;
              if (a.id === priorityId && b.id !== priorityId) return -1;
              if (b.id === priorityId && a.id !== priorityId) return 1;
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
                  // Si b es pinned y a no lo es (por seguridad), a cede el paso
                  if (b.isPinned && !a.isPinned) {
                    a.row = b.row + b.rowSpan;
                  } else {
                    // La tarjeta 'a' (prioritaria/pinned/superior) empuja a la tarjeta 'b' justo debajo
                    b.row = a.row + a.rowSpan;
                  }
                }
              }
            }
          }

          cards.forEach(c => {
            if (layout[c.id]) {
              layout[c.id].row = c.row;
            }
          });
        },

        // 3. GRAVEDAD Y COMPACTACIÓN INTELIGENTE (RESPETANDO PINNED Y 0 HUECOS)
        compactGrid(tabKeyOrLayout, showToast = false) {
          let layout;
          let tabKey = null;
          if (tabKeyOrLayout && typeof tabKeyOrLayout === 'object') {
            layout = tabKeyOrLayout;
          } else {
            tabKey = tabKeyOrLayout || ('tab' + (state.activeTab || 1));
            layout = this.getGridLayout(tabKey);
          }
          if (!layout) return;

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

          // 2. Separar tarjetas fijadas (isPinned) y no fijadas
          const allCards = Object.keys(layout).map(id => ({ id, ...layout[id] }));
          const pinnedCards = allCards.filter(c => !!c.isPinned);
          const unpinnedCards = allCards.filter(c => !c.isPinned);

          // Las tarjetas fijadas conservan inamovible su fila actual
          const placedCards = [...pinnedCards];

          // Ordenar unpinnedCards por fila y columna original para preservar el orden natural de lectura
          unpinnedCards.sort((a, b) => (a.row || 1) - (b.row || 1) || (a.col || 1) - (b.col || 1));

          unpinnedCards.forEach(item => {
            let candidateRow = 1;
            let fits = false;
            while (!fits) {
              fits = true;
              for (let p = 0; p < placedCards.length; p++) {
                const placed = placedCards[p];
                const colsOverlap = Math.max(item.col, placed.col) < Math.min(item.col + item.colSpan, placed.col + placed.colSpan);
                const rowsOverlap = Math.max(candidateRow, placed.row) < Math.min(candidateRow + item.rowSpan, placed.row + placed.rowSpan);
                if (colsOverlap && rowsOverlap) {
                  candidateRow = placed.row + placed.rowSpan;
                  fits = false;
                  break;
                }
              }
            }
            item.row = candidateRow;
            placedCards.push(item);
          });

          placedCards.forEach(c => {
            if (layout[c.id]) {
              layout[c.id].row = c.row;
            }
          });

          // Cascada de seguridad final para garantizar 0 solapamientos
          this.resolveGridCollisions(layout, null);

          this.applyGridLayout(tabKey);
          if (state.ui && state.ui.isBoardEditMode) this.renderBoardEditHandles(tabKey);
          if (typeof saveUiOnly === 'function') {
            saveUiOnly();
          } else if (typeof saveState === 'function') {
            saveUiOnly();
          }
          if (typeof localStorage !== 'undefined') {
            try {
              const localLayout = {
                workspaces: state.workspaces,
                gridLayouts: state.uiPreferences?.gridLayouts,
                globalSidebar: state.globalSidebar
              };
              localStorage.setItem('CC_LOCAL_DEVICE_LAYOUT', JSON.stringify(localLayout));
            } catch (_) {}
          }
          if (showToast) {
            this.safeToast('Tablero compactado hacia arriba (0 huecos).', 'emerald');
          }
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
              todayFocusContainer: { col: 1, colSpan: 12, row: 1, minRows: 16, manualRows: null, rowSpan: 18, name: 'Hábitos: Hoy y Matriz Semanal' },
              notesMiniCalendarPanel: { col: 1, colSpan: 6, row: 19, minRows: 8, manualRows: null, rowSpan: 8, name: 'Calendario' },
              interactiveListsPanel: { col: 7, colSpan: 6, row: 19, minRows: 14, manualRows: null, rowSpan: 14, name: 'Listas y Tareas' },
              tab1RecentExpensesBar: { col: 1, colSpan: 6, row: 27, minRows: 4, manualRows: null, rowSpan: 4, name: 'Movimientos Recientes' }
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
              tab4CustomHabitsSection: { col: 1, colSpan: 12, row: 9, minRows: 8, manualRows: null, rowSpan: 8, name: 'Hábitos Personalizados' },
              tab4AnatomyCard: { col: 1, colSpan: 7, row: 17, minRows: 8, manualRows: null, rowSpan: 8, name: 'Mapa Muscular Anatómico' },
              tab4RunningRadarCard: { col: 8, colSpan: 5, row: 17, minRows: 8, manualRows: null, rowSpan: 8, name: 'Tri-Sistema Running y Pista' },
              tab4EvolutionSection: { col: 1, colSpan: 12, row: 25, minRows: 12, manualRows: null, rowSpan: 12, name: 'Histórico y Gráficos' }
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
                tab1: ['todayFocusContainer', 'interactiveListsPanel', 'tab1RecentExpensesBar', 'notesMiniCalendarPanel'],
                tab2: ['tab2ModularHabitsSection', 'tab2ScheduleSection', 'tab2AttendanceRulesSection'],
                tab3: ['tab3BudgetConfigCard', 'tab3SavingsGoalsCard', 'tab3PiggyCard', 'tab3ExpensesTableCard', 'tab3FixedExpensesCard'],
                tab4: ['tab4StudyAuditSection', 'tab4CustomHabitsSection', 'tab4AnatomyCard', 'tab4RunningRadarCard', 'tab4EvolutionSection']
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
                  tab4CustomHabitsSection: { col: 1, colSpan: 12, row: 9, rowSpan: 8, isPinned: false, compact: false },
                  tab4AnatomyCard: { col: 1, colSpan: 7, row: 17, rowSpan: 8, isPinned: false, compact: false },
                  tab4RunningRadarCard: { col: 8, colSpan: 5, row: 17, rowSpan: 8, isPinned: false, compact: false },
                  tab4EvolutionSection: { col: 1, colSpan: 12, row: 25, rowSpan: 12, isPinned: false, compact: false }
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
          if (!layout) return;
          this.recordUndo('Preset 3 en fila');
          const ids = Object.keys(layout);
          ids.sort((a, b) => (layout[a].row || 1) - (layout[b].row || 1) || (layout[a].col || 1) - (layout[b].col || 1));
          ids.forEach((id, i) => {
            const colIndex = i % 3;
            layout[id].col = 1 + colIndex * 4;
            layout[id].colSpan = 4;
            layout[id].row = 1 + Math.floor(i / 3) * 12;
            layout[id].manualRows = null;
          });
          this.compactGrid(tabKey, true);
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
                  const hasExtra = (cfg.manualRows && cfg.manualRows > cfg.minRows) || (cfg.rowSpan && cfg.rowSpan > cfg.minRows);
                  window.PolymorphicCards.applyVerticalJustification(el, !!hasExtra);
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
          if (typeof window !== 'undefined' && typeof window.renderSystemToast === 'function') {
            window.renderSystemToast(msg, type, duration);
          } else if (typeof renderSystemToast === 'function') {
            renderSystemToast(msg, type, duration);
          } else {
            console.log('[Toast ' + (type || 'info') + ']', msg);
          }
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

            // Escudo protector de arrastre con soporte para clic derecho
            const shield = document.createElement('div');
            shield.className = 'card-drag-shield board-edit-ctrl-overlay';
            shield.title = 'Arrastra para mover este cuadro de posición o clic derecho para más opciones';
            shield.onpointerdown = (e) => this.startCardDrag(e, id);
            shield.oncontextmenu = (e) => {
              e.preventDefault();
              e.stopPropagation();
              this.toggleBoardCardMenu(id, e, false);
            };
            el.appendChild(shield);

            // Barra superior de herramientas sobre la tarjeta con nombre humano real y botones nítidos
            const bar = document.createElement('div');
            bar.className = 'board-edit-header-bar board-edit-ctrl-overlay';
            bar.oncontextmenu = (e) => {
              e.preventDefault();
              e.stopPropagation();
              this.toggleBoardCardMenu(id, e, false);
            };

            const isPinned = cfg.isPinned || false;
            const isCompact = cfg.compact || el.classList.contains('card-mode-compact');
            const idealRows = (window.PolymorphicCards) ? window.PolymorphicCards.computeIdealRows(el) : (cfg.rowSpan || 6);
            const def = (window.WidgetsRegistry) ? window.WidgetsRegistry.getWidgetDef(id) : { name: id, iconSvg: '' };
            const cardTitle = def.name || cfg.name || id;

            bar.innerHTML = `
              <div class="header-bar-left">
                <span class="header-bar-icon">${def.iconSvg || '<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>'}</span>
                <span class="header-bar-title" title="${cardTitle}">${cardTitle}</span>
                <span class="header-bar-coords">${cfg.colSpan}/12c · ${cfg.rowSpan || 4}f</span>
              </div>
              <div class="header-bar-actions">
                <button type="button" onclick="event.stopPropagation(); app.toggleWidgetPin('${id}')" title="${isPinned ? 'Desfijar de otras ventanas' : 'Fijar en todas las ventanas'}" class="header-bar-btn ${isPinned ? 'is-active-pin' : ''}">
                  <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14l-1.5-6h-11L5 17z"/><path d="M9 11V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v7"/></svg>
                </button>
                <button type="button" onclick="event.stopPropagation(); app.toggleCompactMode('${id}')" title="Modo Compacto" class="header-bar-btn ${isCompact ? 'is-active-compact' : ''}">
                  <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
                </button>
                <button type="button" onclick="event.stopPropagation(); app.toggleBoardCardMenu('${id}', event)" title="Más opciones de diseño" class="header-bar-btn">
                  <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="1.5"/><circle cx="6" cy="12" r="1.5"/><circle cx="18" cy="12" r="1.5"/></svg>
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

            // Escudo de arrastre para mover del sidebar a la cuadrícula con soporte para clic derecho
            const sidebarShield = document.createElement('div');
            sidebarShield.className = 'card-drag-shield board-edit-ctrl-overlay';
            sidebarShield.title = 'Arrastra hacia la izquierda para devolver este cuadro al tablero o clic derecho para opciones';
            sidebarShield.onpointerdown = (e) => this.startCardDrag(e, id);
            sidebarShield.oncontextmenu = (e) => {
              e.preventDefault();
              e.stopPropagation();
              this.toggleBoardCardMenu(id, e, true);
            };
            el.appendChild(sidebarShield);

            const bar = document.createElement('div');
            bar.className = 'board-edit-header-bar board-edit-ctrl-overlay';
            bar.oncontextmenu = (e) => {
              e.preventDefault();
              e.stopPropagation();
              this.toggleBoardCardMenu(id, e, true);
            };
            const def = (window.WidgetsRegistry) ? window.WidgetsRegistry.getWidgetDef(id) : { name: id };
            const cardTitle = def.name || id;
            bar.innerHTML = `
              <div class="header-bar-left">
                <span class="header-bar-coords">PANEL</span>
                <span class="header-bar-title" title="${cardTitle}">${cardTitle}</span>
              </div>
              <div class="header-bar-actions">
                <button type="button" onclick="event.stopPropagation(); app.toggleBoardCardMenu('${id}', event, true)" title="Más opciones" class="header-bar-btn">
                  <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="1.5"/><circle cx="6" cy="12" r="1.5"/><circle cx="18" cy="12" r="1.5"/></svg>
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
          const popover = document.getElementById('boardCardMenuPopover');
          if (popover) popover.classList.add('hidden');
        },

        toggleBoardCardMenu(cardId, event, isSidebar = false) {
          if (event) event.stopPropagation();
          let popover = document.getElementById('boardCardMenuPopover');
          if (popover && popover.getAttribute('data-active-card') === cardId && !popover.classList.contains('hidden')) {
            popover.classList.add('hidden');
            return;
          }

          if (!popover) {
            popover = document.createElement('div');
            popover.id = 'boardCardMenuPopover';
            popover.className = 'board-card-menu-popover fixed z-[9999] hidden panel-bg border border-theme shadow-2xl rounded-xl p-1.5 flex flex-col gap-1 text-xs select-none';
            document.body.appendChild(popover);
          }

          const btnRect = event ? event.currentTarget.getBoundingClientRect() : { right: 200, bottom: 200, left: 10, top: 10 };
          popover.setAttribute('data-active-card', cardId);
          popover.classList.remove('hidden');

          const el = document.getElementById(cardId);
          const idealRows = (window.PolymorphicCards && el) ? window.PolymorphicCards.computeIdealRows(el) : 6;

          if (isSidebar) {
            popover.innerHTML = `
              <button type="button" onclick="app.moveCardFromSidebarToGrid('${cardId}'); document.getElementById('boardCardMenuPopover')?.classList.add('hidden');">
                <svg class="w-3.5 h-3.5 text-theme-main" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg>
                <span>Al Tablero principal</span>
              </button>
              <button type="button" onclick="app.sendWidgetToDock('${cardId}'); document.getElementById('boardCardMenuPopover')?.classList.add('hidden');">
                <svg class="w-3.5 h-3.5 text-theme-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="16" width="16" height="4" rx="1"/><circle cx="8" cy="18" r="0.5"/><circle cx="12" cy="18" r="0.5"/><circle cx="16" cy="18" r="0.5"/></svg>
                <span>Mover al Dock</span>
              </button>
              <button type="button" onclick="app.sendWidgetToDrawer('${cardId}'); document.getElementById('boardCardMenuPopover')?.classList.add('hidden');" class="text-rose-500 hover:text-rose-600">
                <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                <span>Inactivar (al cajón)</span>
              </button>
            `;
          } else {
            popover.innerHTML = `
              <button type="button" onclick="app.snapCardToIdeal('${cardId}'); document.getElementById('boardCardMenuPopover')?.classList.add('hidden');">
                <svg class="w-3.5 h-3.5 text-theme-main" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                <span>Ajustar a ideal (${idealRows} filas)</span>
              </button>
              <button type="button" onclick="app.adjustCardSpan('${cardId}', 1); document.getElementById('boardCardMenuPopover')?.classList.add('hidden');">
                <svg class="w-3.5 h-3.5 text-theme-main" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                <span>Aumentar ancho (+1 col)</span>
              </button>
              <button type="button" onclick="app.adjustCardSpan('${cardId}', -1); document.getElementById('boardCardMenuPopover')?.classList.add('hidden');">
                <svg class="w-3.5 h-3.5 text-theme-main" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/></svg>
                <span>Reducir ancho (-1 col)</span>
              </button>
              <button type="button" onclick="app.moveCardToSidebar('${cardId}'); document.getElementById('boardCardMenuPopover')?.classList.add('hidden');">
                <svg class="w-3.5 h-3.5 text-theme-main" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="15" y1="3" x2="15" y2="21"/></svg>
                <span>Mover a panel lateral</span>
              </button>
              <button type="button" onclick="app.sendWidgetToDock('${cardId}'); document.getElementById('boardCardMenuPopover')?.classList.add('hidden');">
                <svg class="w-3.5 h-3.5 text-theme-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="16" width="16" height="4" rx="1"/><circle cx="8" cy="18" r="0.5"/><circle cx="12" cy="18" r="0.5"/><circle cx="16" cy="18" r="0.5"/></svg>
                <span>Mover al Dock</span>
              </button>
              ${cardId === 'todayFocusContainer' ? `
                <div class="border-t border-theme/40 my-1 pt-1 space-y-0.5">
                  <div class="px-2 py-0.5 text-[10px] text-stone-500 dark:text-slate-400 font-bold uppercase tracking-wider">Proporción Hoy / Semana</div>
                  <button type="button" onclick="app.setHabitsSplitPreset(40); document.getElementById('boardCardMenuPopover')?.classList.add('hidden');" class="w-full text-left px-2 py-1 rounded hover:bg-theme-soft text-theme-main flex items-center justify-between text-xs cursor-pointer">
                    <span>40% Hoy · 60% Semana</span>
                    <span class="text-[10px] font-mono">40/60</span>
                  </button>
                  <button type="button" onclick="app.setHabitsSplitPreset(50); document.getElementById('boardCardMenuPopover')?.classList.add('hidden');" class="w-full text-left px-2 py-1 rounded hover:bg-theme-soft text-theme-main flex items-center justify-between text-xs cursor-pointer">
                    <span>50% Hoy · 50% Semana</span>
                    <span class="text-[10px] font-mono">50/50</span>
                  </button>
                  <button type="button" onclick="app.setHabitsSplitPreset(60); document.getElementById('boardCardMenuPopover')?.classList.add('hidden');" class="w-full text-left px-2 py-1 rounded hover:bg-theme-soft text-theme-main flex items-center justify-between text-xs cursor-pointer">
                    <span>60% Hoy · 40% Semana</span>
                    <span class="text-[10px] font-mono">60/40</span>
                  </button>
                </div>
              ` : ''}
            `;
          }

          let left, top;
          const popoverW = 210;
          if (event && event.type === 'contextmenu') {
            left = event.clientX;
            top = event.clientY;
          } else if (event && event.currentTarget && event.currentTarget.getBoundingClientRect) {
            const btnRect = event.currentTarget.getBoundingClientRect();
            left = btnRect.right - popoverW;
            if (left < 10) left = btnRect.left;
            top = btnRect.bottom + 6;
          } else {
            left = 100;
            top = 100;
          }
          if (top + 220 > window.innerHeight) {
            top = window.innerHeight - 230;
          }
          if (left + popoverW > window.innerWidth - 10) {
            left = window.innerWidth - popoverW - 10;
          }

          popover.style.left = Math.max(10, left) + 'px';
          popover.style.top = Math.max(10, top) + 'px';
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
          const naturalMin = this.measureNaturalRows(el);
          const ideal = window.PolymorphicCards.computeIdealRows(el);
          const targetRows = Math.max(2, ideal, naturalMin);
          ws.grid[cardId].minRows = targetRows;
          ws.grid[cardId].rowSpan = targetRows;
          ws.grid[cardId].manualRows = targetRows;
          this.resolveGridCollisions(ws.grid, cardId);
          this.compactGrid(ws.grid);
          this.applyGridLayout();
          this.renderBoardEditHandles();
          if (typeof saveState === 'function') saveState();
          this.safeToast('Módulo ajustado a ' + targetRows + ' filas.', 'emerald');
        },

        renderWidgetsDrawer(selectedCategory = 'all') {
          // Pre-renderizar todas las pestañas para que ningún módulo del catálogo aparezca vacío
          if (typeof renderDailyHabits === 'function') { try { renderDailyHabits(); } catch(e){} }
          if (typeof renderTab2 === 'function') { try { renderTab2(); } catch(e){} }
          if (typeof renderTab3 === 'function') { try { renderTab3(); } catch(e){} }
          if (typeof renderTab4 === 'function') { try { renderTab4(); } catch(e){} }

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
          const placedWidgets = Object.keys(catalog).filter(id => isPlacedInWindow(id));

          // Pre-renderizar vistas dinámicas para que los clones visuales contengan datos reales y no cuadros vacíos
          if (typeof app !== 'undefined') {
            if (typeof app.renderAcademic === 'function') {
              try { app.renderAcademic(); } catch (_) {}
            }
            if (typeof app.renderFinance === 'function') {
              try { app.renderFinance(); } catch (_) {}
            }
            if (typeof app.renderHabitsSection === 'function') {
              try { app.renderHabitsSection(); } catch (_) {}
            }
          }

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
                const colSpan = def.defaultColSpan || 6;
                const idealRows = def.idealRows || 8;
                const boxHeight = Math.max(54, Math.min(165, Math.round(idealRows * 9.5))) + 'px';
                const widthPercent = Math.min(100, Math.max(45, Math.round((colSpan / 12) * 100))) + '%';

                let wireframeHtml = '';
                if (id === 'topKpisWrapper') {
                  wireframeHtml = `
                    <div class="grid grid-cols-4 gap-1 p-1 h-full">
                      <div class="h-full rounded bg-theme-soft/60 border border-theme/30 p-1 flex flex-col justify-between"><div class="h-1.5 w-4 rounded bg-theme-main/40"></div><div class="h-2 w-6 rounded bg-theme-main/70"></div></div>
                      <div class="h-full rounded bg-theme-soft/60 border border-theme/30 p-1 flex flex-col justify-between"><div class="h-1.5 w-4 rounded bg-theme-main/40"></div><div class="h-2 w-6 rounded bg-theme-main/70"></div></div>
                      <div class="h-full rounded bg-theme-soft/60 border border-theme/30 p-1 flex flex-col justify-between"><div class="h-1.5 w-4 rounded bg-theme-main/40"></div><div class="h-2 w-6 rounded bg-theme-main/70"></div></div>
                      <div class="h-full rounded bg-theme-soft/60 border border-theme/30 p-1 flex flex-col justify-between"><div class="h-1.5 w-4 rounded bg-theme-main/40"></div><div class="h-2 w-6 rounded bg-theme-main/70"></div></div>
                    </div>
                  `;
                } else if (id === 'interactiveListsPanel') {
                  wireframeHtml = `
                    <div class="space-y-1.5 p-1.5 h-full flex flex-col justify-around">
                      <div class="flex items-center gap-1.5"><div class="w-2.5 h-2.5 rounded border border-theme/60 bg-theme-soft"></div><div class="h-2 rounded bg-theme-main/50 flex-1"></div></div>
                      <div class="flex items-center gap-1.5"><div class="w-2.5 h-2.5 rounded border border-theme/60 bg-theme-soft"></div><div class="h-2 rounded bg-theme-main/40 flex-1"></div></div>
                      <div class="flex items-center gap-1.5"><div class="w-2.5 h-2.5 rounded border border-theme/60 bg-theme-soft"></div><div class="h-2 rounded bg-theme-main/30 flex-1"></div></div>
                    </div>
                  `;
                } else if (id === 'notesMiniCalendarPanel') {
                  wireframeHtml = `
                    <div class="p-1.5 h-full flex flex-col justify-between gap-1">
                      <div class="grid grid-cols-7 gap-0.5"><div class="h-1.5 rounded-xs bg-theme-soft/80"></div><div class="h-1.5 rounded-xs bg-theme-soft/80"></div><div class="h-1.5 rounded-xs bg-theme-soft/80"></div><div class="h-1.5 rounded-xs bg-theme-main/50"></div><div class="h-1.5 rounded-xs bg-theme-soft/80"></div><div class="h-1.5 rounded-xs bg-theme-soft/80"></div><div class="h-1.5 rounded-xs bg-theme-soft/80"></div></div>
                      <div class="space-y-1"><div class="h-1.5 w-4/5 rounded bg-theme-main/40"></div><div class="h-1.5 w-3/5 rounded bg-theme-main/30"></div></div>
                    </div>
                  `;
                } else if (id === 'todayFocusContainer') {
                  wireframeHtml = `
                    <div class="p-1 h-full grid grid-cols-12 gap-1">
                      <div class="col-span-5 rounded bg-theme-soft/70 border border-theme/30 p-1 flex flex-col justify-between">
                        <div class="flex items-center gap-1"><div class="w-1.5 h-1.5 rounded-full bg-theme-accent"></div><div class="h-1.5 w-3/4 rounded bg-theme-main/50"></div></div>
                        <div class="space-y-0.5"><div class="h-1 rounded bg-theme-main/60 w-full"></div><div class="h-1 rounded bg-theme-soft/90 w-4/5"></div></div>
                      </div>
                      <div class="col-span-7 rounded bg-theme-soft/50 border border-theme/30 p-1 flex flex-col justify-between">
                        <div class="grid grid-cols-7 gap-0.5"><div class="h-1 rounded bg-theme-main/50"></div><div class="h-1 rounded bg-theme-main/50"></div><div class="h-1 rounded bg-theme-main/50"></div><div class="h-1 rounded bg-theme-main/50"></div><div class="h-1 rounded bg-theme-main/50"></div><div class="h-1 rounded bg-theme-main/50"></div><div class="h-1 rounded bg-theme-main/50"></div></div>
                        <div class="space-y-0.5"><div class="h-1 rounded bg-theme-soft/80 w-full"></div><div class="h-1 rounded bg-theme-soft/80 w-full"></div></div>
                      </div>
                    </div>
                  `;
                } else if (id === 'tab3ExpensesTableCard' || id === 'tab3FixedExpensesCard') {
                  wireframeHtml = `
                    <div class="p-1.5 h-full flex flex-col justify-between gap-1">
                      <div class="h-2 rounded bg-theme-main/30 border-b border-theme/40 w-full"></div>
                      <div class="space-y-1 flex-1 flex flex-col justify-around"><div class="h-1.5 rounded bg-theme-soft/60 w-full"></div><div class="h-1.5 rounded bg-theme-soft/60 w-full"></div><div class="h-1.5 rounded bg-theme-soft/60 w-full"></div></div>
                    </div>
                  `;
                } else if (id === 'tab2ModularHabitsSection' || id === 'tab4CustomHabitsSection') {
                  wireframeHtml = `
                    <div class="p-1.5 h-full grid grid-cols-2 gap-1">
                      <div class="rounded bg-theme-soft/60 border border-theme/20 p-1 flex flex-col justify-between"><div class="h-1.5 w-3/4 rounded bg-theme-main/40"></div><div class="h-1 w-full rounded bg-theme-main/60"></div></div>
                      <div class="rounded bg-theme-soft/60 border border-theme/20 p-1 flex flex-col justify-between"><div class="h-1.5 w-3/4 rounded bg-theme-main/40"></div><div class="h-1 w-full rounded bg-theme-main/60"></div></div>
                    </div>
                  `;
                } else if (id.includes('Evolution') || id.includes('Radar') || id.includes('Anatomy')) {
                  wireframeHtml = `
                    <div class="p-1 h-full flex items-center justify-center">
                      <svg class="w-full h-full text-theme-main/50" viewBox="0 0 100 40" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="5,35 25,20 45,28 65,12 85,18 95,5"/></svg>
                    </div>
                  `;
                } else {
                  wireframeHtml = `
                    <div class="p-1.5 h-full flex flex-col justify-between">
                      <div class="h-2 w-1/2 rounded bg-theme-main/40"></div>
                      <div class="space-y-1"><div class="h-2 rounded bg-theme-soft/60"></div><div class="h-2 rounded bg-theme-soft/60"></div></div>
                    </div>
                  `;
                }

                return `
                  <div class="mini-card-item space-y-1" data-cat="${def.category || 'all'}" data-id="${id}">
                    <div class="flex items-center justify-between text-[11px] font-bold text-stone-800 dark:text-slate-200 px-0.5">
                      <span class="flex items-center gap-1.5 truncate">
                        <span class="text-theme-main shrink-0">${def.iconSvg || ''}</span>
                        <span class="truncate">${def.name}</span>
                      </span>
                      <span class="text-[9px] font-mono px-1 rounded bg-theme-soft text-theme-main font-bold border border-theme/30">${colSpan}c · ${idealRows}f</span>
                    </div>

                    <div class="mini-card-box cursor-grab panel-bg border border-theme/50 rounded-lg overflow-hidden shadow-xs hover:border-theme-main transition relative" data-widget-preview="${id}" onpointerdown="app.startMiniWidgetDrag(event, '${id}')" title="Haz clic y arrastra al tablero para agrandar" style="height: ${boxHeight}; width: ${widthPercent}; margin: 0 auto;">
                      ${wireframeHtml}
                    </div>

                    <div class="flex items-center justify-end gap-1 pt-0.5">
                      <button type="button" onclick="app.addInactiveWidgetToGrid('${id}')" class="px-2 py-0.5 rounded bg-theme-soft text-theme-main hover:bg-theme-main hover:text-white text-[10px] font-bold border border-theme transition cursor-pointer">+ Cuadrícula</button>
                      <button type="button" onclick="app.moveCardToSidebar('${id}')" class="px-1.5 py-0.5 rounded subpanel-bg text-stone-600 dark:text-slate-300 hover:border-theme-main text-[10px] font-bold border border-theme transition cursor-pointer">+ Panel</button>
                      <button type="button" onclick="app.addWidgetToDock('${id}')" class="px-1.5 py-0.5 rounded bg-theme-accent-soft text-theme-accent hover:bg-theme-accent hover:text-white text-[10px] font-bold border border-theme transition cursor-pointer" title="Añadir al dock">+ Dock</button>
                    </div>
                  </div>
                `;
              }).join('')}

              ${placedWidgets.length > 0 ? `
                <div class="pt-3 border-t border-theme/60 space-y-2.5 mt-4">
                  <div class="flex items-center justify-between text-xs font-bold text-stone-800 dark:text-slate-200 px-0.5">
                    <span class="flex items-center gap-1.5">
                      <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
                      <span>Módulos en uso en esta ventana (${placedWidgets.length})</span>
                    </span>
                  </div>
                  <div class="space-y-2">
                    ${placedWidgets.map(id => {
                      const def = catalog[id] || { name: id, iconSvg: '', defaultColSpan: 6, idealRows: 8 };
                      const colSpan = def.defaultColSpan || 6;
                      const idealRows = def.idealRows || 8;
                      const boxHeight = Math.max(50, Math.min(140, Math.round(idealRows * 8.5))) + 'px';
                      const widthPercent = Math.min(100, Math.max(45, Math.round((colSpan / 12) * 100))) + '%';

                      let locBadge = '';
                      if (activeGridIds.has(id)) {
                        const cfg = gridLayout[id] || {};
                        locBadge = `<span class="px-1.5 py-0.5 rounded font-mono text-[9px] bg-theme-soft text-theme-main font-bold border border-theme/30">Cuadrícula (${cfg.colSpan || colSpan}c · ${cfg.rowSpan || idealRows}f)</span>`;
                      } else if (activeSidebarIds.has(id)) {
                        locBadge = `<span class="px-1.5 py-0.5 rounded font-mono text-[9px] bg-blue-900/30 text-blue-400 font-bold border border-blue-700/40">Panel Lateral</span>`;
                      } else if (activeDockIds.has(id)) {
                        locBadge = `<span class="px-1.5 py-0.5 rounded font-mono text-[9px] bg-amber-900/30 text-amber-400 font-bold border border-amber-700/40">Dock</span>`;
                      }

                      return `
                        <div class="mini-card-item space-y-1 p-2 rounded-xl subpanel-bg border border-theme/40 opacity-95 hover:opacity-100 transition" data-placed-id="${id}">
                          <div class="flex items-center justify-between text-[11px] font-bold text-stone-800 dark:text-slate-200 px-0.5">
                            <span class="flex items-center gap-1.5 truncate">
                              <span class="text-theme-main shrink-0">${def.iconSvg || ''}</span>
                              <span class="truncate">${def.name}</span>
                            </span>
                            ${locBadge}
                          </div>

                          <div class="mini-card-box panel-bg border border-theme/30 rounded-lg overflow-hidden shadow-xs relative pointer-events-none" data-widget-preview="${id}" style="height: ${boxHeight}; width: ${widthPercent}; margin: 0 auto;"></div>

                          <div class="flex items-center justify-between gap-1 pt-1">
                            <button type="button" onclick="app.locateWidgetOnBoard('${id}')" class="px-2 py-0.5 rounded bg-theme-soft text-theme-main hover:bg-theme-main hover:text-white text-[10px] font-bold border border-theme transition cursor-pointer flex items-center gap-1">
                              <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>
                              <span>Localizar</span>
                            </button>
                            <button type="button" onclick="app.sendWidgetToDrawer('${id}')" class="px-2 py-0.5 rounded bg-rose-500/15 text-rose-500 hover:bg-rose-500 hover:text-white text-[10px] font-bold border border-rose-500/30 transition cursor-pointer">
                              Inactivar
                            </button>
                          </div>
                        </div>
                      `;
                    }).join('')}
                  </div>
                </div>
              ` : ''}
            </div>
          `;

          // Inyectar clon visual auténtico a escala reducida para cada cuadro disponible
          drawer.querySelectorAll('[data-widget-preview]').forEach(box => {
            const wid = box.getAttribute('data-widget-preview');
            const realEl = document.getElementById(wid);
            if (realEl) {
              const clone = realEl.cloneNode(true);
              clone.removeAttribute('id');
              clone.querySelectorAll('[id]').forEach(x => x.removeAttribute('id'));
              clone.querySelectorAll('.board-edit-ctrl-overlay, .card-resize-handle, .board-edit-header-bar, .card-drag-shield').forEach(x => x.remove());
              clone.classList.remove('card-edit-mode', 'widget-parked-inert');
              clone.style.pointerEvents = 'none';
              clone.style.userSelect = 'none';
              clone.style.width = '100%';
              clone.style.margin = '0';

              if (wid === 'todayFocusContainer') {
                clone.classList.remove('habits-matrix-collapsed', 'subview-week');
                const wk = clone.querySelector('.habits-subpanel-week');
                if (wk) wk.style.display = 'block';
                const hy = clone.querySelector('.habits-subpanel-today');
                if (hy) hy.style.display = 'block';
              }

              const scaleWrapper = document.createElement('div');
              scaleWrapper.className = 'mini-card-scale-wrapper';
              const innerScaler = document.createElement('div');
              innerScaler.className = 'mini-cloned-preview';
              innerScaler.appendChild(clone);
              scaleWrapper.appendChild(innerScaler);

              box.innerHTML = '';
              box.appendChild(scaleWrapper);
            }
          });
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

        locateWidgetOnBoard(id) {
          const ws = (window.WorkspacesManager) ? window.WorkspacesManager.getActiveWorkspace() : null;
          if (ws && ws.dockWidgets && ws.dockWidgets.includes(id)) {
            if (typeof app !== 'undefined' && app.openDockSidebar) app.openDockSidebar(id);
            return;
          }
          if (ws && ws.sidebarWidgets && ws.sidebarWidgets.includes(id)) {
            const sb = document.getElementById('workspaceSidebar');
            if (sb && sb.classList.contains('hidden')) {
              if (typeof app !== 'undefined' && app.toggleSidebar) app.toggleSidebar();
            }
          }
          const el = document.getElementById(id);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.classList.add('widget-locate-highlight');
            setTimeout(() => {
              el.classList.remove('widget-locate-highlight');
            }, 2400);
            this.safeToast('Módulo localizado en el tablero.', 'emerald');
          } else {
            this.safeToast('El módulo no está visible en el tablero.', 'warning');
          }
        },

        // Helper reutilizable de auto-scroll continuo por requestAnimationFrame
        startAutoScrollLoop(getPointerY, onScrollTick) {
          let animId = null;
          let isRunning = true;

          const tick = () => {
            if (!isRunning) return;
            const curY = (typeof getPointerY === 'function') ? getPointerY() : null;
            if (curY !== null && curY !== undefined) {
              const topThreshold = 115;
              const bottomThreshold = window.innerHeight - 85;
              let scrollDelta = 0;

              if (curY < topThreshold && window.scrollY > 0) {
                const factor = Math.max(0, Math.min(1, (topThreshold - curY) / topThreshold));
                scrollDelta = -Math.round(6 + factor * 16);
              } else if (curY > bottomThreshold) {
                const maxScrollY = document.documentElement.scrollHeight - window.innerHeight;
                if (window.scrollY < maxScrollY - 2) {
                  const factor = Math.max(0, Math.min(1, (curY - bottomThreshold) / 85));
                  scrollDelta = Math.round(6 + factor * 16);
                }
              }

              if (scrollDelta !== 0) {
                window.scrollBy({ top: scrollDelta, behavior: 'instant' });
                if (typeof onScrollTick === 'function') {
                  onScrollTick(scrollDelta);
                }
              }
            }
            animId = requestAnimationFrame(tick);
          };

          animId = requestAnimationFrame(tick);

          return () => {
            isRunning = false;
            if (animId) cancelAnimationFrame(animId);
          };
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
          let currentPointerX = e.clientX;
          let currentPointerY = e.clientY;

          const updateMiniDragPos = (me) => {
            if (me) {
              currentPointerX = me.clientX;
              currentPointerY = me.clientY;
            }
            const curX = currentPointerX;
            const curY = currentPointerY;

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

          const stopAutoScroll = this.startAutoScrollLoop(
            () => currentPointerY,
            () => { updateMiniDragPos(null); }
          );

          const onPointerMove = (me) => updateMiniDragPos(me);

          const onPointerUp = () => {
            stopAutoScroll();
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

        sendWidgetToDock(widgetId) {
          return this.addWidgetToDock(widgetId);
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
          if (window.WidgetsRegistry) {
            window.WidgetsRegistry.parkWidget(widgetId);
          }
          
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
            this.applyGridLayout();
            if (state.ui && state.ui.isBoardEditMode) {
              this.renderBoardEditHandles();
            }
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
            const isEdit = (typeof this.isBoardEditMode === 'function') ? this.isBoardEditMode() : false;
            const ws = window.WorkspacesManager ? window.WorkspacesManager.getActiveWorkspace() : null;
            if (ws && ws.grid && ws.grid[cardId]) {
              const cfg = ws.grid[cardId];
              cfg.compact = isComp;
              if (isEdit) {
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
            }
            if (isEdit) {
              this.compactGrid();
              this.applyGridLayout();
              this.renderBoardEditHandles();
            }
            if (cardId === 'todayFocusContainer') {
              if (typeof window.renderDailyHabits === 'function') window.renderDailyHabits();
              else if (typeof app !== 'undefined' && typeof app.renderDailyHabits === 'function') app.renderDailyHabits();
            }
            this.safeToast(isComp ? 'Modo Compacto activado: micro-cuadrícula acoplada.' : 'Modo Normal restaurado.', 'emerald');
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
          let currentPointerX = e.clientX;
          let currentPointerY = e.clientY;
          let isHoveringSidebar = false;
          let isHoveringDrawer = false;
          let isHoveringDock = false;

          const updateDragPosition = (moveEvent) => {
            if (moveEvent) {
              lastMoveEvent = moveEvent;
              currentPointerX = moveEvent.clientX;
              currentPointerY = moveEvent.clientY;
            }
            const evt = lastMoveEvent;
            if (!evt) return;

            const curX = currentPointerX;
            const curY = currentPointerY;

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

            // Auto-apertura si se arrastra sobre la pestaña flotante izquierda (pull-tab)
            const pullTabEl = document.getElementById('sidebarPullTab');
            if (pullTabEl && pullTabEl.offsetParent !== null) {
              const ptRect = pullTabEl.getBoundingClientRect();
              if (curX >= ptRect.left && curX <= ptRect.right && curY >= ptRect.top && curY <= ptRect.bottom) {
                if (typeof app !== 'undefined' && app.toggleSidebar) {
                  app.toggleSidebar(true);
                }
              }
            }

            // Detección de arrastre sobre el panel lateral (sidebar)
            const sidebarEl = document.getElementById('workspaceSidebar');
            const sidebarRect = (sidebarEl && !sidebarEl.classList.contains('hidden') && !sidebarEl.classList.contains('collapsed')) ? sidebarEl.getBoundingClientRect() : null;
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

            // Detección de arrastre sobre el Dock inferior (#floatingDock)
            const dockEl = document.getElementById('floatingDock');
            const dockRect = (dockEl && dockEl.offsetParent !== null && !dockEl.classList.contains('hidden'))
              ? dockEl.getBoundingClientRect()
              : null;
            isHoveringDock = !!(dockRect && (
              curX >= dockRect.left - 20 && curX <= dockRect.right + 20 &&
              curY >= dockRect.top - 30 && curY <= dockRect.bottom + 30
            ));

            if (isHoveringDock) {
              if (ghost) {
                ghost.style.left = dockRect.left + 'px';
                ghost.style.top = (dockRect.top - 10) + 'px';
                ghost.style.width = dockRect.width + 'px';
                ghost.style.height = '48px';
              }
              if (placeholder) placeholder.style.display = 'none';
              if (badge) badge.textContent = (cfg.name || cardId) + ' → Soltar en el Dock inferior';
              dockEl.classList.add('dock-drop-highlight');
              return;
            } else if (dockEl) {
              dockEl.classList.remove('dock-drop-highlight');
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

          const stopAutoScroll = this.startAutoScrollLoop(
            () => currentPointerY,
            () => { updateDragPosition(null); }
          );

          const onPointerMove = (moveEvent) => {
            updateDragPosition(moveEvent);
          };

          const onScroll = () => {
            updateDragPosition(lastMoveEvent);
          };

          const onPointerUp = () => {
            stopAutoScroll();
            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('pointerup', onPointerUp);
            window.removeEventListener('pointercancel', onPointerUp);
            window.removeEventListener('scroll', onScroll);

            const drawerEl = document.getElementById('widgetsDrawer');
            if (drawerEl) drawerEl.classList.remove('drawer-drop-highlight');
            const dockEl = document.getElementById('floatingDock');
            if (dockEl) dockEl.classList.remove('dock-drop-highlight');

            if (ghost) ghost.style.display = 'none';
            if (placeholder) placeholder.style.display = 'none';
            el.style.opacity = '1';

            if (isHoveringDrawer || isHoveringSidebar || isHoveringDock || isFromSidebar || targetCol !== cfg.col || targetRow !== cfg.row) {
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

            if (isHoveringDock) {
              this.sendWidgetToDock(cardId);
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
          let currentPointerX = e.clientX;
          let currentPointerY = e.clientY;

          const isLeft = direction.includes('l') || direction.includes('w');
          const isRight = direction.includes('r') || direction.includes('e');
          const isTop = direction.includes('t') || direction.includes('n');
          const isBottom = direction.includes('b') || direction.includes('s');

          const updateResizePosition = (moveEvent) => {
            if (moveEvent) {
              lastResizeEvent = moveEvent;
              currentPointerX = moveEvent.clientX;
              currentPointerY = moveEvent.clientY;
            }
            const evt = lastResizeEvent;
            if (!evt) return;

            // Medición DINÁMICA en vivo del contenedor
            const curContainerRect = container.getBoundingClientRect ? container.getBoundingClientRect() : el.getBoundingClientRect();
            const colWidth = (curContainerRect.width - 11 * gap) / 12;
            const colPitch = colWidth + gap;
            const rowPitch = 40 + gap; // 52px

            const curPageX = currentPointerX + window.scrollX;
            const curPageY = currentPointerY + window.scrollY;
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

          const stopAutoScroll = this.startAutoScrollLoop(
            () => currentPointerY,
            () => { updateResizePosition(null); }
          );

          const onPointerMove = (moveEvent) => {
            updateResizePosition(moveEvent);
          };

          const onScroll = () => {
            updateResizePosition(lastResizeEvent);
          };

          const onPointerUp = () => {
            stopAutoScroll();
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

          ['todayFocusContainer', 'notesMiniCalendarPanel', 'interactiveListsPanel', 'tab1RecentExpensesBar',
           'tab2ModularHabitsSection', 'tab2ScheduleSection', 'tab2AttendanceRulesSection',
           'tab3BudgetConfigCard', 'tab3SavingsGoalsCard', 'tab3PiggyCard', 'tab3FixedExpensesCard', 'tab3ExpensesTableCard',
           'tab4StudyAuditSection', 'tab4CustomHabitsSection', 'tab4AnatomyCard', 'tab4RunningRadarCard', 'tab4EvolutionSection'].forEach(id => {
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

        rebalanceTab1Layout() {
          if (!state.uiPreferences) return;
          const p = state.uiPreferences;

          const todayWrap = document.getElementById('todayFocusContainer');
          const listsP = document.getElementById('interactiveListsPanel');
          const miniCal = document.getElementById('notesMiniCalendarPanel');
          const recExp = document.getElementById('tab1RecentExpensesBar');

          const todayVisible = (p.showDailyCards !== false);
          const recExpVisible = (p.showRecentExpenses !== false);
          const miniCalVisible = (p.showMiniCalendar !== false);
          const listsVisible = (p.showListsPanel !== false);

          if (todayWrap) todayWrap.classList.toggle('hidden', !todayVisible);
          if (miniCal) miniCal.classList.toggle('hidden', !miniCalVisible);
          if (recExp) recExp.classList.toggle('hidden', !recExpVisible);
          if (listsP) listsP.classList.toggle('hidden', !listsVisible);

          if (window.app && typeof window.app.syncHabitsCompoundLayout === 'function') {
            window.app.syncHabitsCompoundLayout();
          }

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
      workspaces: JSON.parse(JSON.stringify(state.workspaces || [])),
      gridLayouts: JSON.parse(JSON.stringify(state.uiPreferences?.gridLayouts || {})),
      uiPreferences: JSON.parse(JSON.stringify(state.uiPreferences || {})),
      globalSidebar: JSON.parse(JSON.stringify(state.globalSidebar || { isOpen: false, position: 'right', widgets: [] })),
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
    if (prof.workspaces && Array.isArray(prof.workspaces) && prof.workspaces.length > 0) {
      state.workspaces = JSON.parse(JSON.stringify(prof.workspaces));
    }
    if (prof.globalSidebar) {
      state.globalSidebar = JSON.parse(JSON.stringify(prof.globalSidebar));
    }
    if (prof.gridLayouts) {
      if (!state.uiPreferences) state.uiPreferences = {};
      state.uiPreferences.gridLayouts = JSON.parse(JSON.stringify(prof.gridLayouts));
    }
    if (prof.uiPreferences) {
      Object.assign(state.uiPreferences, JSON.parse(JSON.stringify(prof.uiPreferences)));
    }

    state.activeDeviceProfileId = profileId;
    saveState();

    if (typeof WorkspacesManager !== 'undefined' && WorkspacesManager.mountActiveWorkspace) {
      WorkspacesManager.mountActiveWorkspace();
    }
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

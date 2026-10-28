// ========================================================
// REGISTRO CENTRAL DE WIDGETS (SINGLE-DOM POOL & REPARENTING)
// Centraliza el catálogo, metadata, zonas permitidas y montaje
// dinámico de todos los widgets del Centro de Control.
// ========================================================

const WidgetsRegistry = (function() {
  'use strict';

  // Catálogo maestro de widgets del sistema
  const CATALOG = {
    todayFocusContainer: {
      id: 'todayFocusContainer',
      name: 'Enfoque y Hábitos de Hoy',
      category: 'habits',
      shortcut: 'H',
      allowedZones: ['grid', 'sidebar'],
      defaultZone: 'grid',
      minRows: 12,
      idealRows: 18,
      defaultColSpan: 6,
      minColSpan: 4,
      supportsCompact: true,
      polymorphic: true,
      iconSvg: '<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 14 14"/></svg>'
    },
    notesMiniCalendarPanel: {
      id: 'notesMiniCalendarPanel',
      name: 'Calendario & Eventos',
      category: 'agenda',
      shortcut: 'C',
      allowedZones: ['grid', 'sidebar', 'dock'],
      defaultZone: 'grid',
      minRows: 6,
      idealRows: 8,
      defaultColSpan: 6,
      minColSpan: 4,
      supportsCompact: true,
      polymorphic: true,
      iconSvg: '<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>'
    },
    interactiveListsPanel: {
      id: 'interactiveListsPanel',
      name: 'Listas, Tareas y Notas',
      category: 'agenda',
      shortcut: 'L',
      allowedZones: ['grid', 'sidebar'],
      defaultZone: 'grid',
      minRows: 10,
      idealRows: 14,
      defaultColSpan: 6,
      minColSpan: 3,
      supportsCompact: true,
      polymorphic: false,
      iconSvg: '<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>'
    },
    tab1RecentExpensesBar: {
      id: 'tab1RecentExpensesBar',
      name: 'Movimientos Recientes',
      category: 'finance',
      shortcut: 'M',
      allowedZones: ['grid', 'sidebar', 'dock'],
      defaultZone: 'grid',
      minRows: 3,
      idealRows: 4,
      defaultColSpan: 6,
      minColSpan: 3,
      supportsCompact: true,
      polymorphic: false,
      iconSvg: '<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>'
    },
    weekTableContainer: {
      id: 'weekTableContainer',
      name: 'Matriz Semanal de Hábitos',
      category: 'habits',
      shortcut: 'W',
      allowedZones: ['grid'],
      defaultZone: 'grid',
      minRows: 6,
      idealRows: 8,
      defaultColSpan: 12,
      minColSpan: 6,
      supportsCompact: true,
      polymorphic: false,
      iconSvg: '<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/></svg>'
    },
    tab2ModularHabitsSection: {
      id: 'tab2ModularHabitsSection',
      name: 'Plantilla de Metas y Hábitos',
      category: 'habits',
      shortcut: 'G',
      allowedZones: ['grid'],
      defaultZone: 'grid',
      minRows: 6,
      idealRows: 8,
      defaultColSpan: 12,
      minColSpan: 6,
      supportsCompact: true,
      polymorphic: true,
      iconSvg: '<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>'
    },
    tab2ScheduleSection: {
      id: 'tab2ScheduleSection',
      name: 'Horario Semanal de Estudio',
      category: 'agenda',
      shortcut: 'S',
      allowedZones: ['grid'],
      defaultZone: 'grid',
      minRows: 10,
      idealRows: 14,
      defaultColSpan: 8,
      minColSpan: 6,
      supportsCompact: true,
      polymorphic: false,
      iconSvg: '<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>'
    },
    tab2AttendanceRulesSection: {
      id: 'tab2AttendanceRulesSection',
      name: 'Reglas de Asistencia y Clases',
      category: 'performance',
      shortcut: 'A',
      allowedZones: ['grid', 'sidebar'],
      defaultZone: 'grid',
      minRows: 10,
      idealRows: 14,
      defaultColSpan: 4,
      minColSpan: 3,
      supportsCompact: true,
      polymorphic: false,
      iconSvg: '<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>'
    },
    tab3BudgetConfigCard: {
      id: 'tab3BudgetConfigCard',
      name: 'Presupuesto Semanal',
      category: 'finance',
      shortcut: 'B',
      allowedZones: ['grid', 'sidebar'],
      defaultZone: 'grid',
      minRows: 6,
      idealRows: 8,
      defaultColSpan: 6,
      minColSpan: 4,
      supportsCompact: true,
      polymorphic: false,
      iconSvg: '<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>'
    },
    tab3SavingsGoalsCard: {
      id: 'tab3SavingsGoalsCard',
      name: 'Metas de Ahorro',
      category: 'finance',
      shortcut: 'O',
      allowedZones: ['grid', 'sidebar'],
      defaultZone: 'grid',
      minRows: 6,
      idealRows: 8,
      defaultColSpan: 6,
      minColSpan: 4,
      supportsCompact: true,
      polymorphic: true,
      iconSvg: '<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>'
    },
    tab3PiggyCard: {
      id: 'tab3PiggyCard',
      name: 'Hucha Global',
      category: 'finance',
      shortcut: 'P',
      allowedZones: ['grid', 'dock'],
      defaultZone: 'grid',
      minRows: 6,
      idealRows: 8,
      defaultColSpan: 12,
      minColSpan: 4,
      supportsCompact: true,
      polymorphic: false,
      iconSvg: '<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><line x1="12" y1="18" x2="12" y2="6"/></svg>'
    },
    tab3FixedExpensesCard: {
      id: 'tab3FixedExpensesCard',
      name: 'Gastos Fijos Mensuales',
      category: 'finance',
      shortcut: 'F',
      allowedZones: ['grid', 'sidebar'],
      defaultZone: 'grid',
      minRows: 6,
      idealRows: 8,
      defaultColSpan: 5,
      minColSpan: 4,
      supportsCompact: true,
      polymorphic: false,
      iconSvg: '<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>'
    },
    tab3ExpensesTableCard: {
      id: 'tab3ExpensesTableCard',
      name: 'Tabla de Gastos Detallada',
      category: 'finance',
      shortcut: 'T',
      allowedZones: ['grid'],
      defaultZone: 'grid',
      minRows: 6,
      idealRows: 8,
      defaultColSpan: 7,
      minColSpan: 5,
      supportsCompact: true,
      polymorphic: false,
      iconSvg: '<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>'
    },
    tab4StudyAuditSection: {
      id: 'tab4StudyAuditSection',
      name: 'Auditoría de Estudio',
      category: 'performance',
      shortcut: 'E',
      allowedZones: ['grid'],
      defaultZone: 'grid',
      minRows: 6,
      idealRows: 8,
      defaultColSpan: 12,
      minColSpan: 6,
      supportsCompact: true,
      polymorphic: false,
      iconSvg: '<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>'
    },
    tab4CustomHabitsSection: {
      id: 'tab4CustomHabitsSection',
      name: 'Hábitos Personalizados',
      category: 'habits',
      shortcut: 'K',
      allowedZones: ['grid', 'sidebar'],
      defaultZone: 'grid',
      minRows: 6,
      idealRows: 8,
      defaultColSpan: 6,
      minColSpan: 3,
      supportsCompact: true,
      polymorphic: false,
      iconSvg: '<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>'
    },
    tab4AnatomyCard: {
      id: 'tab4AnatomyCard',
      name: 'Mapa Muscular Anatómico',
      category: 'performance',
      shortcut: 'M',
      allowedZones: ['grid', 'sidebar', 'dock'],
      defaultZone: 'grid',
      minRows: 6,
      idealRows: 8,
      defaultColSpan: 6,
      minColSpan: 3,
      supportsCompact: true,
      polymorphic: false,
      iconSvg: '<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a4 4 0 0 1 4 4v2a4 4 0 0 1-8 0V6a4 4 0 0 1 4-4z"></path><path d="M6 10v6a6 6 0 0 0 12 0v-6"></path></svg>'
    },
    tab4RunningRadarCard: {
      id: 'tab4RunningRadarCard',
      name: 'Tri-Sistema Running y Pista',
      category: 'performance',
      shortcut: 'R',
      allowedZones: ['grid', 'sidebar', 'dock'],
      defaultZone: 'grid',
      minRows: 6,
      idealRows: 8,
      defaultColSpan: 6,
      minColSpan: 3,
      supportsCompact: true,
      polymorphic: false,
      iconSvg: '<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"></path></svg>'
    },
    tab4EvolutionSection: {
      id: 'tab4EvolutionSection',
      name: 'Histórico y Gráficos',
      category: 'performance',
      shortcut: 'V',
      allowedZones: ['grid'],
      defaultZone: 'grid',
      minRows: 10,
      idealRows: 12,
      defaultColSpan: 12,
      minColSpan: 6,
      supportsCompact: true,
      polymorphic: false,
      iconSvg: '<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>'
    },
    topKpisWrapper: {
      id: 'topKpisWrapper',
      name: 'Métricas & 4 KPIs Semanales',
      category: 'performance',
      shortcut: 'K',
      allowedZones: ['grid', 'sidebar', 'header'],
      defaultZone: 'grid',
      minRows: 2,
      idealRows: 4,
      defaultColSpan: 12,
      minColSpan: 4,
      supportsCompact: true,
      polymorphic: false,
      iconSvg: '<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>'
    }
  };

  // Referencia al pool inerte de widgets
  let poolElement = null;

  function getPool() {
    if (!poolElement) {
      poolElement = document.getElementById('widgetsPool');
      if (!poolElement && typeof document !== 'undefined') {
        poolElement = document.createElement('div');
        poolElement.id = 'widgetsPool';
        poolElement.style.display = 'none';
        poolElement.setAttribute('aria-hidden', 'true');
        document.body.appendChild(poolElement);
      }
    }
    return poolElement;
  }

  return {
    getCatalog() {
      return JSON.parse(JSON.stringify(CATALOG));
    },

    getWidgetDef(widgetId) {
      return CATALOG[widgetId] || null;
    },

    getAllWidgetIds() {
      return Object.keys(CATALOG);
    },

    // Mueve un widget al pool inerte sin destruir sus listeners ni su estado
    parkWidget(widgetId) {
      const el = document.getElementById(widgetId);
      const pool = getPool();
      if (el && pool && el.parentElement !== pool) {
        pool.appendChild(el);
        el.classList.add('widget-parked-inert');
      }
    },

    // Monta un widget en un contenedor de destino mediante reparenting fluido
    mountWidget(widgetId, targetContainer, options = {}) {
      const el = document.getElementById(widgetId);
      if (!el || !targetContainer) return null;

      el.classList.remove('widget-parked-inert');
      if (el.parentElement !== targetContainer) {
        targetContainer.appendChild(el);
      }

      if (options.className) {
        el.className = options.className;
      }
      return el;
    },

    // Determina dónde está físicamente montado el widget
    getWidgetLocation(widgetId) {
      const el = document.getElementById(widgetId);
      if (!el) return 'missing';
      const parent = el.parentElement;
      if (!parent) return 'detached';
      if (parent.id === 'widgetsPool') return 'pool';
      if (parent.id === 'workspaceGrid' || parent.classList.contains('dashboard-grid-12')) return 'grid';
      if (parent.id === 'workspaceSidebar' || parent.id === 'sidebarWidgetsContainer') return 'sidebar';
      if (parent.id === 'floatingDock' || parent.closest('#floatingDock')) return 'dock';
      return 'custom';
    },

    // Parquea todos los widgets que no formen parte de la lista activa
    parkInactiveWidgets(activeWidgetIds) {
      const activeSet = new Set(activeWidgetIds);
      Object.keys(CATALOG).forEach(id => {
        if (!activeSet.has(id)) {
          this.parkWidget(id);
        }
      });
    }
  };
})();

if (typeof window !== 'undefined') {
  window.WidgetsRegistry = WidgetsRegistry;
}

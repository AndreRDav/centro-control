// ========================================================
// POLIMORFISMO GEOMÉTRICO, CONSERVACIÓN DE ÁREA Y SOFT-SNAP
// Gestiona la adaptación de tarjetas (1×4, 2×2, 4×1), el modo
// compacto inteligente, la expansión en vivo y el imán óptimo.
// ========================================================

const PolymorphicCards = (function() {
  'use strict';

  return {
    // Aplica la disposición polimórfica según colSpan y rowSpan
    updateCardAspect(cardId, colSpan, rowSpan) {
      const el = document.getElementById(cardId);
      if (!el) return;

      colSpan = colSpan || 12;
      rowSpan = rowSpan || 6;

      let aspect = 'horizontal';
      if (colSpan <= 4) {
        aspect = 'tower';
      } else if (colSpan <= 8 && rowSpan >= 6) {
        aspect = 'square';
      } else {
        aspect = 'horizontal';
      }

      el.setAttribute('data-card-aspect', aspect);

      // Adaptación específica para el panel de 4 KPIs
      if (cardId === 'kpiGridContainer' || cardId === 'topKpisWrapper') {
        const kpiGrid = el.id === 'kpiGridContainer' ? el : (el.querySelector('#kpiGridContainer') || el);
        kpiGrid.classList.remove('grid-cols-1', 'grid-cols-2', 'grid-cols-4', 'lg:grid-cols-4');
        if (aspect === 'tower') {
          kpiGrid.classList.add('grid-cols-1');
        } else if (aspect === 'square') {
          kpiGrid.classList.add('grid-cols-2');
        } else {
          kpiGrid.classList.add('grid-cols-2', 'lg:grid-cols-4');
        }
      }

      // Adaptación para bloques de hábitos modulares
      if (cardId === 'tab2ModularHabitsSection') {
        const gridBox = el.querySelector('#tab2GoalsGrid');
        if (gridBox) {
          gridBox.classList.remove('grid-cols-1', 'grid-cols-2', 'grid-cols-3', 'grid-cols-4');
          if (aspect === 'tower') {
            gridBox.classList.add('grid-cols-1');
          } else if (aspect === 'square') {
            gridBox.classList.add('grid-cols-2');
          } else {
            gridBox.classList.add('grid-cols-1', 'sm:grid-cols-2', 'lg:grid-cols-3');
          }
        }
      }
    },

    // Activa o desactiva el Modo Compacto Inteligente en una tarjeta
    toggleCompactMode(cardId, forceState) {
      const el = document.getElementById(cardId);
      if (!el) return false;

      const isCompact = (typeof forceState === 'boolean') 
        ? forceState 
        : !el.classList.contains('card-mode-compact');

      if (isCompact) {
        el.classList.add('card-mode-compact');
      } else {
        el.classList.remove('card-mode-compact');
      }

      // Guardar preferencia en el workspace activo
      if (window.WorkspacesManager) {
        const ws = window.WorkspacesManager.getActiveWorkspace();
        if (ws && ws.grid && ws.grid[cardId]) {
          ws.grid[cardId].compact = isCompact;
        }
      }

      // Recalcular dimensiones con el nuevo modo compacto
      if (typeof app !== 'undefined' && app.measureNaturalRows) {
        const newMin = app.measureNaturalRows(el);
        if (window.WorkspacesManager) {
          const ws = window.WorkspacesManager.getActiveWorkspace();
          if (ws && ws.grid && ws.grid[cardId]) {
            ws.grid[cardId].minRows = newMin;
            if (!ws.grid[cardId].manualRows || ws.grid[cardId].manualRows < newMin) {
              ws.grid[cardId].rowSpan = newMin;
            }
          }
        }
        if (typeof app.applyGridLayout === 'function') {
          app.applyGridLayout();
        }
      }

      return isCompact;
    },

    // Calcula el tamaño óptimo recomendado (idealMaxRows)
    computeIdealRows(cardEl) {
      if (!cardEl || !cardEl.getBoundingClientRect) return 6;
      const naturalHeight = cardEl.scrollHeight || cardEl.getBoundingClientRect().height;
      const rowPitch = 52; // 40px fila + 12px gap
      const calculated = Math.ceil((naturalHeight + 12) / rowPitch);
      return Math.max(2, calculated);
    },

    // Aplica distribución vertical armónica cuando una tarjeta tiene altura extra
    applyVerticalJustification(cardEl, hasExtraHeight) {
      if (!cardEl) return;
      if (hasExtraHeight) {
        cardEl.classList.add('card-has-extra-height');
      } else {
        cardEl.classList.remove('card-has-extra-height');
      }
    }
  };
})();

if (typeof window !== 'undefined') {
  window.PolymorphicCards = PolymorphicCards;
}

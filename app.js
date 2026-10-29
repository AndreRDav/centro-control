// CENTRO DE CONTROL - APP CORE CONTROLLER
// UI Renderers, Tab Handlers, Modals & Business Logic
'use strict';

      function getActiveWeek() {
        return state.weeks[state.viewingWeek] || state.weeks[state.currentWeek];
      }

      function getWeekEnabledModules(w = getActiveWeek()) {
        const fallback = state?.enabledModules || { gym: true, run: true, study: true, academic: true, nutri: true, budget: true };
        if (w && w.enabledModules && typeof w.enabledModules === 'object') {
          return Object.assign({}, fallback, w.enabledModules);
        }
        return Object.assign({}, fallback);
      }

      function calculateAutoWeeklyBudget() {
        const s = state.financeSettings;
        const fixedSum = state.monthlyFixedItems.reduce((acc, it) => acc + (Number(it.amount) || 0), 0);
        const netMonth = Math.max(0, (Number(s.monthlyIncome) || 0) - fixedSum - (Number(s.monthlySavingsGoal) || 0));
        return parseFloat((netMonth / 4.333).toFixed(2));
      }

      // Evaluador seguro de operaciones matemáticas para inputs de importe (ej: 15.6-2.3, 10+5*2)
      function parseNumericExpression(raw) {
        if (raw === undefined || raw === null) return NaN;
        const clean = String(raw).replace(/,/g, '.').trim();
        if (!clean) return NaN;
        if (/^[0-9+\-*/.()\s]+$/.test(clean)) {
          try {
            const res = Function('"use strict"; return (' + clean + ')')();
            if (typeof res === 'number' && !isNaN(res) && isFinite(res)) {
              return parseFloat(res.toFixed(2));
            }
          } catch (_) {}
        }
        const direct = parseFloat(clean);
        return isNaN(direct) ? NaN : parseFloat(direct.toFixed(2));
      }

      // HELPERS DE FECHAS REALES
      function getWeekDateRange(weekNum) {
        let base;
        let baseDateStr = state.startDate;
        if (typeof baseDateStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(baseDateStr)) {
          const [by, bm, bd] = baseDateStr.split('-').map(Number);
          base = new Date(by, bm - 1, bd);
        } else {
          const n = new Date();
          base = new Date(n.getFullYear(), n.getMonth(), n.getDate());
        }
        // Ajustar al lunes de la semana 1
        const dayOffset = (base.getDay() + 6) % 7;
        const firstMonday = new Date(base.getFullYear(), base.getMonth(), base.getDate() - dayOffset);
        firstMonday.setHours(0, 0, 0, 0);
        
        // Sumar semanas
        const targetMonday = new Date(firstMonday.getFullYear(), firstMonday.getMonth(), firstMonday.getDate() + (weekNum - 1) * 7);
        targetMonday.setHours(0, 0, 0, 0);
        const targetSunday = new Date(targetMonday.getFullYear(), targetMonday.getMonth(), targetMonday.getDate() + 6);
        targetSunday.setHours(23, 59, 59, 999);

        const formatShort = (d) => `${d.getDate()} ${d.toLocaleString('es-ES', { month: 'short' })}`;
        return {
          start: targetMonday,
          end: targetSunday,
          label: `${formatShort(targetMonday)} – ${formatShort(targetSunday)} ${targetSunday.getFullYear()}`,
          daysDates: Array.from({ length: 7 }, (_, i) => new Date(targetMonday.getFullYear(), targetMonday.getMonth(), targetMonday.getDate() + i).getDate())
        };
      }

      function isWeekOverdue(weekNum = state.currentWeek) {
        const range = getWeekDateRange(weekNum);
        if (!range || !range.end) return false;
        const now = new Date();
        return now.getTime() > range.end.getTime();
      }

      // MOTOR DE CÁLCULO DE MÉTRICAS (ADAPTABLE / MODULAR)
      function calculateWeekMetrics(w) {
        if (!w) return { score: 0, gymPct: 0, runPct: 0, studyPct: 0, attPct: 0, nutriPct: 0, finPct: 0, spent: 0, budget: 60, customHabitsPct: {}, totalActiveBlocks: 6, blocksMetCount: 0 };
        const g = w.goals;
        const enabled = getWeekEnabledModules(w);

        // 1. Gym (Soporte para 1, 2 o +2 sesiones por día)
        const gymReal = w.days.reduce((acc, d) => acc + (d.gym.sessions || 0), 0);
        const gymGoal = Math.max(1, g.gymSessions || 4);
        const gymPct = (gymReal / gymGoal) * 100;

        // 2. Running (Suma de s1, s2, s3... km)
        const runKmReal = w.days.reduce((acc, d) => {
          if (d.run.sessions <= 0) return acc;
          let dayKm = 0;
          if (d.run.sessions === 1) {
            dayKm = Number(d.run.s1?.km) || Number(d.run.km) || 0;
          } else {
            for (let sIdx = 1; sIdx <= d.run.sessions; sIdx++) {
              const sess = d.run[`s${sIdx}`];
              dayKm += Number(sess?.km) || 0;
            }
          }
          return acc + dayKm;
        }, 0);
        const runKmGoal = Math.max(1, g.runKm || 15);
        const runPct = (runKmReal / runKmGoal) * 100;

        // 3. Estudio
        const studyReal = w.studyRealHours.reduce((acc, h) => acc + (Number(h) || 0), 0);
        const studyGoal = Math.max(1, (w.studyHoursPlan || []).reduce((a, b) => a + Number(b), 0) || 15);
        const studyPct = (studyReal / studyGoal) * 100;

        // 4. Asistencia
        let attPresent = 0, attTotal = 0;
        w.days.forEach(d => {
          (d.attendance || []).forEach(c => {
            if (c.status !== 'holiday') {
              attTotal++;
              if (c.status === 'present') attPresent++;
            }
          });
        });
        const attPct = attTotal > 0 ? (attPresent / attTotal) * 100 : 100;

        // 5. Nutrición
        let nutriPoints = 0;
        w.days.forEach(d => {
          if (d.nutritionScore !== undefined && d.nutritionScore !== null) {
            nutriPoints += Number(d.nutritionScore) || 0;
          } else if (d.nutrition === 'success') {
            nutriPoints += 1;
          }
        });
        const nutriSuccess = Math.round(nutriPoints * 10) / 10;
        const nutriGoal = Math.max(1, g.nutri?.minDays || 6);
        const nutriPct = (nutriSuccess / nutriGoal) * 100;

        // 6. Finanzas
        const spent = (w.expenses || []).reduce((acc, e) => acc + (Number(e.amount) || 0), 0);
        const budget = Number(w.budgetLimit) || 60;
        let finPct = 100;
        if (budget > 0) {
          if (spent <= budget) {
            finPct = 100 + ((budget - spent) / budget) * 20; // Hasta 120% si ahorras
          } else {
            finPct = Math.max(0, 100 - ((spent - budget) / budget) * 100);
          }
        }

        // --- EVALUACIÓN DE HÁBITOS PERSONALIZADOS ACTIVOS ---
        const activeHabits = (state?.customHabits || []).filter(h => h.active !== false);
        const customHabitsPct = {};
        const customHabitsStats = {};
        const wHabitsData = w.customHabitsData || {};

        activeHabits.forEach(h => {
          if (h.isReminderOnly) return; // Hábitos configurados como solo recordatorio se omiten del Score y de las métricas
          const rawDays = wHabitsData[h.id] || [null, null, null, null, null, null, null];
          if (h.type === 'max_limit') {
            // Tipo A: Límite Máximo ("Menos es mejor"). Meta diaria y semanal
            const sum = rawDays.reduce((acc, v) => acc + (v !== null && !isNaN(v) ? Number(v) : 0), 0);
            const targetW = Number(h.targetWeekly) || (Number(h.targetDaily) * 7) || 7;
            const daysUnderLimit = rawDays.filter(v => v !== null && Number(v) <= (Number(h.targetDaily) || 1)).length;
            const pct = sum <= targetW ? 100 : Math.max(0, Math.round(100 - ((sum - targetW) / targetW) * 100));
            customHabitsPct[h.id] = pct;
            customHabitsStats[h.id] = { sum, target: targetW, isMet: sum <= targetW, daysUnderLimit, unit: h.unit || '' };
          } else if (h.type === 'min_accum') {
            // Tipo B: Meta Mínima Acumulativa ("Más es mejor")
            const sum = rawDays.reduce((acc, v) => acc + (v !== null && !isNaN(v) ? Number(v) : 0), 0);
            const targetW = Math.max(0.1, Number(h.targetWeekly) || 10);
            const pct = (sum / targetW) * 100;
            customHabitsPct[h.id] = pct;
            customHabitsStats[h.id] = { sum, target: targetW, isMet: pct >= 100, unit: h.unit || '' };
          } else if (h.type === 'binary_check') {
            // Tipo C: Check Diario (Sí/No)
            const count = rawDays.filter(v => v === true || v === 1 || v === 'true').length;
            const targetDays = Math.max(1, Number(h.targetWeeklyDays) || 7);
            const pct = (count / targetDays) * 100;
            customHabitsPct[h.id] = pct;
            customHabitsStats[h.id] = { count, targetDays, isMet: pct >= 100 };
          } else if (h.type === 'target_range') {
            // Tipo D: Diana Óptima (Rango: target ± margin)
            const center = Number(h.targetCenter) || 0;
            const margin = Number(h.targetMargin) || 0;
            const minAllowed = center - margin;
            const maxAllowed = center + margin;
            const validDays = rawDays.filter(v => v !== null && !isNaN(v) && Number(v) >= minAllowed && Number(v) <= maxAllowed).length;
            const targetDays = Math.max(1, Number(h.targetWeeklyDays) || 6);
            const pct = (validDays / targetDays) * 100;
            customHabitsPct[h.id] = pct;
            customHabitsStats[h.id] = { validDays, targetDays, isMet: pct >= 100, center, margin, unit: h.unit || '' };
          }
        });

        // Recálculo dinámico modular del Score (0-100) y de Bloques en Meta
        const evaluatedScores = [];
        let blocksMetCount = 0;

        if (enabled.gym) {
          evaluatedScores.push(Math.min(100, gymPct));
          if (gymPct >= 100) blocksMetCount++;
        }
        if (enabled.run) {
          evaluatedScores.push(Math.min(100, runPct));
          if (runPct >= 100) blocksMetCount++;
        }
        if (enabled.study) {
          evaluatedScores.push(Math.min(100, studyPct));
          if (studyPct >= 100) blocksMetCount++;
        }
        if (enabled.academic) {
          const reqAtt = w.goals.academic?.attMinPercent || 85;
          evaluatedScores.push(Math.min(100, attPct));
          if (attPct >= reqAtt) blocksMetCount++;
        }
        if (enabled.nutri) {
          evaluatedScores.push(Math.min(100, nutriPct));
          if (nutriPct >= 100) blocksMetCount++;
        }
        if (enabled.budget) {
          evaluatedScores.push(Math.min(100, finPct));
          if (finPct >= 100) blocksMetCount++;
        }

        activeHabits.forEach(h => {
          const p = customHabitsPct[h.id] || 0;
          evaluatedScores.push(Math.min(100, p));
          if (p >= 100) blocksMetCount++;
        });

        const totalActiveBlocks = evaluatedScores.length;
        const score = totalActiveBlocks > 0
          ? Math.round(evaluatedScores.reduce((a, b) => a + b, 0) / totalActiveBlocks)
          : 100;

        return {
          score,
          totalActiveBlocks,
          blocksMetCount,
          gymReal, gymGoal, gymPct,
          runKmReal, runKmGoal, runPct,
          studyReal, studyGoal, studyPct,
          attPresent, attTotal, attPct,
          nutriSuccess, nutriGoal, nutriPct,
          spent, budget, finPct,
          customHabitsPct,
          customHabitsStats
        };
      }

      function calculateStreaks(currentWkNum) {
        const streaks = { gym: 0, run: 0, study: 0, att: 0, nutri: 0, fin: 0 };
        for (let w = currentWkNum - 1; w >= 1; w--) {
          const wk = state.weeks[w];
          if (!wk) break;
          const m = calculateWeekMetrics(wk);
          if (streaks.gym === (currentWkNum - 1 - w) && m.gymPct >= 100) streaks.gym++;
          if (streaks.run === (currentWkNum - 1 - w) && m.runPct >= 100) streaks.run++;
          if (streaks.study === (currentWkNum - 1 - w) && m.studyPct >= 100) streaks.study++;
          if (streaks.att === (currentWkNum - 1 - w) && m.attPct >= (wk.goals.academic?.attMinPercent || 85)) streaks.att++;
          if (streaks.nutri === (currentWkNum - 1 - w) && m.nutriPct >= 100) streaks.nutri++;
          if (streaks.fin === (currentWkNum - 1 - w) && m.finPct >= 100) streaks.fin++;
        }
        return streaks;
      }

      function evalNutritionStatus(kcal, targetKcal, phase, customMargin) {
        const p = (phase || 'volumen').toLowerCase();
        const numKcal = (kcal != null && kcal !== '') ? Number(kcal) : null;
        const target = Number(targetKcal) || 2800;
        const margin = Number(customMargin) || 150;

        if (numKcal === null || isNaN(numKcal) || numKcal <= 0) {
          return {
            status: 'pending',
            score: 0,
            label: 'Sin registrar',
            badgeClass: 'subpanel-bg border text-slate-400',
            diff: 0
          };
        }

        const diff = Math.round(numKcal - target);
        const signDiff = diff > 0 ? `+${diff}` : `${diff}`;

        if (p === 'volumen') {
          // EN VOLUMEN:
          // Si te quedas corto (diff < -margin): vale cero (fail), no construyes músculo.
          if (diff < -margin) {
            return {
              status: 'fail',
              score: 0,
              label: `📉 Te quedas corto (${signDiff} kcal)`,
              badgeClass: 'bg-theme-accent-soft text-theme-accent border border-theme-accent font-bold',
              diff
            };
          }
          // En objetivo (dentro del margen de superávit):
          if (diff <= margin) {
            return {
              status: 'success',
              score: 1.0,
              label: `En objetivo (${signDiff} kcal)`,
              badgeClass: 'bg-theme-soft text-theme-main border border-theme font-bold',
              diff
            };
          }
          // Si te pasas del superávit objetivo: vale 1 (o 0.8 si es muy alto), pero avisa que estás fuera del objetivo:
          if (diff <= margin * 2.5) {
            return {
              status: 'success',
              score: 1.0,
              label: `Superávit alto (${signDiff} kcal)`,
              badgeClass: 'bg-theme-accent-soft text-theme-accent border border-theme-accent font-bold',
              diff
            };
          } else {
            return {
              status: 'success',
              score: 0.8,
              label: `Exceso calórico (${signDiff} kcal)`,
              badgeClass: 'bg-theme-accent-soft text-theme-accent border border-theme-accent font-bold',
              diff
            };
          }
        } else if (p === 'definicion') {
          // EN DEFINICIÓN:
          // Si te pasas por arriba (diff > margin): rompes el déficit, vale cero (fail).
          if (diff > margin) {
            return {
              status: 'fail',
              score: 0,
              label: `Supera el límite (${signDiff} kcal)`,
              badgeClass: 'bg-theme-accent-soft text-theme-accent border border-theme-accent font-bold',
              diff
            };
          }
          // En objetivo (dentro del déficit fijado):
          if (diff >= -margin) {
            return {
              status: 'success',
              score: 1.0,
              label: `En objetivo (${signDiff} kcal)`,
              badgeClass: 'bg-theme-soft text-theme-main border border-theme font-bold',
              diff
            };
          }
          // Si el déficit es más profundo (comes menos): sigue siendo déficit válido (vale 1 o 0.8 si es extremo), avisa:
          if (diff >= -margin * 2.5) {
            return {
              status: 'success',
              score: 1.0,
              label: `Déficit alto (${signDiff} kcal)`,
              badgeClass: 'bg-theme-accent-soft text-theme-accent border border-theme-accent font-bold',
              diff
            };
          } else {
            return {
              status: 'success',
              score: 0.8,
              label: `Déficit agresivo (${signDiff} kcal)`,
              badgeClass: 'bg-theme-accent-soft text-theme-accent border border-theme-accent font-bold',
              diff
            };
          }
        } else {
          // MANTENIMIENTO:
          if (Math.abs(diff) <= margin) {
            return {
              status: 'success',
              score: 1.0,
              label: `En objetivo (${signDiff} kcal)`,
              badgeClass: 'bg-theme-soft text-theme-main border border-theme font-bold',
              diff
            };
          } else if (Math.abs(diff) <= margin * 2) {
            return {
              status: 'success',
              score: 0.8,
              label: diff > 0 ? `Ligero exceso (${signDiff} kcal)` : `Ligero déficit (${signDiff} kcal)`,
              badgeClass: 'bg-theme-accent-soft text-theme-accent border border-theme-accent font-bold',
              diff
            };
          } else {
            return {
              status: 'fail',
              score: 0,
              label: diff > 0 ? `Te has pasado (${signDiff} kcal)` : `Te quedas corto (${signDiff} kcal)`,
              badgeClass: 'bg-theme-accent-soft text-theme-accent border border-theme-accent font-bold',
              diff
            };
          }
        }
      }

      function getScoreColor(pct) {
        const palKey = ACCENT_PALETTES[state?.themePalette || 'blue_red'] ? state.themePalette : 'blue_red';
        const pal = ACCENT_PALETTES[palKey] || ACCENT_PALETTES.blue_red;
        const isDark = (typeof state !== 'undefined' && state?.theme) ? (state.theme === 'dark') : document.documentElement.classList.contains('dark');
        const colors = isDark ? pal.dark : pal.light;
        if (pct >= 120) return colors.accent;
        if (pct >= 100) return colors.theme700;
        return colors.theme500;
      }

      function renderProgressCell(pct, realStr, streakSem) {
        const streakPart = (streakSem !== null && streakSem !== undefined && Number(streakSem) > 0) ? ` • ${streakSem}s` : '';
        if (pct >= 120) {
          return `
            <div class="inline-flex flex-col items-center justify-center gap-0.5 px-1.5 py-1 rounded-xl bg-theme-accent-soft border border-theme-accent/60 shadow-2xs text-center w-full mx-auto">
              <span class="text-[7.5px] font-black tracking-wider uppercase px-1.5 py-0.2 rounded-sm bg-theme-accent text-white leading-tight flex items-center justify-center gap-0.5">
                <svg class="w-2.5 h-2.5 fill-current" viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                <span>RÉCORD</span>
              </span>
              <span class="font-black font-mono text-[12px] text-theme-accent leading-tight">${realStr}</span>
              <div class="text-[8px] text-theme-accent font-mono font-bold opacity-90 leading-tight">${Math.round(pct)}%${streakPart}</div>
            </div>
          `;
        }
        if (pct >= 100) {
          return `
            <div class="inline-flex flex-col items-center justify-center gap-0.5 px-1.5 py-1 rounded-xl bg-theme-soft border border-theme shadow-2xs text-center w-full mx-auto">
              <span class="text-[7.5px] font-black tracking-wider uppercase px-1.5 py-0.2 rounded-sm bg-theme-main text-white leading-tight flex items-center justify-center gap-0.5">
                <svg class="w-2.5 h-2.5 fill-none stroke-current stroke-3" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                <span>META</span>
              </span>
              <span class="font-black font-mono text-[12px] text-theme-main leading-tight">${realStr}</span>
              <div class="text-[8px] text-theme-main font-mono font-bold opacity-90 leading-tight">${Math.round(pct)}%${streakPart}</div>
            </div>
          `;
        }
        return `
          <div class="text-center space-y-0.5 py-0.5">
            <div class="font-extrabold font-mono text-[11.5px] text-theme-main leading-tight">${realStr}</div>
            <div class="text-[8.5px] text-stone-500 dark:text-slate-400 font-mono font-medium leading-tight">${Math.round(pct)}%${streakPart}</div>
          </div>
        `;
      }

      // Formateo de horas a h y min (ej: 3.5h -> 3h 30m, 0.5h -> 30m, 3.0h -> 3h)
      function formatHoursToHMin(hrs, showZeroAsMin = false) {
        const val = Number(hrs) || 0;
        const totalMinutes = Math.round(val * 60);
        if (totalMinutes === 0) return showZeroAsMin ? '0m' : '0h';
        const h = Math.floor(totalMinutes / 60);
        const m = totalMinutes % 60;
        if (h > 0 && m > 0) return `${h}h ${m}m`;
        if (h > 0) return `${h}h`;
        return `${m}m`;
      }
      // GRÁFICOS SVG
      function renderSvgRing(pct, real, goal) {
        const radius = 18;
        const circ = 2 * Math.PI * radius;
        const clampedPct = Math.min(150, Math.max(0, pct));
        const offset = circ - (Math.min(100, clampedPct) / 100) * circ;
        const color = getScoreColor(pct);

        return `
          <svg class="w-11 h-11 -rotate-90 transform" viewBox="0 0 44 44">
            <circle cx="22" cy="22" r="${radius}" fill="none" stroke="${state.theme === 'dark' ? '#1e293b' : '#e2d9cd'}" stroke-width="3.5" />
            <circle cx="22" cy="22" r="${radius}" fill="none" stroke="${color}" stroke-width="3.5" stroke-dasharray="${circ}" stroke-dashoffset="${offset}" stroke-linecap="round" class="transition-all duration-500" />
          </svg>
          <div class="absolute inset-0 flex flex-col items-center justify-center text-center">
            <span class="text-[10px] font-black font-mono" style="color: ${color}">${Math.round(pct)}%</span>
          </div>
        `;
      }

      function renderSvgTrack(currentKm, goalKm) {
        const numKm = Number(currentKm) || 0;
        const targetKm = Number(goalKm) || 15;
        const pct = targetKm > 0 ? Math.min(100, Math.max(0, (numKm / targetKm) * 100)) : 0;
        const color = getScoreColor(pct);

        return `
          <svg viewBox="0 0 240 70" class="w-full max-w-sm h-14">
            <!-- Pista inactiva base -->
            <rect x="15" y="10" width="210" height="50" rx="25" fill="none" stroke="${state.theme === 'dark' ? '#1e293b' : '#ded5c7'}" stroke-width="8" />
            <!-- Progreso recorrido en la pista (solo si hay km registrados) -->
            ${pct > 0 ? `
              <rect x="15" y="10" width="210" height="50" rx="25" fill="none" stroke="${color}" stroke-width="8"
                pathLength="100" stroke-dasharray="100" stroke-dashoffset="${100 - pct}"
                stroke-linecap="round" class="transition-all duration-700" />
            ` : ''}
            <text x="120" y="38" text-anchor="middle" font-size="12" font-weight="800" fill="currentColor" font-family="JetBrains Mono">${numKm.toFixed(1)} / ${targetKm.toFixed(1)} km</text>
          </svg>
        `;
      }

      function renderTriSystemRadar(seriesCount, rodajeCount, tiradaCount, totalKm) {
        const vScore = Math.min(100, seriesCount * 45); // VO2 Max
        const aScore = Math.min(100, (rodajeCount * 30) + (totalKm * 2)); // Aeróbica
        const rScore = Math.min(100, (tiradaCount * 50) + (totalKm * 2.5)); // Fondo / Resistencia

        const cx = 150, cy = 76, r = 44;
        const rad = (deg) => (deg - 90) * (Math.PI / 180);

        const m1x = cx + r * Math.cos(rad(0));
        const m1y = cy + r * Math.sin(rad(0));
        const m2x = cx + r * Math.cos(rad(120));
        const m2y = cy + r * Math.sin(rad(120));
        const m3x = cx + r * Math.cos(rad(240));
        const m3y = cy + r * Math.sin(rad(240));

        const p1x = cx + (r * (vScore / 100)) * Math.cos(rad(0));
        const p1y = cy + (r * (vScore / 100)) * Math.sin(rad(0));
        const p2x = cx + (r * (aScore / 100)) * Math.cos(rad(120));
        const p2y = cy + (r * (aScore / 100)) * Math.sin(rad(120));
        const p3x = cx + (r * (rScore / 100)) * Math.cos(rad(240));
        const p3y = cy + (r * (rScore / 100)) * Math.sin(rad(240));

        return `
          <svg viewBox="0 0 300 160" class="w-full max-w-[300px] overflow-visible">
            <polygon points="${m1x},${m1y} ${m2x},${m2y} ${m3x},${m3y}" fill="none" stroke="${state.theme === 'dark' ? '#334155' : '#c8beaf'}" stroke-width="1.5" stroke-dasharray="2 2" />
            <line x1="${cx}" y1="${cy}" x2="${m1x}" y2="${m1y}" stroke="${state.theme === 'dark' ? '#1e293b' : '#ded5c7'}" />
            <line x1="${cx}" y1="${cy}" x2="${m2x}" y2="${m2y}" stroke="${state.theme === 'dark' ? '#1e293b' : '#ded5c7'}" />
            <line x1="${cx}" y1="${cy}" x2="${m3x}" y2="${m3y}" stroke="${state.theme === 'dark' ? '#1e293b' : '#ded5c7'}" />

            <polygon points="${p1x},${p1y} ${p2x},${p2y} ${p3x},${p3y}" fill="var(--theme-100)" stroke="var(--theme-700)" stroke-width="2.5" />
            <circle cx="${p1x}" cy="${p1y}" r="3.5" fill="var(--theme-accent)" />
            <circle cx="${p2x}" cy="${p2y}" r="3.5" fill="var(--theme-700)" />
            <circle cx="${p3x}" cy="${p3y}" r="3.5" fill="var(--theme-500)" />

            <text x="${m1x}" y="${m1y - 6}" text-anchor="middle" font-size="9" font-weight="800" fill="var(--theme-accent)">VO2 Max (${Math.round(vScore)}%)</text>
            <text x="${m2x}" y="${m2y + 13}" text-anchor="middle" font-size="9" font-weight="800" fill="var(--theme-700)">Aeróbico (${Math.round(aScore)}%)</text>
            <text x="${m3x}" y="${m3y + 13}" text-anchor="middle" font-size="9" font-weight="800" fill="var(--theme-500)">Fondo (${Math.round(rScore)}%)</text>
          </svg>
        `;
      }

      // MAPA MUSCULAR ANATÓMICO ULTRA-DETALLADO (Frontal y Posterior) CON INSPECTOR ACTIVO
      function getMuscleStimulusHits() {
        const scope = state.ui.labScope;
        const weeksToScan = scope === 'week' ? [getActiveWeek()] : Object.values(state.weeks);
        const hits = {
          chest: 0, delts: 0, biceps: 0, triceps: 0, forearms: 0,
          abs: 0, obliques: 0, lats: 0, traps: 0, lower_back: 0,
          glutes: 0, quads: 0, hams: 0, calves: 0
        };

        const logs = {
          chest: [], delts: [], biceps: [], triceps: [], forearms: [],
          abs: [], obliques: [], lats: [], traps: [], lower_back: [],
          glutes: [], quads: [], hams: [], calves: []
        };

        weeksToScan.forEach(w => {
          if (!w) return;
          w.days.forEach((d, dIdx) => {
            const addGymType = (sessionObj, sessionLabel) => {
              if (!sessionObj) return;
              const t = sessionObj.type || '';
              const customText = (sessionObj.custom || '').trim();
              const type = t.toLowerCase();
              const logEntry = (mId, amt, name) => {
                hits[mId] += amt;
                logs[mId].push(`${DAY_FULL[dIdx]}: Gimnasio (${name}) ➔ +${amt}`);
              };

              if (type.includes('pierna')) { logEntry('quads', 1, 'Pierna'); logEntry('hams', 1, 'Pierna'); logEntry('glutes', 1, 'Pierna'); logEntry('calves', 1, 'Pierna'); }
              else if (type.includes('empuje')) { logEntry('chest', 1, 'Empuje'); logEntry('delts', 1, 'Empuje'); logEntry('triceps', 1, 'Empuje'); }
              else if (type.includes('tirón')) { logEntry('lats', 1, 'Tirón'); logEntry('traps', 1, 'Tirón'); logEntry('biceps', 1, 'Tirón'); logEntry('forearms', 0.5, 'Tirón'); }
              else if (type.includes('torso')) { logEntry('chest', 1, 'Torso'); logEntry('lats', 1, 'Torso'); logEntry('delts', 1, 'Torso'); logEntry('biceps', 0.5, 'Torso'); logEntry('triceps', 0.5, 'Torso'); }
              else if (type.includes('fullbody')) { Object.keys(hits).forEach(k => logEntry(k, 1, 'Fullbody')); }
              else if (type.includes('core') || type.includes('movilidad')) { logEntry('abs', 1, 'Core'); logEntry('obliques', 1, 'Core'); logEntry('lower_back', 0.5, 'Core'); }
              else if (type.includes('personalizado') || type.includes('otro') || (sessionObj.muscles && sessionObj.muscles.length > 0) || customText) {
                const assigned = (Array.isArray(sessionObj.muscles) && sessionObj.muscles.length > 0)
                  ? sessionObj.muscles
                  : ((customText && state.customWorkoutMuscles[customText.toLowerCase()])
                    || (state.customWorkoutMuscles[type] || []));
                const workoutName = customText || 'Personalizado';
                assigned.forEach(mId => { if (hits[mId] !== undefined) logEntry(mId, 1, workoutName); });
              }
            };

            if (d.gym.sessions >= 1) addGymType(d.gym.s1, '1ª Sesión');
            if (d.gym.sessions >= 2) addGymType(d.gym.s2, '2ª Sesión');

            if (d.run.sessions > 0) {
              hits.calves += 0.8; logs.calves.push(`${DAY_FULL[dIdx]}: Running (${d.run.km || 0}k) ➔ +0.8`);
              hits.quads += 0.5; logs.quads.push(`${DAY_FULL[dIdx]}: Running (${d.run.km || 0}k) ➔ +0.5`);
              hits.hams += 0.5; logs.hams.push(`${DAY_FULL[dIdx]}: Running (${d.run.km || 0}k) ➔ +0.5`);
            }
          });
        });

        // Sumar ajustes manuales del usuario
        Object.entries(state.manualMuscleStimulus || {}).forEach(([mId, val]) => {
          if (hits[mId] !== undefined) {
            hits[mId] = Math.max(0, hits[mId] + val);
            if (val !== 0) logs[mId].push(`Ajuste manual del usuario: ${val > 0 ? `+${val}` : val}`);
          }
        });

        return { hits, logs };
      }

      function renderSvgAnatomy() {
        const { hits } = getMuscleStimulusHits();

        // Colores del Mapa Muscular conectados dinámicamente a la Paleta Activa
        const getColor = (val) => {
          if (val >= 3) return 'var(--theme-accent)'; // 3+ sesiones: Acento de contraste
          if (val >= 2) return 'var(--theme-700)';    // 2 sesiones: Tono profundo dominante
          if (val >= 1) return 'var(--theme-500)';    // 1 sesión: Tono medio
          return state.theme === 'dark' ? 'rgba(255, 255, 255, 0.12)' : '#D6CFC2'; // Inactivo: Contraste optimizado
        };

        const strokeColor = state.theme === 'dark' ? 'rgba(255, 255, 255, 0.28)' : '#6B6358';
        const bodyOutlineColor = state.theme === 'dark' ? '#334155' : '#A89E90';
        const bodyBackdropFill = state.theme === 'dark' ? 'rgba(30, 41, 59, 0.4)' : 'rgba(214, 204, 190, 0.45)';
        const headFill = state.theme === 'dark' ? '#334155' : '#B8ACA0';
        const sel = state.ui.selectedMuscle;
        const pAttr = (mId) => `data-muscle="${mId}" onclick="app.inspectMuscle('${mId}')" onmouseenter="app.hoverMuscle('${mId}')" onmouseleave="app.hoverMuscle(null)" class="muscle-part ${sel === mId ? 'muscle-selected' : ''}" fill="${getColor(hits[mId])}" stroke="${strokeColor}" stroke-width="1.2"`;

        // Siluetas Anatómicas con auténtico OFFSET uniforme y armónico (~3.5px de margen continuo que sigue fielmente el perímetro muscular)
        const bodySilhouetteFront = `<path d="M60 4 C48 4 48 14 50 22 C49 25 43 31 38 33 C31 34 26 40 26 48 C25 56 27 62 25 70 C23 78 20 87 22 98 C24 107 27 109 30 109 C32 107 34 97 36 86 C37 77 39 67 40 60 C41 54 44 50 47 52 C46 60 45 72 47 84 C44 88 38 97 38 112 C38 126 39 140 40 154 C40 166 38 178 39 196 C40 206 44 209 48 209 C52 209 54 204 54 194 C55 178 57 150 58 138 C58 120 59 104 60 95 C61 104 62 120 62 138 C63 150 65 178 66 194 C66 204 68 209 72 209 C76 209 80 206 81 196 C82 178 80 166 80 154 C81 140 82 126 82 112 C82 97 76 88 73 84 C75 72 74 60 73 52 C76 50 79 54 80 60 C81 67 83 77 84 86 C86 97 88 107 90 109 C93 109 96 107 98 98 C100 87 97 78 95 70 C93 62 95 56 94 48 C94 40 89 34 82 33 C77 31 71 25 70 22 C72 14 72 4 60 4 Z" fill="${bodyBackdropFill}" stroke="${bodyOutlineColor}" stroke-width="1.2" stroke-dasharray="3 2" />`;

        const bodySilhouetteBack = `<path d="M60 4 C48 4 48 14 50 22 C49 25 43 31 38 33 C31 34 26 40 26 48 C25 56 27 62 25 70 C23 78 20 87 22 98 C24 107 27 109 30 109 C32 107 34 97 36 86 C37 77 39 67 40 60 C41 54 44 50 47 52 C46 60 45 72 47 84 C44 88 38 97 38 112 C38 126 39 140 40 154 C40 166 38 178 39 196 C40 206 44 209 48 209 C52 209 54 204 54 194 C55 178 57 150 58 138 C58 120 59 104 60 95 C61 104 62 120 62 138 C63 150 65 178 66 194 C66 204 68 209 72 209 C76 209 80 206 81 196 C82 178 80 166 80 154 C81 140 82 126 82 112 C82 97 76 88 73 84 C75 72 74 60 73 52 C76 50 79 54 80 60 C81 67 83 77 84 86 C86 97 88 107 90 109 C93 109 96 107 98 98 C100 87 97 78 95 70 C93 62 95 56 94 48 C94 40 89 34 82 33 C77 31 71 25 70 22 C72 14 72 4 60 4 Z" fill="${bodyBackdropFill}" stroke="${bodyOutlineColor}" stroke-width="1.2" stroke-dasharray="3 2" />`;

        // Silueta Frontal Anatómica
        const frontSvg = `
          <div class="p-3 rounded-xl bg-stone-50/90 dark:bg-slate-900/90 border border-stone-300 dark:border-slate-800 shadow-sm space-y-2 text-center">
            <div class="flex items-center justify-between border-b border-stone-200/90 dark:border-slate-800/80 pb-1">
              <span class="text-[10px] uppercase font-bold text-stone-600 dark:text-slate-300 font-mono tracking-wider">Vista Frontal</span>
              <span class="text-[9px] font-mono text-stone-400 dark:text-slate-500 font-bold">ANT-01</span>
            </div>
            <svg viewBox="0 0 120 250" class="w-full max-h-72 mx-auto">
              ${bodySilhouetteFront}
              <ellipse cx="60" cy="18" rx="10" ry="12" fill="${headFill}" stroke="${strokeColor}" stroke-width="1.2" />
              <!-- Trapecios Frontales / Cuello Esculpido -->
              <path ${pAttr('traps')} d="M54 26 C57 26 63 26 66 26 C69 31 73 34 75 37 L45 37 C47 34 51 31 54 26 Z" />
              <!-- Hombros / Deltoides Anatómicos Ajustados al Torso y Clavícula -->
              <path ${pAttr('delts')} d="M45 37 C39 37 34 42 32 48 C31 53 33 57 36 59 C38 55 41 49 43 43 C44 40 45 38 45 37 Z" />
              <path ${pAttr('delts')} d="M75 37 C81 37 86 42 88 48 C89 53 87 57 84 59 C82 55 79 49 77 43 C76 40 75 38 75 37 Z" />
              <!-- Pectorales (Naturalmente contenidos en el torso) -->
              <path ${pAttr('chest')} d="M45 39 L58 39 L57 56 C51 56 46 54 44 48 C43.5 44 44 41 45 39 Z" />
              <path ${pAttr('chest')} d="M75 39 L62 39 L63 56 C69 56 74 54 76 48 C76.5 44 76 41 75 39 Z" />
              <!-- Bíceps -->
              <path ${pAttr('biceps')} d="M31 56 C28 62 27 70 30 76 C33 76 35 70 36 62 Z" />
              <path ${pAttr('biceps')} d="M89 56 C92 62 93 70 90 76 C87 76 85 70 84 62 Z" />
              <!-- Antebrazos -->
              <path ${pAttr('forearms')} d="M29 78 C25 86 24 97 27 106 C29 106 32 98 33 88 Z" />
              <path ${pAttr('forearms')} d="M91 78 C95 86 96 97 93 106 C91 106 88 98 87 88 Z" />
              <!-- Abdomen -->
              <path ${pAttr('abs')} d="M50 58 L58 58 L58 66 L50 66 Z M62 58 L70 58 L70 66 L62 66 Z" />
              <path ${pAttr('abs')} d="M50 68 L58 68 L58 77 L50 77 Z M62 68 L70 68 L70 77 L62 77 Z" />
              <path ${pAttr('abs')} d="M51 79 L69 79 L65 92 L55 92 Z" />
              <!-- Oblicuos -->
              <path ${pAttr('obliques')} d="M43 56 C45 66 45 78 48 88 L44 86 C40 76 40 65 43 56 Z" />
              <path ${pAttr('obliques')} d="M77 56 C75 66 75 78 72 88 L76 86 C80 76 80 65 77 56 Z" />
              <!-- Cuádriceps y Arco Entrepierna Anatómico -->
              <path ${pAttr('quads')} d="M44 95 C40 108 39 125 43 140 C48 140 50 130 50 115 C50 102 48 96 44 95 Z" />
              <path ${pAttr('quads')} d="M51 97 C53 108 53 124 50 138 C55 138 56 122 55 106 C55 101 53 97 51 97 Z" />
              <path ${pAttr('quads')} d="M76 95 C80 108 81 125 77 140 C72 140 70 130 70 115 C70 102 72 96 76 95 Z" />
              <path ${pAttr('quads')} d="M69 97 C67 108 67 124 70 138 C65 138 64 122 65 106 C65 101 67 97 69 97 Z" />
              <!-- Gemelos / Tibial -->
              <path ${pAttr('calves')} d="M43 150 C40 162 41 180 44 195 C47 195 49 182 48 165 Z" />
              <path ${pAttr('calves')} d="M77 150 C80 162 79 180 76 195 C73 195 71 182 72 165 Z" />
            </svg>
          </div>
        `;

        // Silueta Posterior Anatómica
        const backSvg = `
          <div class="p-3 rounded-xl bg-stone-50/90 dark:bg-slate-900/90 border border-stone-300 dark:border-slate-800 shadow-sm space-y-2 text-center">
            <div class="flex items-center justify-between border-b border-stone-200/90 dark:border-slate-800/80 pb-1">
              <span class="text-[10px] uppercase font-bold text-stone-600 dark:text-slate-300 font-mono tracking-wider">Vista Posterior</span>
              <span class="text-[9px] font-mono text-stone-400 dark:text-slate-500 font-bold">POST-02</span>
            </div>
            <svg viewBox="0 0 120 250" class="w-full max-h-72 mx-auto">
              ${bodySilhouetteBack}
              <ellipse cx="60" cy="18" rx="10" ry="12" fill="${headFill}" stroke="${strokeColor}" stroke-width="1.2" />
              <!-- Trapecio Cervical y Diamante Suave (Inserción C7 a T12) -->
              <path ${pAttr('traps')} d="M54 26 C57 26 63 26 66 26 C69 30 72 34 74 38 L60 54 L46 38 C48 34 51 30 54 26 Z" />
              <!-- Deltoides Posterior Anatómico Ajustado a Escápula y Trapecio -->
              <path ${pAttr('delts')} d="M46 38 C39 38 34 43 32 48 C31 53 34 57 37 57 C39 53 42 47 45 41 C45.5 39.5 45.8 38.5 46 38 Z" />
              <path ${pAttr('delts')} d="M74 38 C81 38 86 43 88 48 C89 53 86 57 83 57 C81 53 78 47 75 41 C74.5 39.5 74.2 38.5 74 38 Z" />
              <!-- Tríceps -->
              <path ${pAttr('triceps')} d="M30 55 C27 63 26 72 29 78 C32 78 34 72 35 63 Z" />
              <path ${pAttr('triceps')} d="M90 55 C93 63 94 72 91 78 C88 78 86 72 85 63 Z" />
              <!-- Antebrazos (Extensores de muñeca posteriores) -->
              <path ${pAttr('forearms')} d="M29 78 C25 86 24 97 27 106 C29 106 32 98 33 88 Z" />
              <path ${pAttr('forearms')} d="M91 78 C95 86 96 97 93 106 C91 106 88 98 87 88 Z" />
              <!-- Dorsal Ancho Orgánico en V (Fluye desde inserción escapular axilar L60 54) -->
              <path ${pAttr('lats')} d="M45 42 L60 54 L57 74 C50 72 46 66 44 54 C43.5 49 44.2 45 45 42 Z" />
              <path ${pAttr('lats')} d="M75 42 L60 54 L63 74 C70 72 74 66 76 54 C76.5 49 75.8 45 75 42 Z" />
              <!-- Lumbar -->
              <path ${pAttr('lower_back')} d="M50 75 L70 75 L67 88 L53 88 Z" />
              <!-- Glúteos y Curvatura de Pierna Superior -->
              <path ${pAttr('glutes')} d="M43 90 C43 103 48 112 58 112 L59 90 Z" />
              <path ${pAttr('glutes')} d="M77 90 C77 103 72 112 62 112 L61 90 Z" />
              <!-- Isquiotibiales con Arco Interior Fluido -->
              <path ${pAttr('hams')} d="M43 115 C41 127 41 140 45 148 C49 148 53 135 54 120 C54 116 53 115 52 115 Z" />
              <path ${pAttr('hams')} d="M77 115 C79 127 79 140 75 148 C71 148 67 135 66 120 C66 116 67 115 68 115 Z" />
              <!-- Gemelos Posteriores -->
              <path ${pAttr('calves')} d="M42 152 C39 164 41 178 45 190 C49 190 51 175 49 160 Z" />
              <path ${pAttr('calves')} d="M78 152 C81 164 79 178 75 190 C71 190 69 175 71 160 Z" />
            </svg>
          </div>
        `;

        return frontSvg + backSvg;
      }

      function renderEvolutionLineChart(metric) {
        const weeks = Object.values(state.weeks).sort((a, b) => a.weekNum - b.weekNum);
        if (weeks.length === 0) return `<span class="text-xs text-slate-400">Sin datos históricos.</span>`;

        const curW = weeks[weeks.length - 1] || weeks[0];
        let targetVal = 100;
        let isHabitMetric = false;
        let customHabitObj = null;

        if (metric.startsWith('habit_')) {
          isHabitMetric = true;
          const hId = metric.replace('habit_', '');
          customHabitObj = (state.customHabits || []).find(h => h.id === hId);
          if (customHabitObj) {
            if (customHabitObj.type === 'max_limit') targetVal = Number(customHabitObj.targetDaily) || 1;
            else if (customHabitObj.type === 'min_accum') targetVal = Number(customHabitObj.targetWeekly) || 10;
            else if (customHabitObj.type === 'binary_check') targetVal = Number(customHabitObj.targetWeeklyDays) || 7;
            else if (customHabitObj.type === 'target_range') targetVal = Number(customHabitObj.targetCenter) || 8;
          }
        } else if (metric === 'score') targetVal = 85;
        else if (metric === 'study') targetVal = (curW.studyHoursPlan || []).reduce((a, b) => a + Number(b), 0) || curW.goals?.studyHours || 15;
        else if (metric === 'km') targetVal = curW.goals?.runKm || 15;
        else if (metric === 'spend') targetVal = curW.budgetLimit || 60;

        const dataPoints = weeks.map(w => {
          const m = calculateWeekMetrics(w);
          if (isHabitMetric && customHabitObj) {
            const hId = customHabitObj.id;
            const hData = (w.customHabitsData && w.customHabitsData[hId]) || [];
            if (customHabitObj.type === 'max_limit') {
              const nums = hData.filter(v => v !== null && !isNaN(v)).map(Number);
              return nums.length ? (nums.reduce((a, b) => a + b, 0) / nums.length) : 0;
            } else if (customHabitObj.type === 'min_accum') {
              return hData.reduce((acc, v) => acc + (Number(v) || 0), 0);
            } else if (customHabitObj.type === 'binary_check') {
              return hData.filter(Boolean).length;
            } else if (customHabitObj.type === 'target_range') {
              const c = Number(customHabitObj.targetCenter) || 0;
              const mg = Number(customHabitObj.targetMargin) || 0;
              return hData.filter(v => v !== null && !isNaN(v) && Number(v) >= (c - mg) && Number(v) <= (c + mg)).length;
            }
          }
          if (metric === 'score') return m.score;
          if (metric === 'study') return m.studyReal;
          if (metric === 'km') return m.runKmReal;
          if (metric === 'spend') return m.spent;
          return m.score;
        });

        const width = 600, height = 150, pad = 25;
        const maxVal = Math.max(...dataPoints, targetVal, metric === 'score' ? 100 : 5);
        const minVal = 0;

        const targetY = height - pad - ((targetVal - minVal) / (maxVal - minVal || 1)) * (height - pad * 2);

        const isSingleWeek = dataPoints.length === 1;
        const points = dataPoints.map((val, idx) => {
          // Evaluar si cumple meta según tipo de métrica
          let isMet = false;
          if (metric === 'spend') {
            isMet = val <= targetVal; // En gasto, menos o igual es éxito
          } else if (isHabitMetric && customHabitObj && customHabitObj.type === 'max_limit') {
            isMet = val <= targetVal; // En límites de tiempo/pantalla, menos o igual es éxito
          } else {
            isMet = val >= targetVal; // En estudio, km, score y metas acumulativas, llegar o superar es éxito
          }

          return {
            x: isSingleWeek ? (width / 2) : pad + (idx / Math.max(1, dataPoints.length - 1)) * (width - pad * 2),
            y: height - pad - ((val - minVal) / (maxVal - minVal || 1)) * (height - pad * 2),
            val,
            isMet,
            label: `S${weeks[idx].weekNum}`
          };
        });

        const isDark = (typeof state !== 'undefined' && state?.theme) ? (state.theme === 'dark') : document.documentElement.classList.contains('dark');
        const palKey = ACCENT_PALETTES[state?.themePalette || 'blue_red'] ? state.themePalette : 'blue_red';
        const pal = ACCENT_PALETTES[palKey] || ACCENT_PALETTES.blue_red;
        const colors = isDark ? pal.dark : pal.light;

        const textColor = isDark ? '#F1F5F9' : '#1C1917';
        const textMuted = isDark ? '#94A3B8' : '#78716C';
        const baseGridColor = isDark ? 'rgba(148, 163, 184, 0.2)' : 'rgba(120, 113, 108, 0.25)';
        const successPointColor = colors.theme700 || 'var(--theme-700, #1D4ED8)';
        const failPointColor = colors.accent || 'var(--theme-accent, #D93829)';
        const targetLineColor = isDark ? '#F59E0B' : '#D97706'; // Ambar / Dorado nítido para la meta de referencia

        // Trazado de segmentos coloreados: cada tramo hacia un punto refleja el estado de la semana destino
        let segmentsHtml = '';
        if (!isSingleWeek) {
          for (let i = 0; i < points.length - 1; i++) {
            const p1 = points[i];
            const p2 = points[i + 1];
            // Si la semana de llegada no cumplió meta, la línea hacia ella se dibuja en color de aviso (rojo/acento)
            const segColor = p2.isMet ? successPointColor : failPointColor;
            const isDashed = !p2.isMet;
            segmentsHtml += `
              <line x1="${p1.x}" y1="${p1.y}" x2="${p2.x}" y2="${p2.y}" stroke="${segColor}" stroke-width="3" stroke-linecap="round" ${isDashed ? 'stroke-dasharray="6 3"' : ''} />
            `;
          }
        }

        return `
          <svg viewBox="0 0 ${width} ${height}" class="w-full h-full select-none" xmlns="http://www.w3.org/2000/svg">
            <!-- Guías horizontales de fondo -->
            <line x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}" stroke="${baseGridColor}" stroke-width="1.2" />
            <line x1="${pad}" y1="${pad}" x2="${width - pad}" y2="${pad}" stroke="${baseGridColor}" stroke-width="1" stroke-dasharray="2 4" opacity="0.4" />
            
            <!-- Línea de Meta (Target) punteada de referencia -->
            <line x1="${pad}" y1="${targetY}" x2="${width - pad}" y2="${targetY}" stroke="${targetLineColor}" stroke-width="1.5" stroke-dasharray="4 4" opacity="0.85" />
            <text x="${width - pad}" y="${Math.max(12, targetY - 4)}" text-anchor="end" font-size="9" font-weight="700" fill="${targetLineColor}" font-family="JetBrains Mono, monospace">Meta: ${targetVal.toFixed(metric === 'score' ? 0 : 1)}</text>

            <!-- Trazos de línea continua o de aviso según meta -->
            ${segmentsHtml}

            ${points.map(p => {
              const ptFill = p.isMet ? successPointColor : failPointColor;
              const ptStroke = p.isMet ? (isDark ? '#0F172A' : '#FFFFFF') : (isDark ? '#450A0A' : '#FEF2F2');
              const valColor = p.isMet ? textColor : failPointColor;
              return `
                <g class="transition-transform">
                  ${!p.isMet ? `<circle cx="${p.x}" cy="${p.y}" r="9" fill="${failPointColor}" opacity="0.22" class="animate-pulse" />` : ''}
                  <circle cx="${p.x}" cy="${p.y}" r="${isSingleWeek ? 6.5 : 5.5}" fill="${ptFill}" stroke="${ptStroke}" stroke-width="2" />
                  <text x="${p.x}" y="${p.y - (isSingleWeek ? 12 : 9)}" text-anchor="middle" font-size="10.5" font-weight="800" fill="${valColor}" font-family="JetBrains Mono, monospace">${p.val.toFixed(metric === 'score' ? 0 : 1)}</text>
                  <text x="${p.x}" y="${height - 8}" text-anchor="middle" font-size="10" font-weight="700" fill="${textMuted}" font-family="JetBrains Mono, monospace">${p.label}</text>
                </g>
              `;
            }).join('')}
          </svg>
        `;
      }

      // GESTIÓN DE HITOS MULTI-CATEGORÍA Y CARRUSEL "AT A GLANCE" (ESTILO PIXEL)
      function getAllUpcomingMilestones() {
        const listCategories = [
          { 
            key: 'entregas', 
            label: 'Entrega', 
            icon: `<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><path d="M9 12h6M9 16h6"/></svg>` 
          },
          { 
            key: 'notas', 
            label: 'Nota', 
            icon: `<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>` 
          },
          { 
            key: 'compras', 
            label: 'Compra', 
            icon: `<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>` 
          },
          { 
            key: 'objetivos', 
            label: 'Objetivo', 
            icon: `<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>` 
          }
        ];

        const milestones = [];
        const now = new Date();
        const todayZero = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        listCategories.forEach(catInfo => {
          const items = state.lists[catInfo.key] || [];

          function scanItems(nodes, prefix = '', parentDone = false) {
            if (!Array.isArray(nodes)) return;
            nodes.forEach(node => {
              if (!node) return;
              const isDone = parentDone || node.done === true || node.status === 'done' || node.status === 'completed';
              const currentTitle = prefix ? `${prefix}: ${node.title}` : node.title;
              if (!node.isContainer && !isDone && node.date) {
                const [y, m, d] = node.date.split('-').map(Number);
                const deadlineDate = new Date(y, m - 1, d);
                let diffDays = Math.round((deadlineDate - todayZero) / 86400000);

                // Si la fecha es hoy pero la hora límite ya pasó, considerar atrasada (diffDays = -0.5)
                let isPastTimeToday = false;
                if (diffDays === 0 && node.time) {
                  const [th, tm] = node.time.split(':').map(Number);
                  if (!isNaN(th)) {
                    const targetTime = new Date(y, m - 1, d, th, isNaN(tm) ? 0 : tm, 0, 0);
                    if (now.getTime() > targetTime.getTime()) {
                      diffDays = -0.5;
                      isPastTimeToday = true;
                    }
                  }
                }

                milestones.push({
                  cat: catInfo.key,
                  id: node.id,
                  title: currentTitle,
                  date: node.date,
                  time: node.time || '',
                  note: node.note || '',
                  categoryLabel: catInfo.label,
                  categoryIcon: catInfo.icon,
                  diffDays: diffDays,
                  isPastTimeToday: isPastTimeToday,
                  deadlineDate: deadlineDate
                });
              }
              if (Array.isArray(node.children) && node.children.length > 0) {
                scanItems(node.children, currentTitle, isDone);
              }
            });
          }

          scanItems(items);
        });

        milestones.sort((a, b) => {
          const dtA = (a.date || '9999-99-99') + ' ' + (a.time || '00:00');
          const dtB = (b.date || '9999-99-99') + ' ' + (b.time || '00:00');
          return dtA.localeCompare(dtB);
        });
        return milestones;
      }

      function renderMilestoneWidget() {
        const allMilestones = getAllUpcomingMilestones();
        const overdueMilestones = allMilestones.filter(m => m.diffDays < 0);
        const upcomingMilestones = allMilestones.filter(m => m.diffDays >= 0);
        const nextDeadlineEl = document.getElementById('headerNextDeadlineWidget');
        const nextDeadlineDivider = document.getElementById('headerNextDeadlineDivider');
        const heroBanner = document.getElementById('featuredMilestoneBanner');
        const overdueBanner = document.getElementById('overdueMilestonesAlertBanner');

        const p = state.uiPreferences || {};
        const allowOverdue = (p.showOverdueAlert !== false);
        const allowUpcoming = (p.showUpcomingMilestone !== false);

        // 1. BANNER SEPARADO DE ENTREGAS ATRASADAS (ALERTA ROJA INDEPENDIENTE CON CIERRE)
        if (overdueBanner) {
          if (overdueMilestones.length > 0 && allowOverdue && !app.isBannerDismissed('overdueMilestonesAlertBanner')) {
            overdueBanner.classList.remove('hidden');
            const oCount = overdueMilestones.length;
            const oItemsList = overdueMilestones.slice(0, 3).map(o => `
              <span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-theme-accent-soft border border-theme-accent text-theme-accent font-bold text-[10px] cursor-pointer hover:bg-theme-accent hover:text-white transition" onclick="app.jumpToMilestone('${o.cat}', '${o.id}')" title="Ver en lista">
                <span class="truncate max-w-[150px] sm:max-w-[200px]">${escapeHtml(o.title)}</span>
                <span class="font-mono text-theme-accent font-extrabold group-hover:text-white">(${o.isPastTimeToday ? (o.time || 'hora pasada') : Math.abs(Math.round(o.diffDays)) + 'd atraso'})</span>
                <button type="button" onclick="event.stopPropagation(); app.completeMilestoneDirect('${o.cat}', '${o.id}')" class="hover:text-white hover:bg-theme-accent px-1 rounded transition ml-0.5" title="Marcar como hecha">✓</button>
              </span>
            `).join('');

            overdueBanner.innerHTML = `
              <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div class="flex items-start sm:items-center gap-2.5 min-w-0 flex-1">
                  <div class="w-7 h-7 rounded-lg bg-theme-accent text-white flex items-center justify-center font-bold text-xs shrink-0 shadow-sm animate-pulse mt-0.5 sm:mt-0">
                    <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                  </div>
                  <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-1.5 flex-wrap">
                      <span class="font-bold text-theme-accent font-mono uppercase text-[10px] tracking-wider shrink-0">ENTREGA${oCount > 1 ? 'S' : ''} ATRASADA${oCount > 1 ? 'S' : ''} (${oCount}):</span>
                      ${oItemsList}
                      ${oCount > 3 ? `<span class="text-[10px] text-stone-500 dark:text-slate-400 font-mono shrink-0">+${oCount - 3} más</span>` : ''}
                    </div>
                  </div>
                </div>
                <div class="flex items-center gap-1.5 shrink-0 w-full sm:w-auto">
                  <button type="button" onclick="app.openOverdueMilestonesModal()" class="flex-1 sm:flex-initial px-2.5 py-1 rounded-lg bg-theme-accent hover:opacity-90 text-white font-bold text-[11px] border border-theme-accent transition flex items-center justify-center gap-1.5 shadow-sm active:translate-y-0.5">
                    <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 12h6"/><path d="M12 9v6"/></svg>
                    <span>Revisar Atrasadas</span>
                  </button>
                  <button type="button" onclick="app.dismissBanner('overdueMilestonesAlertBanner')" class="px-2 py-1 rounded-lg subpanel-bg border hover:border-theme text-stone-500 hover:text-stone-900 dark:hover:text-white font-bold text-xs transition shrink-0" title="Cerrar aviso durante esta sesión">✕</button>
                </div>
              </div>
            `;
          } else {
            overdueBanner.classList.add('hidden');
            overdueBanner.innerHTML = '';
          }
        }

        // 2. BANNER DE PRÓXIMO HITO FUTURO (CON BOTÓN DE CIERRE Y RECORDATORIO)
        if (upcomingMilestones.length === 0 || !allowUpcoming || app.isBannerDismissed('featuredMilestoneBanner')) {
          if (heroBanner) {
            heroBanner.classList.add('hidden');
            heroBanner.innerHTML = '';
          }
          if (nextDeadlineDivider) nextDeadlineDivider.classList.remove('hidden');
          if (nextDeadlineEl) {
            nextDeadlineEl.classList.remove('hidden');
            nextDeadlineEl.innerHTML = `<span class="text-stone-500 dark:text-slate-400 text-xs font-medium flex items-center gap-1.5"><svg class="w-3.5 h-3.5 text-stone-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> Sin entregas ni hitos próximos</span>`;
          }
          return;
        }

        const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
        const monthNames = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
        const urgentUpcoming = upcomingMilestones.filter(m => m.diffDays <= 7);

        if (urgentUpcoming.length > 0) {
          if (nextDeadlineEl) {
            nextDeadlineEl.innerHTML = '';
            nextDeadlineEl.classList.add('hidden');
          }
          if (nextDeadlineDivider) nextDeadlineDivider.classList.add('hidden');

          const uCount = urgentUpcoming.length;
          const uIdx = ((state.ui.milestoneIdx || 0) % uCount + uCount) % uCount;
          state.ui.milestoneIdx = uIdx;
          const current = urgentUpcoming[uIdx];
          const diffDays = current.diffDays;
          const deadlineDate = current.deadlineDate;
          const formattedDate = `${dayNames[deadlineDate.getDay()]}, ${deadlineDate.getDate()} ${monthNames[deadlineDate.getMonth()]}`;

          let urgencyBadge = '';
          let relativeText = '';
          let heroBorderClass = '';

          if (diffDays === 0) {
            urgencyBadge = `<span class="px-2.5 py-0.5 rounded-full font-bold font-mono text-[11px] bg-theme-accent text-white animate-bounce shadow">VENCE HOY</span>`;
            relativeText = 'Entrega programada para hoy.';
            heroBorderClass = 'border-theme-accent shadow-red-900/20 ring-1 ring-theme-accent/50';
          } else if (diffDays === 1) {
            urgencyBadge = `<span class="px-2.5 py-0.5 rounded-full font-bold font-mono text-[11px] bg-theme-accent-soft text-theme-accent border border-theme-accent/40">Mañana</span>`;
            relativeText = 'Queda 1 día restante.';
            heroBorderClass = 'border-theme-accent/60 shadow-amber-950/20 ring-1 ring-theme-accent/30';
          } else {
            urgencyBadge = `<span class="px-2.5 py-0.5 rounded-full font-bold font-mono text-[11px] bg-theme-100 text-theme-main border border-theme">En ${diffDays} días</span>`;
            relativeText = `Faltan ${diffDays} días (${formattedDate}).`;
            heroBorderClass = 'border-theme shadow-sm';
          }

          const hasMultiple = uCount > 1;
          let paginationDots = '';
          if (hasMultiple) {
            const dateGroups = [];
            urgentUpcoming.forEach((m, idx) => {
              const lastGrp = dateGroups[dateGroups.length - 1];
              if (lastGrp && lastGrp.date === m.date) {
                lastGrp.indices.push(idx);
              } else {
                dateGroups.push({ date: m.date, indices: [idx] });
              }
            });

            paginationDots = `
              <div class="inline-flex items-center gap-1.5 p-0.5">
                ${dateGroups.map(grp => {
                  const isMultipleInDate = grp.indices.length > 1;
                  const hasActive = grp.indices.includes(uIdx);
                  const dotsHtml = grp.indices.map(i => {
                    const isActive = (i === uIdx);
                    return `<button type="button" onclick="app.setMilestoneIdx(${i})" class="h-2 rounded-full transition-all duration-200 cursor-pointer ${isActive ? 'bg-theme-main w-4 shadow-xs' : 'bg-stone-400/80 dark:bg-slate-600 hover:bg-stone-600 dark:hover:bg-slate-400 w-2'}" title="Ver hito ${i + 1} de ${uCount} (${grp.date})"></button>`;
                  }).join('');

                  if (isMultipleInDate) {
                    return `<div class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-stone-200/80 dark:bg-slate-800/90 border ${hasActive ? 'border-theme-main/50 ring-1 ring-theme-main/30' : 'border-stone-300 dark:border-slate-700/80'}" title="${grp.indices.length} eventos el mismo día (${grp.date})">${dotsHtml}</div>`;
                  } else {
                    return dotsHtml;
                  }
                }).join('')}
              </div>
            `;
          }

          const navButtons = hasMultiple ? `
            <div class="flex items-center gap-1 bg-stone-100 dark:bg-slate-900/80 border border-theme rounded-xl p-0.5 shadow-xs shrink-0">
              <button type="button" onclick="app.prevMilestone()" class="w-7 h-7 rounded-lg hover:bg-stone-200 dark:hover:bg-slate-800 text-stone-700 dark:text-slate-300 hover:text-stone-900 dark:hover:text-white flex items-center justify-center font-bold text-xs transition active:scale-95" title="Anterior hito próximo">◀</button>
              <span class="text-[10px] font-mono text-stone-600 dark:text-slate-400 px-1 font-bold">${uIdx + 1}/${uCount}</span>
              <button type="button" onclick="app.nextMilestone()" class="w-7 h-7 rounded-lg hover:bg-stone-200 dark:hover:bg-slate-800 text-stone-700 dark:text-slate-300 hover:text-stone-900 dark:hover:text-white flex items-center justify-center font-bold text-xs transition active:scale-95" title="Siguiente hito próximo">▶</button>
            </div>
          ` : '';

          if (heroBanner) {
            heroBanner.classList.remove('hidden');
            heroBanner.className = `editorial-card panel-bg border-l-4 border-l-theme-accent border rounded-2xl p-3.5 sm:p-4 shadow-xl text-xs transition-all ${heroBorderClass}`;
            heroBanner.innerHTML = `
              <div class="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div class="w-full md:w-auto flex items-center gap-3 min-w-0 flex-1">
                  <div class="vector-seal bg-theme-accent text-white w-10 h-10 shadow-sm shrink-0 flex items-center justify-center">
                    ${current.categoryIcon}
                  </div>
                  <div class="w-full min-w-0 space-y-0.5 flex-1">
                    <div class="flex items-center gap-2 flex-wrap">
                      <span class="text-[10px] font-extrabold uppercase tracking-wider text-theme-accent font-mono">PRÓXIMO HITO</span>
                      <span class="px-2 py-0.2 rounded bg-stone-200/80 dark:bg-slate-800 text-stone-700 dark:text-slate-300 border border-theme font-bold text-[9px] uppercase tracking-wider">${current.categoryLabel}</span>
                      ${urgencyBadge}
                      ${paginationDots}
                    </div>
                    <div class="font-serif font-bold text-base sm:text-lg tracking-tight line-clamp-2 whitespace-normal break-words text-stone-900 dark:text-white" title="${current.title}">
                      ${current.title}
                    </div>
                    <div class="text-[11px] text-stone-500 dark:text-slate-400 flex items-center gap-2 flex-wrap font-sans">
                      <span class="flex items-center gap-1.5"><svg class="w-3.5 h-3.5 text-theme-main shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> Límite: <strong class="text-theme-main font-bold font-mono">${formattedDate}${current.time ? ` (${current.time})` : ''}</strong></span>
                      <span>•</span>
                      <span class="${diffDays <= 1 ? 'text-theme-accent font-bold' : 'text-stone-500 dark:text-slate-400'}">${relativeText}</span>
                      ${current.note ? `<span class="text-stone-500 dark:text-slate-400 italic truncate max-w-xs">• "${current.note}"</span>` : ''}
                    </div>
                  </div>
                </div>

                <div class="w-full md:w-auto flex flex-wrap items-center justify-between md:justify-end gap-1.5 pt-2 md:pt-0 border-t md:border-t-0 border-stone-200/60 dark:border-white/10 shrink-0">
                  ${navButtons}
                  <div class="flex items-center gap-1.5 flex-wrap">
                    <button type="button" onclick="app.focusCalendarDate('${current.date}')" class="px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl subpanel-bg hover:border-theme text-stone-800 dark:text-slate-200 border font-bold text-[11px] sm:text-xs flex items-center gap-1 shadow-sm active:translate-y-0.5 transition" title="Ver en calendario interactivo">
                      <svg class="w-3.5 h-3.5 text-stone-600 dark:text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                      <span>Calendario</span>
                    </button>
                    <button type="button" onclick="app.completeMilestoneDirect('${current.cat}', '${current.id}')" class="px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl bg-theme-accent hover:opacity-95 text-white border border-theme-accent font-bold text-[11px] sm:text-xs flex items-center gap-1 shadow-md active:translate-y-0.5 transition" title="Marcar como hecha">
                      <svg class="w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>
                      <span>Hecha</span>
                    </button>
                    <button type="button" onclick="app.jumpToMilestone('${current.cat}', '${current.id}')" class="px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl bg-theme-main hover:opacity-95 text-white border border-theme font-bold text-[11px] sm:text-xs flex items-center gap-1 shadow-md active:translate-y-0.5 transition" title="Ver en su lista">
                      <svg class="w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="2"/></svg>
                      <span>Ver Lista</span>
                    </button>
                    <button type="button" onclick="app.dismissBanner('featuredMilestoneBanner')" class="p-1.5 sm:p-2 rounded-xl subpanel-bg border hover:border-theme text-stone-500 hover:text-stone-900 dark:hover:text-white font-bold text-xs transition flex items-center justify-center shrink-0" title="Cerrar aviso durante esta sesión">✕</button>
                  </div>
                </div>
              </div>
            `;
          }
        } else {
          if (heroBanner) {
            heroBanner.classList.add('hidden');
            heroBanner.innerHTML = '';
          }
          if (nextDeadlineDivider) nextDeadlineDivider.classList.remove('hidden');
          if (nextDeadlineEl) {
            nextDeadlineEl.classList.remove('hidden');
            const totalCount = upcomingMilestones.length;
            const aIdx = ((state.ui.milestoneIdx || 0) % totalCount + totalCount) % totalCount;
            const current = upcomingMilestones[aIdx];
            const diffDays = current.diffDays;
            const headerTime = current.time ? ` • ${current.time}` : '';
            const headerBadge = `<span class="px-1.5 py-0.5 rounded font-bold text-[10px] bg-theme-100 text-theme-main border border-theme">en ${diffDays}d${headerTime}</span>`;
            const hasMultiple = totalCount > 1;

            nextDeadlineEl.innerHTML = `
              <div class="inline-flex items-center gap-2">
                <span onclick="app.jumpToMilestone('${current.cat}', '${current.id}')" class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg font-bold text-xs bg-stone-200/60 dark:bg-slate-900 text-stone-700 dark:text-slate-200 border border-theme hover:border-theme-main hover:scale-105 transition cursor-pointer" title="Ver en lista">
                  <span class="w-3.5 h-3.5 shrink-0 text-stone-600 dark:text-slate-300 flex items-center justify-center">${current.categoryIcon}</span>
                  <span class="max-w-[140px] sm:max-w-[200px] truncate">${current.title}</span>
                  ${headerBadge}
                </span>
                ${hasMultiple ? `
                  <button type="button" onclick="app.nextMilestone()" class="text-[10px] text-stone-400 hover:text-theme-main px-1 font-mono font-bold" title="Siguiente hito (${aIdx + 1}/${totalCount})">▶</button>
                ` : ''}
              </div>
            `;
          }
        }
      }

      // RENDERIZADO DEL MINI-CALENDARIO DE NOTAS CON FECHA
      function renderNotesMiniCalendar() {
        const grid = document.getElementById('miniCalendarGrid');
        const monthLabel = document.getElementById('miniCalendarMonthYearLabel');
        const drawer = document.getElementById('miniCalendarSelectedDrawer');
        const collapseIcon = document.getElementById('miniCalendarCollapseIcon');
        const body = document.getElementById('miniCalendarBody');
        if (!grid || !monthLabel) return;

        if (collapseIcon && body) {
          if (miniCalendarState.isCollapsed) {
            body.classList.add('hidden');
            collapseIcon.textContent = '▶';
          } else {
            body.classList.remove('hidden');
            collapseIcon.textContent = '▼';
          }
        }

        const monthNames = [
          'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
          'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
        ];
        const yr = miniCalendarState.year;
        const mo = miniCalendarState.month;
        monthLabel.innerHTML = `<span class="month-full">${monthNames[mo]} ${yr}</span><span class="month-short hidden">${monthNames[mo].substring(0, 3)} '${String(yr).slice(-2)}</span>`;

        // Mapeo de notas y entregas por fecha
        const dateNotesMap = {};
        const categories = ['entregas', 'notas', 'compras', 'objetivos'];
        categories.forEach(cat => {
          const items = state?.lists?.[cat] || [];
          function collect(nodes) {
            if (!Array.isArray(nodes)) return;
            nodes.forEach(n => {
              if (n && n.date) {
                if (!dateNotesMap[n.date]) dateNotesMap[n.date] = [];
                dateNotesMap[n.date].push({
                  cat,
                  id: n.id,
                  title: n.title,
                  done: n.done || n.status === 'done',
                  time: n.time || ''
                });
              }
              if (Array.isArray(n.children)) collect(n.children);
            });
          }
          collect(items);
        });

        const firstDayOfMonth = new Date(yr, mo, 1);
        const lastDayOfMonth = new Date(yr, mo + 1, 0);
        const daysInMonth = lastDayOfMonth.getDate();
        const startDayIdx = (firstDayOfMonth.getDay() + 6) % 7; // Lunes = 0 .. Domingo = 6

        const todayObj = new Date();
        const todayStr = `${todayObj.getFullYear()}-${String(todayObj.getMonth() + 1).padStart(2, '0')}-${String(todayObj.getDate()).padStart(2, '0')}`;

        let html = '';
        for (let i = 0; i < startDayIdx; i++) {
          html += `<div class="p-1 opacity-25 text-[10px] select-none text-stone-400 dark:text-slate-600">—</div>`;
        }

        for (let d = 1; d <= daysInMonth; d++) {
          const dateStr = `${yr}-${String(mo + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
          const isToday = (dateStr === todayStr);
          const isPast = (dateStr < todayStr);
          const isSelected = (dateStr === miniCalendarState.selectedDateStr);
          const notesOnDate = dateNotesMap[dateStr] || [];
          const hasNotes = notesOnDate.length > 0;
          const pendingCount = notesOnDate.filter(n => !n.done).length;

          let cellClass = 'relative p-1 rounded-xl cursor-pointer transition select-none flex flex-col items-center justify-between min-h-[38px] ';
          let cellStyle = '';
          if (isSelected) {
            cellClass += 'bg-theme-main text-white font-bold shadow-md ring-2 ring-theme-main/50';
          } else if (isToday) {
            cellClass += 'ring-2 ring-theme-main bg-theme-soft/90 font-black text-theme-main shadow-xs border border-theme-main';
            cellStyle = 'outline: 2px solid var(--theme-700); outline-offset: -1px;';
          } else if (hasNotes) {
            cellClass += isPast 
              ? 'opacity-65 subpanel-bg hover:opacity-100 text-stone-700 dark:text-slate-300 font-semibold border border-theme/40' 
              : 'subpanel-bg hover:bg-stone-200 dark:hover:bg-slate-800 text-stone-900 dark:text-white font-bold border border-theme';
          } else if (isPast) {
            cellClass += 'opacity-40 text-stone-400 dark:text-slate-500 hover:opacity-90';
          } else {
            cellClass += 'hover:bg-stone-200/50 dark:hover:bg-slate-800/50 text-stone-700 dark:text-slate-300 font-medium';
          }

          let dotBadge = '';
          const calDayOfWeek = (new Date(yr, mo, d).getDay() + 6) % 7;
          const activeHabitsOnDate = (state?.customHabits || []).filter(h => {
            if (h.active === false) return false;
            if (h.dailySlots && Array.isArray(h.dailySlots)) return Number(h.dailySlots[calDayOfWeek]) > 0;
            const aDays = Array.isArray(h.activeDays) ? h.activeDays : [0, 1, 2, 3, 4, 5, 6];
            return aDays.includes(calDayOfWeek);
          });
          if (activeHabitsOnDate.length > 0) {
            dotBadge += `<span class="w-1.5 h-1.5 rounded-full bg-theme-main/90 inline-block shrink-0 mt-0.5" title="${activeHabitsOnDate.length} hábitos programados"></span>`;
          }
          if (hasNotes) {
            if (notesOnDate.length > 2) {
              const pendingOnDate = notesOnDate.filter(n => !n.done).length;
              let badgeBg = '';
              if (isSelected) {
                badgeBg = 'bg-white/30 text-white';
              } else if (pendingOnDate > 0) {
                badgeBg = 'bg-theme-accent text-white shadow-xs';
              } else {
                badgeBg = 'border border-stone-400 dark:border-slate-500 bg-transparent text-stone-500 dark:text-slate-400';
              }
              dotBadge = `<span class="text-[8px] font-mono font-extrabold px-1 rounded-full leading-tight ${badgeBg} mt-0.5">${pendingOnDate > 0 ? pendingOnDate : '✓'}</span>`;
            } else {
              const chips = notesOnDate.map(n => {
                // Definir color temático por categoría
                let catBorder = 'border-theme-main';
                let catBg = 'bg-theme-main';
                if (n.cat === 'compras') {
                  catBorder = 'border-amber-500';
                  catBg = 'bg-amber-500';
                } else if (n.cat === 'objetivos') {
                  catBorder = 'border-theme-main';
                  catBg = 'bg-theme-main';
                } else if (n.cat === 'entregas') {
                  catBorder = 'border-rose-500';
                  catBg = 'bg-rose-500';
                } else if (n.cat === 'notas') {
                  catBorder = 'border-indigo-400 dark:border-indigo-300';
                  catBg = 'bg-indigo-500 dark:bg-indigo-400';
                }

                if (isSelected) {
                  return n.done 
                    ? `<span class="w-1.5 h-1.5 rounded-full border border-white/80 bg-transparent shrink-0 opacity-80" title="Completada (${n.cat})"></span>`
                    : `<span class="w-1.5 h-1.5 rounded-full bg-white shrink-0 shadow-xs" title="Pendiente (${n.cat})"></span>`;
                }

                if (n.done) {
                  // Tarea CUMPLIDA: Mantiene el color propio de su categoría como borde con fondo transparente (hueco)
                  return `<span class="w-1.5 h-1.5 rounded-full border-[1.8px] ${catBorder} bg-transparent shrink-0 opacity-85" title="Completada (${n.cat})"></span>`;
                } else {
                  // Tarea PENDIENTE: Círculo sólido relleno con el color de su categoría
                  return `<span class="w-1.5 h-1.5 rounded-full ${catBg} shrink-0 ring-1 ring-white/60 dark:ring-black/60 shadow-xs" title="Pendiente (${n.cat})"></span>`;
                }
              }).join('');
              dotBadge = `<div class="flex items-center gap-0.5 justify-center mt-0.5">${chips}</div>`;
            }
          }

          html += `
            <div onclick="app.selectCalendarDate('${dateStr}')" class="${cellClass}" style="${cellStyle}" title="${d} ${monthNames[mo]}${isToday ? ' (HOY)' : ''}${hasNotes ? ` • ${pendingCount} pendientes, ${notesOnDate.length - pendingCount} hechas` : ''}">
              <span class="text-[11px] leading-tight ${isToday ? 'font-black underline decoration-2 decoration-theme-main underline-offset-2' : ''}">${d}</span>
              ${dotBadge}
            </div>
          `;
        }

        grid.innerHTML = html;

        // Drawer informativo con las notas y hábitos del día seleccionado
        if (drawer) {
          if (miniCalendarState.selectedDateStr && dateNotesMap[miniCalendarState.selectedDateStr]) {
            const list = dateNotesMap[miniCalendarState.selectedDateStr];
            const parts = miniCalendarState.selectedDateStr.split('-');
            const selFormatted = `${parseInt(parts[2], 10)} de ${monthNames[parseInt(parts[1], 10) - 1]}`;

            // Hábitos activos para el día seleccionado de la semana
            let selectedHabitsHtml = '';
            const selDateObj = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
            const selDayOfWeek = (selDateObj.getDay() + 6) % 7; // Lunes=0..Domingo=6
            const dayHabits = (state?.customHabits || []).filter(h => {
              if (h.active === false) return false;
              if (h.dailySlots && Array.isArray(h.dailySlots)) return Number(h.dailySlots[selDayOfWeek]) > 0;
              const aDays = Array.isArray(h.activeDays) ? h.activeDays : [0, 1, 2, 3, 4, 5, 6];
              return aDays.includes(selDayOfWeek);
            });
            if (dayHabits.length > 0) {
              selectedHabitsHtml = `
                <div class="p-2 rounded-xl subpanel-bg border border-theme/30 space-y-1.5 my-1.5">
                  <div class="text-[9.5px] font-bold text-theme-main uppercase tracking-wider flex items-center gap-1">
                    <span class="w-1.5 h-1.5 rounded-full bg-theme-main"></span>
                    <span>Rutinas & Hábitos del día (${dayHabits.length}):</span>
                  </div>
                  <div class="flex flex-wrap gap-1.5">
                    ${dayHabits.map(h => {
                      const hSlots = (h.dailySlots && Array.isArray(h.dailySlots)) ? Number(h.dailySlots[selDayOfWeek]) : (Number(h.slotsCount) || 1);
                      const hHour = (h.slotLabels && h.slotLabels[0]) || h.fixedHour || '';
                      return `
                        <div class="px-2 py-1 rounded-lg panel-bg border border-stone-200 dark:border-slate-700/80 text-[10px] flex items-center gap-1.5 shadow-2xs">
                          <span class="w-3.5 h-3.5 text-theme-main flex items-center justify-center">${renderItemIcon(h.iconId || h.icon || h.emoji || 'star', 'w-3 h-3')}</span>
                          <span class="font-bold text-stone-800 dark:text-stone-200 truncate max-w-[110px]">${escapeHtml(h.name)}</span>
                          ${hHour ? `<span class="font-mono text-[9px] text-amber-500 font-bold bg-amber-500/10 px-1 rounded">${hHour}</span>` : ''}
                          ${hSlots > 1 ? `<span class="font-mono text-[8.5px] text-stone-400">×${hSlots}</span>` : ''}
                        </div>
                      `;
                    }).join('')}
                  </div>
                </div>
              `;
            }

            drawer.classList.remove('hidden');
            drawer.innerHTML = `
              <div class="flex items-center justify-between pb-1">
                <span class="font-bold text-[10px] uppercase tracking-wider text-theme-main font-mono flex items-center gap-1.5">
                  <svg class="w-3 h-3 text-theme-main" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                  <span>Notas del ${selFormatted} (${list.length}):</span>
                </span>
                <button type="button" onclick="app.selectCalendarDate(null)" class="text-[10px] text-stone-400 hover:text-stone-700 dark:hover:text-slate-200 font-bold">✕ Cerrar</button>
              </div>
              ${selectedHabitsHtml}
              <div class="space-y-1 max-h-36 overflow-y-auto pr-1">
                ${list.map(n => {
                  const catLabel = n.cat === 'entregas' ? 'Entrega' : (n.cat === 'compras' ? 'Compra' : (n.cat === 'objetivos' ? 'Objetivo' : 'Nota'));
                  const catClass = n.cat === 'entregas' ? 'bg-theme-accent-soft text-theme-accent border-theme-accent/30' : 'bg-theme-soft text-theme-main border-theme';
                  return `
                    <div class="flex items-center justify-between p-1.5 rounded-lg subpanel-bg border border-theme text-[11px] gap-2">
                      <div class="flex items-center gap-1.5 min-w-0 flex-1">
                        <span class="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold border ${catClass} shrink-0">${catLabel}</span>
                        <span class="truncate ${n.done ? 'line-through opacity-60' : 'font-medium text-stone-800 dark:text-slate-200'}">
                          ${n.done ? '✓ ' : ''}${n.title}${n.time ? ` <span class="font-mono text-[9px] opacity-75">(${n.time})</span>` : ''}
                        </span>
                      </div>
                      <button type="button" onclick="app.jumpToMilestone('${n.cat}', '${n.id}')" class="px-2 py-0.5 rounded text-[10px] bg-theme-main text-white font-bold shrink-0 hover:opacity-90 transition">
                        Ver
                      </button>
                    </div>
                  `;
                }).join('')}
              </div>
            `;
          } else if (miniCalendarState.selectedDateStr) {
            const parts = miniCalendarState.selectedDateStr.split('-');
            const selFormatted = `${parseInt(parts[2], 10)} de ${monthNames[parseInt(parts[1], 10) - 1]}`;

            // Hábitos activos para el día seleccionado de la semana
            let emptyHabitsHtml = '';
            const selDateObj = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
            const selDayOfWeek = (selDateObj.getDay() + 6) % 7;
            const dayHabits = (state?.customHabits || []).filter(h => {
              if (h.active === false) return false;
              if (h.dailySlots && Array.isArray(h.dailySlots)) return Number(h.dailySlots[selDayOfWeek]) > 0;
              const aDays = Array.isArray(h.activeDays) ? h.activeDays : [0, 1, 2, 3, 4, 5, 6];
              return aDays.includes(selDayOfWeek);
            });
            if (dayHabits.length > 0) {
              emptyHabitsHtml = `
                <div class="p-2 rounded-xl subpanel-bg border border-theme/30 space-y-1.5 my-1.5">
                  <div class="text-[9.5px] font-bold text-theme-main uppercase tracking-wider flex items-center gap-1">
                    <span class="w-1.5 h-1.5 rounded-full bg-theme-main"></span>
                    <span>Rutinas & Hábitos del día (${dayHabits.length}):</span>
                  </div>
                  <div class="flex flex-wrap gap-1.5">
                    ${dayHabits.map(h => {
                      const hSlots = (h.dailySlots && Array.isArray(h.dailySlots)) ? Number(h.dailySlots[selDayOfWeek]) : (Number(h.slotsCount) || 1);
                      const hHour = (h.slotLabels && h.slotLabels[0]) || h.fixedHour || '';
                      return `
                        <div class="px-2 py-1 rounded-lg panel-bg border border-stone-200 dark:border-slate-700/80 text-[10px] flex items-center gap-1.5 shadow-2xs">
                          <span class="w-3.5 h-3.5 text-theme-main flex items-center justify-center">${renderItemIcon(h.iconId || h.icon || h.emoji || 'star', 'w-3 h-3')}</span>
                          <span class="font-bold text-stone-800 dark:text-stone-200 truncate max-w-[110px]">${escapeHtml(h.name)}</span>
                          ${hHour ? `<span class="font-mono text-[9px] text-amber-500 font-bold bg-amber-500/10 px-1 rounded">${hHour}</span>` : ''}
                          ${hSlots > 1 ? `<span class="font-mono text-[8.5px] text-stone-400">×${hSlots}</span>` : ''}
                        </div>
                      `;
                    }).join('')}
                  </div>
                </div>
              `;
            }

            drawer.classList.remove('hidden');
            drawer.innerHTML = `
              <div class="flex items-center justify-between pb-1">
                <span class="font-bold text-[10px] uppercase tracking-wider text-theme-main font-mono">${selFormatted}</span>
                <button type="button" onclick="app.selectCalendarDate(null)" class="text-[10px] text-stone-400 hover:text-stone-700 dark:hover:text-slate-200 font-bold">✕ Cerrar</button>
              </div>
              ${emptyHabitsHtml}
              <div class="text-stone-500 dark:text-slate-400 text-[10px] italic pt-0.5">
                Sin notas ni entregas asignadas a esta fecha.
              </div>
            `;
          } else {
            drawer.classList.add('hidden');
            drawer.innerHTML = '';
          }
        }
      }

      // RENDERIZADO GENERAL Y KPIS
      function renderHeaderAndKPIs() {
        const w = getActiveWeek();
        const m = calculateWeekMetrics(w);
        const todayDayIndex = (new Date().getDay() + 6) % 7;
        const dateRange = getWeekDateRange(w.weekNum);

        // Tema y Paleta Bicolor Adaptativa Total
        const html = document.documentElement;
        const metaTheme = document.querySelector('meta[name="theme-color"]');
        const themeIconEl = document.getElementById('themeToggleIcon');
        if (state.theme === 'light') {
          html.classList.remove('dark');
          if (themeIconEl) themeIconEl.innerHTML = '<svg class="w-3.5 h-3.5 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';
          document.getElementById('themeToggleText').textContent = 'Modo Claro';
          if (metaTheme) metaTheme.content = '#f5f0e8';
        } else {
          html.classList.add('dark');
          if (themeIconEl) themeIconEl.innerHTML = '<svg class="w-3.5 h-3.5 text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
          document.getElementById('themeToggleText').textContent = 'Modo Oscuro';
          if (metaTheme) metaTheme.content = '#080d1a';
        }
        applyAccentPalette(state.themePalette || 'blue_red');

        // Header Semanas y Fechas
        document.getElementById('headerWeekBadge').textContent = `Semana #${w.weekNum}`;
        document.getElementById('headerDateRangeBadge').textContent = dateRange.label;

        // Candado Solo Lectura / Edición
        const isPastWeek = state.viewingWeek !== state.currentWeek;
        const lockBtn = document.getElementById('readOnlyLockBtn');
        const lockIcon = document.getElementById('lockIcon');
        const lockText = document.getElementById('lockText');
        const banner = document.getElementById('historicalBanner');

        if (isPastWeek && state.isReadOnlyLocked) {
          if (lockIcon) lockIcon.innerHTML = '<svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';
          lockText.textContent = 'Solo Lectura';
          lockBtn.className = 'px-2 py-0.5 rounded text-[10px] font-bold border border-theme-accent bg-theme-accent-soft text-theme-accent';
          banner.classList.add('hidden');
          document.getElementById('tab1').classList.add('readonly-locked');
        } else if (isPastWeek && !state.isReadOnlyLocked) {
          if (lockIcon) lockIcon.innerHTML = '<svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>';
          lockText.textContent = 'Modo Edición';
          lockBtn.className = 'px-2 py-0.5 rounded text-[10px] font-bold border border-theme bg-theme-soft text-theme-main';
          banner.classList.remove('hidden');
          document.getElementById('tab1').classList.remove('readonly-locked');
        } else {
          // Semana actual siempre editable
          if (lockIcon) lockIcon.innerHTML = '<svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>';
          lockText.textContent = 'Activa';
          lockBtn.className = 'px-2 py-0.5 rounded text-[10px] font-bold border border-theme bg-theme-soft text-theme-main';
          banner.classList.add('hidden');
          document.getElementById('tab1').classList.remove('readonly-locked');
        }

        // Banner Permanente de Cierre de Semana Vencida (Con comprobación de cierre por sesión y preferencias)
        const pendingCloseBanner = document.getElementById('pendingWeekCloseBanner');
        const overdue = isWeekOverdue(state.currentWeek);
        const pPref = state.uiPreferences || {};
        const allowSysBanners = (pPref.showSystemBanners !== false);
        if (pendingCloseBanner) {
          if (overdue && (!state.weeks[state.currentWeek] || !state.weeks[state.currentWeek].isClosed) && allowSysBanners && !app.isBannerDismissed('pendingWeekCloseBanner')) {
            pendingCloseBanner.classList.remove('hidden');
            const pendingText = document.getElementById('pendingWeekCloseBannerText');
            if (pendingText) {
              pendingText.textContent = `La Semana #${state.currentWeek} (${dateRange.label}) ya ha finalizado.`;
            }
          } else {
            pendingCloseBanner.classList.add('hidden');
          }
        }

        // Widget de Próximo Hito Académico y Personal (Alta Visibilidad en Hero Banner y Cabecera)
        renderMilestoneWidget();

        // Sincronizar estado del acordeón de KPIs
        const kpiBody = document.getElementById('kpisCollapsibleBody');
        const kpiTxt = document.getElementById('kpisSlimStatusText');
        const kpiArr = document.getElementById('kpisSlimArrow');
        if (kpiBody && state.uiPreferences && state.uiPreferences.kpisCollapsed !== undefined) {
          if (state.uiPreferences.kpisCollapsed) {
            kpiBody.classList.add('hidden');
            if (kpiTxt) kpiTxt.textContent = 'Mostrar';
            if (kpiArr) kpiArr.textContent = '▼';
          } else {
            kpiBody.classList.remove('hidden');
            if (kpiTxt) kpiTxt.textContent = 'Plegar';
            if (kpiArr) kpiArr.textContent = '▲';
          }
        }

        // KPI 1 Dinámico (Módulos Base Activos + Hábitos Personalizados de la Semana en Visualización)
        const enabled = getWeekEnabledModules(w);
        const activeHabits = (state?.customHabits || []).filter(h => h.active !== false);

        document.getElementById('kpi1BlocksCount').textContent = `${m.blocksMetCount} / ${m.totalActiveBlocks}`;
        const kpi1Card = document.getElementById('kpiCard1');
        if (m.totalActiveBlocks > 0 && m.blocksMetCount === m.totalActiveBlocks) kpi1Card.classList.add('gold-glow');
        else kpi1Card.classList.remove('gold-glow');

        const batteryData = [];
        if (enabled.gym) batteryData.push({ id: 'gym', name: 'Gimnasio', icon: 'dumbbell', pct: m.gymPct });
        if (enabled.run) batteryData.push({ id: 'run', name: 'Running', icon: 'run', pct: m.runPct });
        if (enabled.study) batteryData.push({ id: 'study', name: 'Estudio', icon: 'book', pct: m.studyPct });
        if (enabled.academic) batteryData.push({ id: 'academic', name: 'Clases', icon: 'graduation-cap', pct: m.attPct });
        if (enabled.nutri) batteryData.push({ id: 'nutri', name: 'Nutrición', icon: 'apple', pct: m.nutriPct });
        if (enabled.budget) batteryData.push({ id: 'budget', name: 'Presupuesto', icon: 'wallet', pct: m.finPct });
        activeHabits.forEach(h => {
          batteryData.push({
            id: h.id,
            name: h.name,
            icon: h.iconId || h.icon || h.emoji || 'star',
            pct: m.customHabitsPct[h.id] || 0
          });
        });

        // Contenedor adaptable: 1 fila si son <= 6, o rejilla de 2 filas compactas (máx 6 por fila) si hay más
        const totalBats = batteryData.length;
        const useGrid = totalBats > 6;
        const batContainer = document.getElementById('kpi1Batteries');
        if (batContainer) {
          if (useGrid) {
            batContainer.className = 'grid grid-cols-6 gap-x-1 gap-y-1 pt-1 items-end w-full';
          } else {
            batContainer.className = 'flex flex-nowrap gap-1 pt-1 items-end h-8 sm:h-9 overflow-hidden w-full';
          }

          batContainer.innerHTML = batteryData.map(b => {
            const color = getScoreColor(b.pct);
            const height = Math.min(100, Math.max(12, b.pct));
            return `
              <div class="flex-1 min-w-[16px] max-w-[42px] flex flex-col items-center gap-0.5 justify-end" title="${escapeHtml(b.name)}: ${Math.round(b.pct)}%">
                <div class="w-full subpanel-bg rounded ${useGrid ? 'h-4 sm:h-5' : 'h-5 sm:h-6'} overflow-hidden flex flex-col justify-end p-0.5 border">
                  <div style="height:${height}%; background-color:${color};" class="w-full rounded-xs transition-all duration-300"></div>
                </div>
                <div class="w-3.5 h-3.5 sm:w-4 sm:h-4 flex items-center justify-center text-stone-500 dark:text-slate-400">
                  ${renderItemIcon(b.icon, 'w-3 h-3 text-stone-600 dark:text-slate-300')}
                </div>
              </div>
            `;
          }).join('');
        }

        // KPI 2
        const studyPlan = (w.studyHoursPlan || []).reduce((a, b) => a + Number(b), 0) || 15;
        document.getElementById('kpi2RingBox').innerHTML = renderSvgRing(m.studyPct, m.studyReal, studyPlan);
        document.getElementById('kpi2Numbers').textContent = `${formatHoursToHMin(m.studyReal)} / ${formatHoursToHMin(studyPlan)}`;

        let planUntilToday = 0, realUntilToday = 0;
        for (let d = 0; d <= todayDayIndex; d++) {
          planUntilToday += Number(w.studyHoursPlan[d] || 0);
          realUntilToday += Number(w.studyRealHours[d] || 0);
        }
        const deltaStudy = realUntilToday - planUntilToday;
        const compEl = document.getElementById('kpi2Compensate');
        if (deltaStudy >= 0) {
          compEl.textContent = `Al día (+${formatHoursToHMin(deltaStudy)})`;
          compEl.className = 'text-[10px] text-theme-main font-bold flex items-center gap-1';
        } else {
          const daysLeft = Math.max(1, 6 - todayDayIndex);
          compEl.textContent = `Faltan +${formatHoursToHMin(Math.abs(deltaStudy) / daysLeft)}/d`;
          compEl.className = 'text-[10px] text-theme-accent font-bold flex items-center gap-1';
        }

        document.getElementById('kpi2MiniBars').innerHTML = w.studyRealHours.map((h, i) => {
          const plan = Number(w.studyHoursPlan[i] || 3);
          const pct = plan > 0 ? (h / plan) * 100 : 0;
          return `
            <div class="w-2 subpanel-bg rounded-xs h-5 flex flex-col justify-end p-0.2 border" title="${DAYS[i]}: ${h}h / ${plan}h">
              <div style="height:${Math.min(100, Math.max(12, pct))}%; background-color:${getScoreColor(pct)};" class="w-full rounded-xs"></div>
            </div>
          `;
        }).join('');

        // KPI 3
        let pCount = 0, hCount = 0, aCount = 0, pendCount = 0;
        w.days.forEach(d => {
          (d.attendance || []).forEach(c => {
            if (c.status === 'present') pCount++;
            else if (c.status === 'holiday') hCount++;
            else if (c.status === 'absent') aCount++;
            else pendCount++;
          });
        });
        const totalSessions = pCount + hCount + aCount + pendCount || 1;
        document.getElementById('kpi3Percent').textContent = `${Math.round(m.attPct)}%`;
        document.getElementById('kpi3Bar').innerHTML = `
          <div style="width:${(pCount/totalSessions)*100}%" class="bg-emerald-500 h-full"></div>
          <div style="width:${(hCount/totalSessions)*100}%" class="bg-amber-500 h-full"></div>
          <div style="width:${(aCount/totalSessions)*100}%" class="bg-rose-500 h-full"></div>
          <div style="width:${(pendCount/totalSessions)*100}%" class="bg-slate-700 h-full"></div>
        `;
        document.getElementById('kpi3Counts').innerHTML = `
          <span class="text-emerald-500 font-bold flex items-center gap-0.5"><svg class="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> ${pCount}</span>
          <span class="text-amber-500 font-bold flex items-center gap-0.5"><svg class="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg> ${hCount}</span>
          <span class="text-rose-500 font-bold flex items-center gap-0.5"><svg class="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> ${aCount}</span>
          <span class="text-stone-400 dark:text-slate-500 flex items-center gap-0.5"><svg class="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg> ${pendCount}</span>
        `;

        // KPI 4 & Pacing Diario
        document.getElementById('kpi4Numbers').textContent = `${m.spent.toFixed(2)} / ${m.budget.toFixed(2)} €`;
        const spendPct = m.budget > 0 ? (m.spent / m.budget) * 100 : 0;
        const thermo = document.getElementById('kpi4Thermo');
        thermo.style.width = `${Math.min(100, spendPct)}%`;
        if (spendPct > 100) thermo.className = 'h-full bg-rose-500 transition-all duration-300';
        else if (spendPct >= 80) thermo.className = 'h-full bg-amber-500 transition-all duration-300';
        else thermo.className = 'h-full bg-emerald-500 transition-all duration-300';

        const avail = Math.max(0, m.budget - m.spent);
        document.getElementById('kpi4Available').textContent = `Disp: ${avail.toFixed(2)} €`;
        document.getElementById('quickSpendAvailable').textContent = `Disp: ${avail.toFixed(2)} €`;

        // Pacing sugerido diario
        const remainingDays = Math.max(1, 7 - todayDayIndex);
        const dailyPacing = (avail / remainingDays).toFixed(1);
        document.getElementById('kpi4PacingDaily').textContent = `Ritmo: ~${dailyPacing}€/d`;

        const projected = (m.spent / (todayDayIndex + 1)) * 7;
        const projEl = document.getElementById('kpi4Projection');
        if (projected > m.budget) {
          projEl.textContent = `Proy: ~${projected.toFixed(0)}€ (Exceso)`;
          projEl.className = 'text-rose-500 font-medium font-mono';
        } else {
          projEl.textContent = `Proy: ~${projected.toFixed(0)}€ (OK)`;
          projEl.className = 'text-theme-main font-medium font-mono';
        }

        // Actualizar modales de KPI en vivo si alguno está abierto
        if (document.getElementById('modalKpi1Blocks') && !document.getElementById('modalKpi1Blocks').classList.contains('hidden')) renderKpi1BlocksModal();
        if (document.getElementById('modalKpi3Attendance') && !document.getElementById('modalKpi3Attendance').classList.contains('hidden')) renderKpi3AttendanceModal();
        if (document.getElementById('modalKpi4Budget') && !document.getElementById('modalKpi4Budget').classList.contains('hidden')) renderKpi4BudgetModal();
        if (document.getElementById('modalSubjectStudyStats') && !document.getElementById('modalSubjectStudyStats').classList.contains('hidden')) renderSubjectStudyStatsModal();
        const closeWkModal = document.getElementById('closeWeekModal');
        if (closeWkModal && !closeWkModal.classList.contains('hidden')) {
          const curWk = state.weeks[state.currentWeek] || w;
          const curMetrics = calculateWeekMetrics(curWk);
          const surplusVal = Math.max(0, curMetrics.budget - curMetrics.spent);
          const summaryEl = document.getElementById('closeWeekSummary');
          if (summaryEl) {
            summaryEl.innerHTML = `
              <div class="flex justify-between items-center py-1 text-stone-600 dark:text-slate-300"><span class="font-medium">Score Global:</span><strong class="text-stone-900 dark:text-white font-mono text-sm">${curMetrics.score} / 100</strong></div>
              <div class="flex justify-between items-center py-1 text-stone-600 dark:text-slate-300"><span class="font-medium">Gimnasio:</span><strong class="text-stone-900 dark:text-white font-mono">${curMetrics.gymReal} / ${curWk.goals.gymSessions} ses. (${Math.round(curMetrics.gymPct)}%)</strong></div>
              <div class="flex justify-between items-center py-1 text-stone-600 dark:text-slate-300"><span class="font-medium">Running:</span><strong class="text-stone-900 dark:text-white font-mono">${curMetrics.runKmReal.toFixed(1)} / ${curWk.goals.runKm} km (${Math.round(curMetrics.runPct)}%)</strong></div>
              <div class="flex justify-between items-center py-1 text-stone-600 dark:text-slate-300"><span class="font-medium">Estudio:</span><strong class="text-stone-900 dark:text-white font-mono">${formatHoursToHMin(curMetrics.studyReal)} / ${formatHoursToHMin(curMetrics.studyGoal)} (${Math.round(curMetrics.studyPct)}%)</strong></div>
              <div class="flex justify-between items-center py-1.5 text-stone-700 dark:text-slate-200"><span class="font-bold">Presupuesto Restante:</span><strong class="text-theme-main font-mono text-sm">${surplusVal.toFixed(2)} €</strong></div>
            `;
          }
          const surplusBadge = document.getElementById('closeWeekSurplusBadge');
          if (surplusBadge) surplusBadge.textContent = `${surplusVal.toFixed(2)} €`;
          app.updateSurplusSlider();
          const tabMatrix = document.getElementById('closeWeekTabMatrix');
          if (tabMatrix && !tabMatrix.classList.contains('hidden')) {
            app.renderCloseWeekMatrix();
          }
        }
      }

      function renderDailyHabits() {
        updateHeaderDailyProgress();
        const w = getActiveWeek();
        const m = calculateWeekMetrics(w);
        const streaks = calculateStreaks(w.weekNum);
        const todayIdx = (new Date().getDay() + 6) % 7;
        const isCollapsed = state.ui.weekTableCollapsed !== false;

        const scoreBadge = document.getElementById('dailyScoreBadge');
        if (scoreBadge) scoreBadge.textContent = `Score: ${m.score} / 100`;

        const weekBox = document.getElementById('weekTableContainer');
        const todayBox = document.getElementById('todayFocusContainer');
        const toggleBtn = document.getElementById('toggleWeekTableBtn');

        // Render Enfoque de Hoy como protagonista permanente
        if (todayBox) {
          todayBox.classList.remove('hidden');
          const activeFocusDay = (state.ui.selectedFocusDay !== undefined && state.ui.selectedFocusDay !== null) ? state.ui.selectedFocusDay : todayIdx;
          try {
            renderTodayFocusCard(activeFocusDay);
          } catch (errFocus) {
            console.error('Error al renderizar tarjeta de enfoque de hoy:', errFocus);
          }
        }

        // Matriz Semanal Completa Colapsable (Columna derecha)
        if (weekBox) {
          const isHiddenByPref = state.uiPreferences && state.uiPreferences.showWeekMatrix === false;
          if (isCollapsed || isHiddenByPref) {
            weekBox.classList.add('hidden');
            if (toggleBtn) {
              toggleBtn.innerHTML = `<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/><path d="M9 3v18"/><path d="M15 3v18"/></svg> <span class="hidden sm:inline">Ver Matriz</span><span class="sm:hidden">Matriz</span> <span class="text-[9px]">▼</span>`;
              if (isHiddenByPref) toggleBtn.classList.add('hidden');
              else toggleBtn.classList.remove('hidden');
            }
          } else {
            weekBox.classList.remove('hidden');
            if (toggleBtn) {
              toggleBtn.innerHTML = `<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/><path d="M9 3v18"/><path d="M15 3v18"/></svg> <span class="hidden sm:inline">Plegar Matriz</span><span class="sm:hidden">Plegar</span> <span class="text-[9px]">▲</span>`;
              toggleBtn.classList.remove('hidden');
            }
            const isOverdue = isWeekOverdue(w.weekNum) && !w.isClosed;
            try {
              renderFullWeekTable(isOverdue ? -1 : todayIdx, m, streaks);
            } catch (errTable) {
              console.error('Error al renderizar matriz semanal:', errTable);
            }
          }
        }
        if (window.app && typeof app.rebalanceTab1Layout === 'function') {
          app.rebalanceTab1Layout();
        }
      }

      function renderTodayFocusCard(dIdx) {
        if (dIdx === undefined || dIdx === null || dIdx < 0 || dIdx > 6) {
          dIdx = (new Date().getDay() + 6) % 7;
        }
        const w = getActiveWeek();
        if (!w || !w.days || !w.days[dIdx]) return;
        const m = calculateWeekMetrics(w);
        const day = w.days[dIdx];
        const dateRange = getWeekDateRange(w.weekNum);
        const todayDateStr = dateRange.daysDates ? dateRange.daysDates[dIdx] : '';
        const realTodayIdx = (new Date().getDay() + 6) % 7;
        const overdue = isWeekOverdue(w.weekNum) && !w.isClosed;
        const isActuallyToday = !overdue && (dIdx === realTodayIdx);
        const titleEl = document.getElementById('todayFocusTitle');
        if (titleEl) {
          titleEl.innerHTML = `Enfoque de <em class="italic font-normal text-theme-accent">${DAY_FULL[dIdx]} ${todayDateStr}</em>${overdue ? ' <span class="text-[10px] text-theme-accent font-bold font-mono">(Semana Vencida)</span>' : ''}`;
        }

        // Actualizar estado activo de las pastillas Lun-Dom en móvil
        for (let i = 0; i < 7; i++) {
          const btn = document.getElementById(`mobileDayBtn_${i}`);
          if (btn) {
            if (i === dIdx) {
              btn.className = 'flex-1 py-1 rounded-lg font-bold text-[11px] text-center transition bg-theme-main text-white shadow-xs';
            } else if (!overdue && i === realTodayIdx) {
              btn.className = 'flex-1 py-1 rounded-lg font-bold text-[11px] text-center transition text-theme-accent border border-theme-accent/40 bg-theme-accent-soft';
            } else {
              btn.className = 'flex-1 py-1 rounded-lg font-bold text-[11px] text-center transition text-stone-500 dark:text-slate-400 hover:text-stone-800 dark:hover:text-slate-200';
            }
          }
        }

        // Entregas pendientes de hoy o atrasadas
        const nowDeliveries = new Date();
        const todayIso = `${nowDeliveries.getFullYear()}-${String(nowDeliveries.getMonth() + 1).padStart(2, '0')}-${String(nowDeliveries.getDate()).padStart(2, '0')}`;
        const currentTimeStr = `${String(nowDeliveries.getHours()).padStart(2, '0')}:${String(nowDeliveries.getMinutes()).padStart(2, '0')}`;
        const urgentDeliveries = [];
        function scanUrgentDeliveries(nodes, parentDone = false) {
          if (!Array.isArray(nodes)) return;
          nodes.forEach(item => {
            if (!item) return;
            const isDone = parentDone || item.done === true || item.status === 'done' || item.status === 'completed';
            if (!item.isContainer && !isDone && item.date) {
              const isPastDate = item.date < todayIso;
              const isTodayOverdue = item.date === todayIso && item.time && item.time < currentTimeStr;
              const isTodayPending = item.date === todayIso;
              if (isPastDate || isTodayOverdue || isTodayPending) {
                urgentDeliveries.push(item);
              }
            }
            if (Array.isArray(item.children)) {
              scanUrgentDeliveries(item.children, isDone);
            }
          });
        }
        scanUrgentDeliveries(state.lists?.entregas || []);

        const container = document.getElementById('todayFocusContent');
        if (!container) return;
        const gridColsClass = 'adaptive-internal-grid';
        const emptySpanClass = 'col-span-full';

        let urgentHtml = '';
        if (urgentDeliveries.length > 0) {
          urgentHtml = `
            <div class="p-3 rounded-xl bg-amber-500/10 dark:bg-amber-950/30 border border-amber-500/50 flex flex-wrap items-center justify-between gap-2 shadow-sm">
              <div class="flex items-center gap-2">
                <div class="w-6 h-6 rounded-lg bg-amber-500/20 text-amber-500 flex items-center justify-center shrink-0">
                  <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                </div>
                <div>
                  <span class="font-bold text-amber-700 dark:text-amber-300 block text-xs">Entregas pendientes para hoy / atrasadas (${urgentDeliveries.length}):</span>
                  <span class="text-stone-800 dark:text-slate-200 text-xs font-semibold">${urgentDeliveries.map(u => u.title).slice(0, 2).join(' • ')}${urgentDeliveries.length > 2 ? '...' : ''}</span>
                </div>
              </div>
              <button onclick="app.scrollToDeliveries()" class="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-sm transition active:translate-y-0.5">
                Ver en Entregas ➔
              </button>
            </div>
          `;
        }

        const studyDone = Number(w.studyRealHours[dIdx] || 0);
        const studyPlan = Number(w.studyHoursPlan[dIdx] || 0);
        const studyPct = studyPlan > 0 ? Math.min(100, Math.round((studyDone / studyPlan) * 100)) : (studyDone > 0 ? 100 : 0);
        const nutriEval = evalNutritionStatus(day.nutritionKcal, w.goals.nutri?.kcal, w.goals.nutri?.phase);
        const enabled = getWeekEnabledModules(w);
        const activeHabits = (state.customHabits || []).filter(h => h.active !== false);
        const habitsData = w.customHabitsData || {};

        
        // Barra de progreso destacada de Hoy
        const activeHabitsList = (state.customHabits || []).filter(h => h.active !== false);
        let todayTotalTasks = 0;
        let todayDoneTasks = 0;

        if (enabled.gym) {
          todayTotalTasks += 1;
          if (day.gym && day.gym.sessions > 0) todayDoneTasks += 1;
        }
        if (enabled.run) {
          todayTotalTasks += 1;
          if (day.run && day.run.km > 0) todayDoneTasks += 1;
        }
        if (enabled.study) {
          const sPlan = Number((w.studyHoursPlan && w.studyHoursPlan[dIdx]) || 0);
          const sReal = Number((w.studyRealHours && w.studyRealHours[dIdx]) || 0);
          if (sPlan > 0) {
            todayTotalTasks += 1;
            if (sReal >= sPlan) todayDoneTasks += 1;
          }
        }
        if (enabled.nutri) {
          const nEval = evalNutritionStatus(day.nutritionKcal, w.goals?.nutri?.kcal, w.goals?.nutri?.phase);
          if (nEval) {
            todayTotalTasks += 1;
            if (nEval.status === 'ok') todayDoneTasks += 1;
          }
        }

        activeHabitsList.forEach(h => {
          if (h.isReminderOnly) return;
          const daySlotsCount = (h.dailySlots && Array.isArray(h.dailySlots)) ? (Number(h.dailySlots[dIdx]) || 0) : (Number(h.slotsCount) || 1);
          const activeDaysArr = Array.isArray(h.activeDays) ? h.activeDays : [0, 1, 2, 3, 4, 5, 6];
          if (h.type === 'binary_check' && !h.dailySlots && !activeDaysArr.includes(dIdx)) return;
          if (h.type === 'binary_check' && h.dailySlots && daySlotsCount === 0) return;

          const val = (habitsData[h.id] || [])[dIdx];
          if (h.type === 'binary_check' && daySlotsCount > 1) {
            todayTotalTasks += daySlotsCount;
            if (Array.isArray(val)) {
              todayDoneTasks += val.filter(Boolean).length;
            } else if (val) {
              todayDoneTasks += daySlotsCount;
            }
          } else if (h.type === 'binary_check') {
            todayTotalTasks += 1;
            if (val === true || val === 1 || val === 'true') todayDoneTasks += 1;
          } else if (h.type === 'max_limit') {
            todayTotalTasks += 1;
            if (val !== null && val !== undefined && Number(val) <= Number(h.targetDaily)) todayDoneTasks += 1;
          } else if (h.type === 'min_accum') {
            todayTotalTasks += 1;
            if (val !== null && val !== undefined && Number(val) >= (Number(h.targetDaily) || 1)) todayDoneTasks += 1;
          } else if (h.type === 'target_range') {
            todayTotalTasks += 1;
            const c = Number(h.targetCenter) || 0, mg = Number(h.targetMargin) || 0;
            if (val !== null && val !== undefined && Number(val) >= (c - mg) && Number(val) <= (c + mg)) todayDoneTasks += 1;
          }
        });

        const todayProgressPct = todayTotalTasks > 0 ? Math.round((todayDoneTasks / todayTotalTasks) * 100) : 0;

        const prominentProgressBarHtml = `
          <div class="p-3.5 rounded-2xl subpanel-bg border border-theme shadow-sm space-y-2.5">
            <div class="flex items-center justify-between gap-2">
              <div class="flex items-center gap-2.5 min-w-0">
                <div class="vector-seal bg-theme-main text-white w-7 h-7 shadow-xs shrink-0 flex items-center justify-center font-bold text-xs">
                  <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                </div>
                <div class="min-w-0">
                  <span class="font-bold text-xs text-stone-900 dark:text-white block truncate">Progreso de Objetivos y Hábitos de Hoy</span>
                  <span class="text-[10px] text-stone-500 dark:text-slate-400 font-mono">${todayDoneTasks} de ${todayTotalTasks} completados</span>
                </div>
              </div>
              <div class="flex items-center gap-1.5 shrink-0">
                <span class="text-xs font-mono font-black text-theme-main px-2 py-0.5 rounded-lg bg-theme-soft border border-theme">${todayProgressPct}%</span>
                ${todayProgressPct === 100 && todayTotalTasks > 0 ? '<span class="text-sm animate-bounce" title="¡Día completado al 100%!">🎉</span>' : ''}
              </div>
            </div>
            <div class="w-full h-2.5 sm:h-3 rounded-full bg-stone-200 dark:bg-slate-800 overflow-hidden ring-1 ring-black/5 dark:ring-white/10">
              <div class="h-full bg-theme-main rounded-full transition-all duration-500" style="width: ${todayProgressPct}%"></div>
            </div>
          </div>
        `;

        let gymCardHtml = '';
        if (enabled.gym) {
          gymCardHtml = `
            <!-- Gimnasio -->
            <div class="p-3 rounded-xl subpanel-bg border space-y-2 flex flex-col justify-between h-full shadow-2xs">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <div class="vector-seal bg-theme-main text-white w-6 h-6 shadow-xs">
                    <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 5v14M18 5v14M2 9v6M22 9v6M6 12h12"/></svg>
                  </div>
                  <div>
                    <span class="font-bold block text-xs">Sesión de Gimnasio</span>
                    <span class="text-[10px] text-stone-500 dark:text-slate-400">Meta: ${w.goals.gymSessions} ses/sem</span>
                  </div>
                </div>
              </div>
              <div class="space-y-1.5 flex-1 flex flex-col justify-center">
                ${day.gym.sessions >= 1 ? `
                  <div class="flex flex-wrap items-center gap-1.5 pt-1 border-t border-stone-200 dark:border-slate-700/40">
                    <select onchange="app.handleGymTypeSelection(${dIdx}, 1, this.value)" class="input-bg border rounded-lg px-2 py-1 text-xs outline-none">
                      ${GYM_TYPES.map(t => `<option value="${t}" ${(day.gym.s1?.type || '') === t ? 'selected' : ''}>${t}</option>`).join('')}
                    </select>
                    ${(day.gym.s1?.type === 'Personalizado...' || day.gym.s1?.type === '✏️ Otro...') ? `
                      <button onclick="app.openCustomMuscleModal(${dIdx}, 1, 'gym')" class="px-2 py-0.5 rounded bg-theme-soft text-theme-main border border-theme text-[10px] font-semibold" title="Configurar">${day.gym.s1.custom || 'Configurar'}${day.gym.s1.cardio?.enabled ? ' (+Cardio)' : ''}</button>
                    ` : ''}
                  </div>
                ` : '<div class="text-[10.5px] text-stone-400 italic py-0.5 compact-hide">Sin entrenamiento registrado hoy</div>'}
                ${(() => {
                  if (day.gym.sessions < 2) return '';
                  let extraHtml = '';
                  for (let sIdx = 2; sIdx <= day.gym.sessions; sIdx++) {
                    const sObj = day.gym[`s${sIdx}`] || {};
                    extraHtml += `
                      <div class="flex flex-wrap items-center gap-1.5 pt-1">
                        <span class="text-[10px] font-bold text-theme-accent">${sIdx}ª:</span>
                        <select onchange="app.handleGymTypeSelection(${dIdx}, ${sIdx}, this.value)" class="input-bg border rounded-lg px-2 py-1 text-xs text-theme-accent outline-none">
                          ${GYM_TYPES.map(t => `<option value="${t}" ${(sObj.type || '') === t ? 'selected' : ''}>${sIdx}ª: ${t}</option>`).join('')}
                        </select>
                        ${(sObj.type === 'Personalizado...' || sObj.type === '✏️ Otro...') ? `
                          <button onclick="app.openCustomMuscleModal(${dIdx}, ${sIdx}, 'gym')" class="px-2 py-0.5 rounded bg-theme-accent-soft text-theme-accent border border-theme-accent text-[10px] font-semibold" title="Configurar">${sObj.custom || 'Configurar'}${sObj.cardio?.enabled ? ' (+Cardio)' : ''}</button>
                        ` : ''}
                      </div>
                    `;
                  }
                  return extraHtml;
                })()}
              </div>
              <div class="mt-auto pt-2 flex items-center justify-end gap-1.5 border-t border-stone-200/50 dark:border-slate-800/50">
                <button onclick="app.cycleGymSessionCount(${dIdx})" class="px-3 py-1.5 rounded-lg ${day.gym.sessions > 0 ? 'bg-theme-main text-white font-bold border border-theme shadow-sm' : 'subpanel-bg border text-stone-600 dark:text-slate-400 font-semibold'} text-xs active:translate-y-0.5 transition">
                  ${day.gym.sessions === 0 ? '+ Registrar' : (day.gym.sessions === 1 ? '1 Sesión' : `${day.gym.sessions} Sesiones`)}
                </button>
                ${day.gym.sessions >= 2 ? `
                  <button onclick="app.addExtraGymSession(${dIdx})" class="px-2 py-1.5 rounded-lg subpanel-bg border border-theme-accent text-theme-accent font-bold text-xs hover:bg-theme-accent-soft active:translate-y-0.5 transition" title="Añadir otra sesión">+</button>
                ` : ''}
              </div>
            </div>
          `;
        }

        let runCardHtml = '';
        if (enabled.run) {
          runCardHtml = `
            <!-- Running -->
            <div class="p-3 rounded-xl subpanel-bg border space-y-2 flex flex-col justify-between h-full shadow-2xs">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <div class="vector-seal bg-theme-main text-white w-6 h-6 shadow-xs">
                    <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"></path></svg>
                  </div>
                  <div>
                    <span class="font-bold block text-xs">Running / Cardio</span>
                    <span class="text-[10px] text-stone-500 dark:text-slate-400">Meta: ${w.goals.runKm} km/sem</span>
                  </div>
                </div>
              </div>
              <div class="space-y-1.5 flex-1 flex flex-col justify-center">
                ${day.run.sessions >= 1 ? `
                  <div class="flex flex-wrap items-center gap-1.5 pt-1 border-t border-stone-200 dark:border-slate-700/40">
                    <input type="number" step="0.5" placeholder="Km 1" value="${day.run.s1?.km !== undefined ? day.run.s1.km : (day.run.km || '')}" onchange="app.setRunSessionKm(${dIdx}, 1, this.value)" class="w-16 input-bg border rounded-lg px-2 py-1 text-center font-mono font-bold text-theme-main text-xs" title="Km 1ª sesión" autocomplete="off" />
                    <select onchange="app.setRunType(${dIdx}, 1, this.value)" class="input-bg border rounded-lg px-2 py-1 text-xs outline-none">
                      ${RUN_TYPES.map(t => `<option value="${t}" ${(day.run.s1?.type || '') === t ? 'selected' : ''}>${t}</option>`).join('')}
                    </select>
                    ${(day.run.s1?.type === 'Personalizado...' || day.run.s1?.type === '✏️ Otro...') ? `
                      <button onclick="app.openCustomRunModal(${dIdx}, 1)" class="px-2 py-0.5 rounded bg-theme-soft text-theme-main border border-theme text-[10px] font-semibold" title="Configurar">${day.run.s1.custom || 'Configurar'}</button>
                    ` : ''}
                  </div>
                ` : '<div class="text-[10.5px] text-stone-400 italic py-0.5 compact-hide">Sin carrera registrada hoy</div>'}
                ${(() => {
                  if (day.run.sessions < 2) return '';
                  let extraRun = '';
                  let totalDayKm = Number(day.run.s1?.km) || 0;
                  for (let sIdx = 2; sIdx <= day.run.sessions; sIdx++) {
                    const sObj = day.run[`s${sIdx}`] || {};
                    totalDayKm += Number(sObj.km) || 0;
                    extraRun += `
                      <div class="flex flex-wrap items-center gap-1.5 pt-1">
                        <span class="text-[10px] font-bold text-theme-accent">${sIdx}ª:</span>
                        <input type="number" step="0.5" placeholder="Km ${sIdx}" value="${sObj.km !== undefined ? sObj.km : ''}" onchange="app.setRunSessionKm(${dIdx}, ${sIdx}, this.value)" class="w-16 input-bg border rounded-lg px-2 py-1 text-center font-mono font-bold text-theme-accent text-xs" title="Km ${sIdx}ª sesión" autocomplete="off" />
                        <select onchange="app.setRunType(${dIdx}, ${sIdx}, this.value)" class="input-bg border rounded-lg px-2 py-1 text-xs text-theme-accent outline-none">
                          ${RUN_TYPES.map(t => `<option value="${t}" ${(sObj.type || '') === t ? 'selected' : ''}>${sIdx}ª: ${t}</option>`).join('')}
                        </select>
                        ${(sObj.type === 'Personalizado...' || sObj.type === '✏️ Otro...') ? `
                          <button onclick="app.openCustomRunModal(${dIdx}, ${sIdx})" class="px-2 py-0.5 rounded bg-theme-accent-soft text-theme-accent border border-theme-accent text-[10px] font-semibold" title="Configurar">${sObj.custom || 'Configurar'}</button>
                        ` : ''}
                      </div>
                    `;
                  }
                  extraRun += `<div class="text-[10px] font-mono font-bold text-theme-main pt-0.5">Total hoy: ${totalDayKm.toFixed(1)} km</div>`;
                  return extraRun;
                })()}
              </div>
              <div class="mt-auto pt-2 flex items-center justify-end gap-1.5 border-t border-stone-200/50 dark:border-slate-800/50">
                <button onclick="app.cycleRunSessionCount(${dIdx})" class="px-3 py-1.5 rounded-lg ${day.run.sessions > 0 ? 'bg-theme-main text-white font-bold border border-theme shadow-sm' : 'subpanel-bg border text-stone-600 dark:text-slate-400 font-semibold'} text-xs active:translate-y-0.5 transition">
                  ${day.run.sessions === 0 ? '+ Registrar' : (day.run.sessions === 1 ? '1 Sesión' : `${day.run.sessions} Sesiones`)}
                </button>
                ${day.run.sessions >= 2 ? `
                  <button onclick="app.addExtraRunSession(${dIdx})" class="px-2 py-1.5 rounded-lg subpanel-bg border border-theme-accent text-theme-accent font-bold text-xs hover:bg-theme-accent-soft active:translate-y-0.5 transition" title="Añadir otra sesión">+</button>
                ` : ''}
              </div>
            </div>
          `;
        }

        let nutriCardHtml = '';
        if (enabled.nutri) {
          nutriCardHtml = `
            <!-- Nutrición y Calorías -->
            <div class="p-3 rounded-xl subpanel-bg border space-y-2 flex flex-col justify-between h-full shadow-2xs">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <div class="vector-seal bg-theme-main text-white w-6 h-6 shadow-xs">
                    <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 17 4.5s-.5 1.5-1.6 7.2A7 7 0 0 1 11 20z"></path></svg>
                  </div>
                  <div>
                    <span class="font-bold block text-xs">Nutrición y Calorías</span>
                    <span class="text-[10px] text-stone-500 dark:text-slate-400 capitalize">Fase <strong>${w.goals.nutri?.phase || 'volumen'}</strong></span>
                  </div>
                </div>
              </div>
              <div class="flex flex-wrap items-center gap-2 flex-1 pt-0.5">
                <div class="relative flex items-center flex-1 min-w-[100px]">
                  <input type="number" step="50" min="500" max="8000" placeholder="Ej. ${w.goals.nutri?.kcal || 2800}" value="${day.nutritionKcal != null ? day.nutritionKcal : ''}" onchange="app.setDayKcal(${dIdx}, this.value)" class="w-full input-bg border rounded-lg px-2.5 py-1 text-xs font-mono font-bold outline-none focus:border-theme" />
                  <span class="absolute right-2 text-[10px] text-slate-400 font-bold pointer-events-none">kcal</span>
                </div>
                <span class="px-2.5 py-1 rounded-lg border text-[11px] font-bold ${nutriEval.badgeClass} shrink-0">
                  ${nutriEval.label}
                </span>
              </div>
              <div class="mt-auto pt-2 flex items-center justify-between border-t border-stone-200/50 dark:border-slate-800/50 text-[10px] text-stone-400">
                <span>Meta: <strong class="font-mono text-theme-main">${w.goals.nutri?.kcal || 2800} kcal</strong></span>
                <button onclick="app.cycleNutrition(${dIdx})" class="px-2.5 py-1 rounded-lg border font-bold text-xs ${day.nutrition === 'success' ? 'bg-theme-main text-white border-theme-main' : (day.nutrition === 'fail' ? 'bg-theme-accent text-white border-theme-accent' : 'subpanel-bg text-stone-500 dark:text-slate-400')} active:translate-y-0.5 transition flex items-center justify-center gap-1.5" title="Alternar estado manual">
                  ${day.nutrition === 'success' ? '<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> <span>Cumplido</span>' : (day.nutrition === 'fail' ? '<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> <span>No cumplido</span>' : '<span class="w-3.5 h-3.5 rounded border border-stone-400 dark:border-slate-500 inline-block"></span> <span>Pendiente</span>')}
                </button>
              </div>
            </div>
          `;
        }

        let academicCardHtml = '';
        if (enabled.academic) {
          academicCardHtml = `
            <!-- Asistencia Clases Hoy -->
            <div class="academic-card p-3 rounded-xl subpanel-bg border space-y-2 flex flex-col justify-between h-full shadow-2xs">
              <div class="academic-header-line flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <div class="vector-seal bg-theme-main text-white w-6 h-6 shadow-xs">
                    <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11"></path></svg>
                  </div>
                  <span class="font-bold text-xs">Clases para Hoy</span>
                </div>
                <div class="flex items-center gap-2">
                  <span class="text-[10px] text-stone-500 dark:text-slate-400 font-mono compact-hide">${(day.attendance || []).length} asignaturas</span>
                  <span class="font-mono font-bold text-theme-main text-[10px] hidden compact-inline">${Math.round(m.attPct)}% global</span>
                </div>
              </div>
              <div class="academic-classes-grid space-y-1.5 flex-1 flex flex-col justify-center">
                ${(day.attendance || []).length === 0 ? `<div class="py-2 text-stone-400 dark:text-slate-400 text-xs italic text-center compact-hide">— Sin clases programadas para hoy —</div>` : ''}
                ${(day.attendance || []).map((c, cIdx) => {
                  let badge = '<span class="flex items-center gap-1 font-mono text-[10px]"><span class="w-3 h-3 rounded border border-stone-400 dark:border-slate-500 inline-block"></span> Pendiente</span>';
                  let btnBg = 'subpanel-bg border';
                  if (c.status === 'present') { 
                    badge = '<span class="flex items-center gap-1 text-theme-main font-bold text-[10px]"><svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Asistida</span>'; 
                    btnBg = 'bg-theme-soft border-theme font-bold'; 
                  } else if (c.status === 'absent') { 
                    badge = '<span class="flex items-center gap-1 text-theme-accent font-bold text-[10px]"><svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> Falta</span>'; 
                    btnBg = 'bg-theme-accent-soft border-theme-accent font-bold'; 
                  } else if (c.status === 'holiday') { 
                    badge = '<span class="flex items-center gap-1 text-theme-main font-bold text-[10px] font-mono"><svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg> Festivo</span>'; 
                    btnBg = 'bg-theme-soft border-theme font-bold'; 
                  }
                  return `
                    <button onclick="app.cycleAttendance(${dIdx}, ${cIdx})" class="w-full p-2 rounded-xl ${btnBg} flex items-center justify-between text-xs transition active:translate-y-0.5 hover:border-theme">
                      <span class="font-bold truncate">${c.subject} <span class="text-[10px] opacity-75 font-mono">[${c.type || 'T'}]</span></span>
                      <span class="shrink-0">${badge}</span>
                    </button>
                  `;
                }).join('')}
              </div>
              <div class="academic-footer-line mt-auto pt-2 border-t border-stone-200/50 dark:border-slate-800/50 text-[10px] text-stone-400 flex items-center justify-between">
                <span>Asistencia requerida: ${w.goals.academic?.attMinPercent || 85}%</span>
                <span class="font-mono font-bold text-theme-main">${Math.round(m.attPct)}% global</span>
              </div>
            </div>
          `;
        }

        let studyCardHtml = '';
        if (enabled.study) {
          const subs = Object.entries(w.studyBySubject || {}).filter(([k, v]) => Number(v) > 0);
          const totalWeeklyStudy = w.studyRealHours.reduce((acc, h) => acc + (Number(h) || 0), 0);
          studyCardHtml = `
            <!-- Horas de Estudio de Hoy -->
            <div class="p-3 rounded-xl subpanel-bg border space-y-2 flex flex-col justify-between h-full shadow-2xs">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-2">
                  <div class="vector-seal bg-theme-main text-white w-6 h-6 shadow-xs">
                    <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 10v6M2 10l10-5 10 5-10 5z"></path><path d="M6 12v5c3 3 9 3 12 0v-5"></path></svg>
                  </div>
                  <div>
                    <span class="font-bold block text-xs">Estudio de Hoy</span>
                    <span class="text-[10px] text-stone-500 dark:text-slate-400">Plan: ${formatHoursToHMin(studyPlan)} · Semanal: ${formatHoursToHMin(totalWeeklyStudy)}</span>
                  </div>
                </div>
                <div class="flex items-center gap-1.5 shrink-0">
                  <span class="text-xs font-extrabold font-mono text-theme-main">${formatHoursToHMin(studyDone)}</span>
                  <span class="text-[9.5px] font-mono font-bold text-stone-400">(${studyPct}%)</span>
                </div>
              </div>
              <div class="h-1.5 w-full rounded-full bg-stone-300 dark:bg-slate-950 overflow-hidden border">
                <div class="h-full bg-theme-main transition-all duration-300" style="width: ${studyPct}%"></div>
              </div>
              ${subs.length > 0 ? `
                <div class="flex flex-wrap gap-1 py-0.5">
                  ${subs.slice(0, 3).map(([subName, hrs]) => `
                    <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium bg-stone-100 dark:bg-slate-900 border border-stone-200 dark:border-slate-800">
                      <span class="truncate max-w-[75px] font-semibold text-stone-700 dark:text-slate-300">${escapeHtml(subName)}</span>
                      <span class="font-mono font-bold text-theme-main">${formatHoursToHMin(hrs)}</span>
                    </span>
                  `).join('')}
                  ${subs.length > 3 ? `<span class="text-[9px] text-stone-400 self-center">+${subs.length - 3}</span>` : ''}
                </div>
              ` : '<div class="text-[10.5px] text-stone-400 italic py-0.5 compact-hide">Sin asignaturas registradas hoy</div>'}
              <div class="mt-auto pt-2 flex items-center justify-between gap-1.5 text-xs border-t border-stone-200/50 dark:border-slate-800/50">
                <button onclick="app.addStudyToDay(${dIdx}, 0.5)" class="flex-1 py-1 rounded-lg subpanel-bg border hover:border-theme font-semibold text-[11px] active:translate-y-0.5 transition">+30m</button>
                <button onclick="app.addStudyToDay(${dIdx}, 1.0)" class="flex-1 py-1 rounded-lg subpanel-bg border hover:border-theme font-semibold text-[11px] active:translate-y-0.5 transition">+1h</button>
                <button onclick="app.toggleZen(true)" class="flex-1 py-1 rounded-lg bg-theme-accent hover:bg-theme-accent text-white font-bold text-[11px] flex items-center justify-center gap-1 border border-theme-accent shadow-xs active:translate-y-0.5 transition"><span>▶</span> Pomo</button>
              </div>
            </div>
          `;
        }

        // Generar tarjetas para hábitos personalizados activos (separando métricos y recordatorios)
        const metricCustomCards = [];
        const reminderCustomCards = [];

        activeHabits.forEach(h => {
          // Si el hábito es de tipo check diario y hoy no está programado, no mostrarlo en la lista activa de hoy
          const isScheduledToday = (h.dailySlots && Array.isArray(h.dailySlots))
            ? (Number(h.dailySlots[dIdx]) > 0)
            : (Array.isArray(h.activeDays) ? h.activeDays.includes(dIdx) : true);

          if (h.type === 'binary_check' && !isScheduledToday) {
            return;
          }

          const dayVal = (habitsData[h.id] || [])[dIdx];
          let bodyHtml = '';

          if (h.type === 'max_limit') {
            const curVal = dayVal !== null && dayVal !== undefined ? Number(dayVal) : null;
            const maxDaily = Number(h.targetDaily) || 1;
            const isExceeded = curVal !== null && curVal > maxDaily;
            const badgeClass = curVal === null ? 'subpanel-bg text-stone-500' : (isExceeded ? 'bg-theme-accent-soft text-theme-accent border-theme-accent' : 'bg-theme-soft text-theme-main border-theme');
            const badgeLabel = curVal === null ? 'Sin registrar' : (isExceeded ? `Excedido (+${(curVal - maxDaily).toFixed(1)})` : 'Bajo límite (OK)');

            bodyHtml = `
              <div class="flex items-center justify-between gap-2 pt-1">
                <div class="flex items-center gap-2 flex-1">
                  <input type="number" step="0.1" placeholder="0" value="${curVal !== null ? curVal : ''}" onchange="app.setHabitDayValue(${dIdx}, '${h.id}', this.value)" class="w-20 input-bg border rounded-lg px-2 py-1 text-center font-mono font-bold text-xs" />
                  <span class="text-[10px] font-semibold text-stone-500">${h.unit || 'h'} (máx ${maxDaily})</span>
                </div>
                <span class="px-2 py-0.5 rounded-lg border text-[10px] font-bold ${badgeClass}">${badgeLabel}</span>
              </div>
            `;
          } else if (h.type === 'min_accum') {
            const curVal = dayVal !== null && dayVal !== undefined ? Number(dayVal) : 0;
            bodyHtml = `
              <div class="flex items-center justify-between gap-2 pt-1">
                <div class="flex items-center gap-2 flex-1">
                  <input type="number" step="0.5" placeholder="0" value="${curVal || ''}" onchange="app.setHabitDayValue(${dIdx}, '${h.id}', this.value)" class="w-20 input-bg border rounded-lg px-2 py-1 text-center font-mono font-bold text-xs text-theme-main" />
                  <span class="text-[10px] font-semibold text-stone-500">${h.unit || ''} hoy</span>
                </div>
                <div class="flex gap-1">
                  <button onclick="app.setHabitDayValue(${dIdx}, '${h.id}', ${(curVal + 1)})" class="px-2 py-1 rounded subpanel-bg border text-[10px] font-bold hover:border-theme">+1</button>
                  <button onclick="app.setHabitDayValue(${dIdx}, '${h.id}', ${(curVal + 5)})" class="px-2 py-1 rounded subpanel-bg border text-[10px] font-bold hover:border-theme">+5</button>
                </div>
              </div>
            `;
          } else if (h.type === 'binary_check') {
            const daySlots = (h.dailySlots && Array.isArray(h.dailySlots) && h.dailySlots[dIdx] !== undefined)
              ? Number(h.dailySlots[dIdx])
              : (Number(h.slotsCount) || 1);

            const now = new Date();
            const currentHourStr = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
            const isRealToday = isActuallyToday;

            if (daySlots <= 1) {
              const isChecked = (dayVal === true || dayVal === 1 || dayVal === 'true' || (Array.isArray(dayVal) && dayVal[0]));
              const slotHour = (h.slotLabels && h.slotLabels[0]) || h.fixedHour || '';
              const isLate = (isRealToday && slotHour && currentHourStr > slotHour && !isChecked);
              const isRem = !!h.isReminderOnly;
              const chkBtnClass = isRem
                ? (isChecked ? 'bg-theme-accent text-white border-theme-accent shadow-xs' : 'bg-white/90 dark:bg-slate-900 border-2 border-theme-accent/60 text-theme-accent font-bold hover:bg-theme-accent-soft')
                : (isChecked ? 'bg-theme-main text-white border-theme-main shadow-xs' : (isLate ? 'border-amber-500 bg-amber-500/15 text-amber-500 ring-2 ring-amber-500/50 dark:text-amber-400' : 'bg-white/90 dark:bg-slate-800 border-stone-300 dark:border-slate-600 text-stone-700 dark:text-stone-200 hover:border-theme-main shadow-2xs'));

              bodyHtml = `
                <div class="pt-1 flex items-center justify-between gap-2">
                  <div class="flex items-center gap-1.5 text-[10px] font-mono ${isLate ? 'text-amber-500 font-bold' : (isRem ? 'text-theme-accent font-semibold' : 'text-stone-400')}">
                    ${slotHour ? `<span>${isLate ? '⚠️ Atrasado (' + slotHour + ')' : '⏰ ' + slotHour}</span>` : '<span>Estado:</span>'}
                  </div>
                  <button onclick="app.toggleCustomHabitCheck('${h.id}', ${dIdx}, 0)" class="px-3 py-1.5 rounded-lg border-2 text-xs font-bold transition flex items-center gap-2 cursor-pointer ${chkBtnClass}">
                    ${isChecked ? '<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> <span>Cumplido</span>' : (isLate ? '<span class="text-[11px] font-black leading-none">!</span> <span>Pendiente</span>' : '<span class="w-3.5 h-3.5 rounded-xs border-2 border-stone-400 dark:border-slate-500 inline-block shrink-0"></span> <span>Pendiente</span>')}
                  </button>
                </div>
              `;
            } else {
              const isRem = !!h.isReminderOnly;
              bodyHtml = `
                <div class="pt-1.5 space-y-1.5">
                  <div class="text-[10px] font-bold ${isRem ? 'text-theme-accent' : 'text-stone-500'} uppercase tracking-wider">Tomas de hoy (${daySlots}):</div>
                  <div class="flex flex-wrap gap-2">
                    ${Array.from({length: daySlots}).map((_, sIdx) => {
                      const isSlotChk = Array.isArray(dayVal) ? !!dayVal[sIdx] : (sIdx === 0 && (dayVal === true || dayVal === 1));
                      const slotHour = (h.slotLabels && h.slotLabels[sIdx]) || h.fixedHour || '';
                      const isSlotLate = (isRealToday && slotHour && currentHourStr > slotHour && !isSlotChk);
                      const slotBtnClass = isRem
                        ? (isSlotChk ? 'bg-theme-accent text-white border-theme-accent shadow-xs' : 'bg-white/90 dark:bg-slate-900 border-2 border-theme-accent/60 text-theme-accent font-bold hover:bg-theme-accent-soft')
                        : (isSlotChk ? 'bg-theme-main text-white border-theme-main shadow-xs' : (isSlotLate ? 'border-amber-500 bg-amber-500/15 text-amber-500 ring-1.5 ring-amber-500/50 dark:text-amber-400' : 'bg-white/90 dark:bg-slate-800 border-stone-300 dark:border-slate-600 text-stone-700 dark:text-stone-200 hover:border-theme-main shadow-2xs'));
                      return `
                        <button type="button" onclick="app.toggleCustomHabitCheck('${h.id}', ${dIdx}, ${sIdx})" class="flex-1 min-w-[75px] py-1.5 px-2.5 rounded-lg border-2 text-[11px] font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${slotBtnClass}">
                          ${isSlotChk ? '<svg class="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' : '<span class="w-3 h-3 rounded-xs border-2 border-stone-400 dark:border-slate-500 inline-block shrink-0"></span>'}
                          <span>${slotHour || ('Toma ' + (sIdx + 1))}</span>
                        </button>
                      `;
                    }).join('')}
                  </div>
                </div>
              `;
            }
          } else if (h.type === 'target_range') {
            const curVal = dayVal !== null && dayVal !== undefined ? Number(dayVal) : null;
            const c = Number(h.targetCenter) || 0;
            const margin = Number(h.targetMargin) || 0;
            const inRange = curVal !== null && curVal >= (c - margin) && curVal <= (c + margin);
            const badgeClass = curVal === null ? 'subpanel-bg text-stone-500' : (inRange ? 'bg-theme-soft text-theme-main border-theme' : 'bg-theme-accent-soft text-theme-accent border-theme-accent');
            const badgeLabel = curVal === null ? 'Sin registrar' : (inRange ? 'En Rango (Diana)' : (curVal > (c + margin) ? 'Por encima' : 'Por debajo'));

            bodyHtml = `
              <div class="flex items-center justify-between gap-2 pt-1">
                <div class="flex items-center gap-2 flex-1">
                  <input type="number" step="0.5" placeholder="0" value="${curVal !== null ? curVal : ''}" onchange="app.setHabitDayValue(${dIdx}, '${h.id}', this.value)" class="w-20 input-bg border rounded-lg px-2 py-1 text-center font-mono font-bold text-xs" />
                  <span class="text-[10px] font-semibold text-stone-500">Diana: ${c} ± ${margin} ${h.unit || ''}</span>
                </div>
                <span class="px-2 py-0.5 rounded-lg border text-[10px] font-bold ${badgeClass}">${badgeLabel}</span>
              </div>
            `;
          }

          const isReminder = !!h.isReminderOnly;
          const cardClass = isReminder
            ? 'p-3 rounded-xl bg-theme-accent-soft border-2 border-theme-accent/60 space-y-2 flex flex-col justify-between h-full shadow-xs'
            : 'p-3 rounded-xl subpanel-bg border border-theme space-y-2 flex flex-col justify-between h-full shadow-2xs';

          const iconSealClass = isReminder
            ? 'w-6 h-6 rounded-lg bg-theme-accent text-white flex items-center justify-center shrink-0 shadow-xs'
            : 'w-6 h-6 rounded-lg subpanel-bg border border-theme text-theme-main flex items-center justify-center shrink-0 shadow-2xs';

          const iconColor = isReminder ? 'text-white' : 'text-theme-main';

          const badgeHtml = isReminder
            ? '<span class="px-1.5 py-0.5 rounded text-[8px] font-bold bg-theme-accent text-white font-mono shrink-0 uppercase tracking-wider">Recordatorio</span>'
            : '<span class="text-[8.5px] font-mono text-stone-400 font-bold uppercase shrink-0">Hábito</span>';

          const footerStatus = isReminder
            ? '<span class="font-mono font-bold text-theme-accent">Rutina</span>'
            : `<span class="font-mono font-bold text-theme-main">${Math.round(m.customHabitsPct?.[h.id] || 0)}%</span>`;

          const cardHtml = `
            <div class="${cardClass}" oncontextmenu="app.openCustomHabitActionsMenu(event, '${h.id}'); return false;">
              <div class="flex items-center justify-between gap-2">
                <div class="flex items-center gap-2 min-w-0">
                  <span class="${iconSealClass}">
                    ${renderItemIcon(h.iconId || h.icon || h.emoji || 'star', `w-3.5 h-3.5 ${iconColor}`)}
                  </span>
                  <span class="font-bold text-xs truncate text-stone-900 dark:text-white">${escapeHtml(h.name)}</span>
                </div>
                ${badgeHtml}
              </div>
              <div class="flex-1 flex flex-col justify-center py-0.5">
                ${bodyHtml}
              </div>
              <div class="mt-auto pt-2 border-t border-stone-200/50 dark:border-slate-800/50 text-[10px] text-stone-400 flex items-center justify-between">
                <span>Meta: ${h.type === 'max_limit' ? `≤${h.targetDaily}${h.unit || 'h'}` : (h.type === 'min_accum' ? `≥${h.targetWeekly}${h.unit || ''}` : (h.type === 'binary_check' ? `${h.targetWeeklyDays}d` : `~${h.targetCenter}`))}</span>
                ${footerStatus}
              </div>
            </div>
          `;

          if (isReminder) {
            reminderCustomCards.push(cardHtml);
          } else {
            metricCustomCards.push(cardHtml);
          }
        });

        const todayContainerEl = document.getElementById('todayFocusContainer');
        const isCompact = (todayContainerEl && todayContainerEl.classList.contains('card-mode-compact')) || (container && container.closest('.card-mode-compact') !== null);

        // Agrupar tarjetas en cuadrícula Bento Box adaptativa
        const todayMetricCards = [];
        if (gymCardHtml) todayMetricCards.push(gymCardHtml);
        if (runCardHtml) todayMetricCards.push(runCardHtml);
        if (academicCardHtml) todayMetricCards.push(academicCardHtml);
        if (studyCardHtml) todayMetricCards.push(studyCardHtml);
        if (nutriCardHtml) todayMetricCards.push(nutriCardHtml);
        metricCustomCards.forEach(c => todayMetricCards.push(c));

        // Integrar SIEMPRE los recordatorios directamente en la cuadrícula bento adaptativa
        // rellenando de inmediato los huecos vacíos y suprimiendo la sección separada y el hairline
        reminderCustomCards.forEach(c => todayMetricCards.push(c));

        const gridCardsHtml = todayMetricCards.map((cHtml) => {
          return `<div class="h-full flex flex-col">${cHtml}</div>`;
        }).join('');

        const progressSlot = document.getElementById('todayProgressBarSlot');
        if (progressSlot) {
          progressSlot.innerHTML = prominentProgressBarHtml;
        }

        container.innerHTML = `
          ${urgentHtml}
          ${!progressSlot ? prominentProgressBarHtml : ''}

          <!-- CUADRÍCULA UNIFORME DE HÁBITOS Y RECORDATORIOS DE HOY (ADAPTATIVA SEGÚN ANCHO) -->
          <div class="adaptive-internal-grid">
            ${gridCardsHtml || `<div class="${emptySpanClass} p-4 rounded-xl subpanel-bg border text-center text-xs text-stone-400 italic">Sin módulos ni hábitos activos para hoy</div>`}
          </div>
        `;
      }

      function renderFullWeekTable(todayDayIndex, m, streaks, headerId = 'dailyTableHeader', tbodyId = 'dailyTableBody') {
        const w = getActiveWeek();
        if (!w || !w.days) return;
        if (!m) m = calculateWeekMetrics(w);
        if (!streaks) streaks = calculateStreaks(w.weekNum);
        const dateRange = getWeekDateRange(w.weekNum);
        const enabled = getWeekEnabledModules(w);
        const activeHabits = (state.customHabits || []).filter(h => h.active !== false);
        const habitsData = w.customHabitsData || {};

        const getShortTypeName = (t) => {
          if (!t) return '';
          if (t === 'Core/Movilidad') return 'Core/Mov.';
          if (t === 'Tirada Larga') return 'T. Larga';
          if (t === 'Recuperación') return 'Recup.';
          if (t === '⚙️ Otro...') return 'Otro...';
          return t;
        };

        const theHeader = document.getElementById(headerId);
        if (theHeader) {
          theHeader.innerHTML = `
            <th class="py-1 px-0.5 text-left w-[13%] text-stone-500 dark:text-slate-400 text-[9px] uppercase font-bold tracking-wider sticky left-0 z-20 panel-bg">Hábito</th>
            ${DAYS.map((d, i) => {
              const isToday = i === todayDayIndex;
              const isPast = i < todayDayIndex;
              const thClass = isToday ? 'today-header font-bold w-[11.5%]' : (isPast ? 'past-col w-[10.5%]' : 'w-[10.5%]');
              return `
                <th class="py-0.5 px-0.2 text-center ${thClass}">
                  <div class="text-[9px] font-bold leading-tight">${d}</div>
                  <div class="text-[7.5px] text-stone-400 dark:text-slate-400 font-mono">${dateRange.daysDates[i]}</div>
                  ${isToday ? `<span class="inline-block text-[7px] bg-theme-accent text-white font-black px-0.5 rounded-full tracking-wider mt-0.5 shadow-2xs">HOY</span>` : ''}
                </th>
              `;
            }).join('')}
            <th class="py-1 px-0.5 text-center w-[13.5%] text-stone-500 dark:text-slate-400 text-[9px] uppercase font-bold tracking-wider">Progreso</th>
          `;
        }

        const tbody = document.getElementById(tbodyId);
        if (!tbody) return;
        tbody.innerHTML = '';

        // 1. Gym
        let gymHtml = `<td class="py-1.5 px-0.5 text-left font-bold sticky left-0 z-20 panel-bg w-[13%]"><div class="flex items-center gap-1"><div class="vector-seal bg-theme-main text-white w-4 h-4 shadow-xs shrink-0"><svg class="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 5v14M18 5v14M2 9v6M22 9v6M6 12h12"/></svg></div><span class="text-[11px] truncate">Gym</span></div><div class="text-[8.5px] text-stone-400 dark:text-slate-400 font-normal pl-5 truncate">${w.goals.gymSessions}s</div></td>`;
        w.days.forEach((day, dIdx) => {
          const isToday = dIdx === todayDayIndex;
          const isPast = dIdx < todayDayIndex;
          const colClass = isToday ? 'today-col w-[11.5%]' : (isPast ? 'past-col w-[10.5%]' : 'w-[10.5%]');
          const s = day.gym.sessions;

          gymHtml += `
            <td class="py-1 px-0.5 ${colClass} align-top">
              <div class="space-y-0.5">
                <div class="flex items-center gap-0.5">
                  <button onclick="app.cycleGymSessionCount(${dIdx})" class="flex-1 py-0.5 rounded text-[9px] font-bold ${s > 0 ? 'bg-theme-main text-white' : 'subpanel-bg border text-stone-500 dark:text-slate-400'}">
                    ${s === 0 ? '0' : (s === 1 ? '1ª' : `${s}ª`)}
                  </button>
                  ${s >= 2 ? `
                    <button onclick="app.addExtraGymSession(${dIdx})" class="px-1 py-0.5 rounded text-[9px] font-bold subpanel-bg border border-theme-accent text-theme-accent hover:bg-theme-accent-soft" title="Añadir otra sesión">+</button>
                  ` : ''}
                </div>
                ${s >= 1 ? `
                  <select onchange="app.handleGymTypeSelection(${dIdx}, 1, this.value)" class="w-full input-bg border rounded px-0.5 py-0.5 text-[8.5px] outline-none truncate" title="${day.gym.s1?.type || ''}">
                    ${GYM_TYPES.map(t => `<option value="${t}" ${(day.gym.s1?.type || '') === t ? 'selected' : ''}>${getShortTypeName(t)}</option>`).join('')}
                  </select>
                  ${(day.gym.s1?.type === 'Personalizado...' || (day.gym.s1?.type && day.gym.s1.type.toLowerCase().startsWith('personalizado')) || (day.gym.s1?.type && day.gym.s1.type.toLowerCase().includes('otro'))) ? `
                    <button onclick="app.openCustomMuscleModal(${dIdx}, 1, 'gym')" class="w-full py-0.5 px-1 rounded bg-theme-soft text-theme-main border border-theme text-[8px] font-bold truncate block" title="Configurar entreno personalizado">${day.gym.s1.custom || 'Configurar'}</button>
                  ` : ''}
                ` : ''}
                ${s >= 2 ? `
                  <select onchange="app.handleGymTypeSelection(${dIdx}, 2, this.value)" class="w-full input-bg border rounded px-0.5 py-0.5 text-[8.5px] text-amber-500 dark:text-amber-300 outline-none truncate" title="${day.gym.s2?.type || ''}">
                    ${GYM_TYPES.map(t => `<option value="${t}" ${(day.gym.s2?.type || '') === t ? 'selected' : ''}>2ª: ${getShortTypeName(t)}</option>`).join('')}
                  </select>
                  ${(day.gym.s2?.type === 'Personalizado...' || (day.gym.s2?.type && day.gym.s2.type.toLowerCase().startsWith('personalizado')) || (day.gym.s2?.type && day.gym.s2.type.toLowerCase().includes('otro'))) ? `
                    <button onclick="app.openCustomMuscleModal(${dIdx}, 2, 'gym')" class="w-full py-0.5 px-1 rounded bg-theme-accent-soft text-theme-accent border border-theme-accent text-[8px] font-bold truncate block" title="Configurar entreno personalizado">${day.gym.s2.custom || 'Configurar'}</button>
                  ` : ''}
                ` : ''}
              </div>
            </td>
          `;
        });
        gymHtml += `
          <td class="py-1.5 px-0.5 text-center align-middle w-[13.5%]">
            ${renderProgressCell(m.gymPct, `${m.gymReal}/${w.goals.gymSessions}s`, streaks.gym)}
          </td>
        `;

        // 2. Running
        let runHtml = `<td class="py-1.5 px-0.5 text-left font-bold sticky left-0 z-20 panel-bg w-[13%]"><div class="flex items-center gap-1"><div class="vector-seal bg-theme-main text-white w-4 h-4 shadow-xs shrink-0"><svg class="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"></path></svg></div><span class="text-[11px] truncate">Run</span></div><div class="text-[8.5px] text-stone-400 dark:text-slate-400 font-normal pl-5 truncate">${w.goals.runKm}k</div></td>`;
        w.days.forEach((day, dIdx) => {
          const isToday = dIdx === todayDayIndex;
          const isPast = dIdx < todayDayIndex;
          const colClass = isToday ? 'today-col w-[11.5%]' : (isPast ? 'past-col w-[10.5%]' : 'w-[10.5%]');
          const s = day.run.sessions;
          const km1 = Number(day.run.s1?.km) || 0;
          const km2 = Number(day.run.s2?.km) || 0;
          const dayKmTotal = s >= 2 ? (km1 + km2) : (km1 || Number(day.run.km) || 0);

          runHtml += `
            <td class="py-1 px-0.5 ${colClass} align-top">
              <div class="space-y-0.5">
                <div class="flex items-center gap-0.5">
                  <button onclick="app.cycleRunSessionCount(${dIdx})" class="flex-1 py-0.5 rounded text-[9px] font-bold ${s > 0 ? 'bg-theme-main text-white' : 'subpanel-bg border text-stone-500 dark:text-slate-400'}">
                    ${s === 0 ? '0' : (s === 1 ? '1ª' : `${s}ª`)}
                  </button>
                  ${s >= 2 ? `
                    <button onclick="app.addExtraRunSession(${dIdx})" class="px-1 py-0.5 rounded text-[9px] font-bold subpanel-bg border border-theme-accent text-theme-accent hover:bg-theme-accent-soft" title="Añadir otra sesión">+</button>
                  ` : ''}
                </div>
                ${s >= 1 ? `
                  <div class="space-y-0.5">
                    <input type="number" step="0.5" placeholder="Km" value="${day.run.s1?.km !== undefined ? day.run.s1.km : (day.run.km || '')}" onchange="app.setRunSessionKm(${dIdx}, 1, this.value)" class="w-full input-bg border rounded px-0.5 py-0.5 text-center text-[9px] font-mono text-emerald-600 dark:text-emerald-400 font-bold" title="Km 1ª sesión" />
                    <select onchange="app.setRunType(${dIdx}, 1, this.value)" class="w-full input-bg border rounded px-0.5 py-0.5 text-[8.5px] outline-none truncate" title="${day.run.s1?.type || ''}">
                      ${RUN_TYPES.map(t => `<option value="${t}" ${(day.run.s1?.type || '') === t ? 'selected' : ''}>${getShortTypeName(t)}</option>`).join('')}
                    </select>
                    ${(day.run.s1?.type === 'Personalizado...' || (day.run.s1?.type && day.run.s1.type.toLowerCase().startsWith('personalizado')) || (day.run.s1?.type && day.run.s1.type.toLowerCase().includes('otro'))) ? `
                      <button onclick="app.openCustomRunModal(${dIdx}, 1)" class="w-full py-0.5 px-1 rounded bg-theme-soft text-theme-main border border-theme text-[8px] font-bold truncate block" title="Configurar running personalizado">${day.run.s1.custom || 'Configurar'}</button>
                    ` : ''}
                  </div>
                ` : ''}
                ${s >= 2 ? `
                  <div class="space-y-0.5 pt-0.5 border-t border-stone-200 dark:border-slate-700/60">
                    <div class="text-[7.5px] font-bold text-amber-500 dark:text-amber-400 text-center">2ª Sesión:</div>
                    <input type="number" step="0.5" placeholder="Km 2ª" value="${day.run.s2?.km !== undefined ? day.run.s2.km : ''}" onchange="app.setRunSessionKm(${dIdx}, 2, this.value)" class="w-full input-bg border rounded px-0.5 py-0.5 text-center text-[9px] font-mono text-amber-600 dark:text-amber-400 font-bold" title="Km 2ª sesión" />
                    <select onchange="app.setRunType(${dIdx}, 2, this.value)" class="w-full input-bg border rounded px-0.5 py-0.5 text-[8.5px] text-amber-600 dark:text-amber-300 outline-none truncate" title="${day.run.s2?.type || ''}">
                      ${RUN_TYPES.map(t => `<option value="${t}" ${(day.run.s2?.type || '') === t ? 'selected' : ''}>2ª: ${getShortTypeName(t)}</option>`).join('')}
                    </select>
                    ${(day.run.s2?.type === 'Personalizado...' || (day.run.s2?.type && day.run.s2.type.toLowerCase().startsWith('personalizado')) || (day.run.s2?.type && day.run.s2.type.toLowerCase().includes('otro'))) ? `
                      <button onclick="app.openCustomRunModal(${dIdx}, 2)" class="w-full py-0.5 px-1 rounded bg-theme-accent-soft text-theme-accent border border-theme-accent text-[8px] font-bold truncate block" title="Configurar running personalizado">${day.run.s2.custom || 'Configurar'}</button>
                    ` : ''}
                    <div class="text-[8.5px] font-mono font-bold text-blue-600 dark:text-blue-300 text-center">∑ ${dayKmTotal.toFixed(1)}k</div>
                  </div>
                ` : ''}
              </div>
            </td>
          `;
        });
        runHtml += `
          <td class="py-1.5 px-0.5 text-center align-middle w-[13.5%]">
            ${renderProgressCell(m.runPct, `${m.runKmReal.toFixed(1)}k`, streaks.run)}
          </td>
        `;

        // 3. Estudio
        let studyHtml = `<td class="py-1.5 px-0.5 text-left font-bold sticky left-0 z-20 panel-bg w-[13%]"><div class="flex items-center gap-1"><div class="vector-seal bg-theme-main text-white w-4 h-4 shadow-xs shrink-0"><svg class="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 10v6M2 10l10-5 10 5-10 5z"></path><path d="M6 12v5c3 3 9 3 12 0v-5"></path></svg></div><span class="text-[11px] truncate">Estudio</span></div><div class="text-[8.5px] text-stone-400 dark:text-slate-400 font-normal pl-5 truncate">Plan/Real</div></td>`;
        w.days.forEach((day, dIdx) => {
          const isToday = dIdx === todayDayIndex;
          const isPast = dIdx < todayDayIndex;
          const colClass = isToday ? 'today-col w-[11.5%]' : (isPast ? 'past-col w-[10.5%]' : 'w-[10.5%]');
          studyHtml += `
            <td class="py-1 px-0.5 ${colClass} align-top">
              <div class="space-y-0.5">
                <span class="text-[8.5px] text-stone-500 dark:text-slate-400 block">${Number(w.studyHoursPlan[dIdx]||0).toFixed(1)}h</span>
                <input type="number" step="0.5" value="${Number(w.studyRealHours[dIdx])||''}" placeholder="0.0" onchange="app.setDailyStudyReal(${dIdx}, this.value)" class="w-full input-bg border rounded px-0.5 py-0.5 text-center font-mono font-bold text-[9px]" />
                <div class="flex justify-center gap-0.5">
                  <button onclick="app.addStudyToDay(${dIdx}, 0.5)" class="flex-1 py-0.5 rounded subpanel-bg text-[7.5px] font-bold hover:border-theme transition">+0.5</button>
                  <button onclick="app.addStudyToDay(${dIdx}, 1)" class="flex-1 py-0.5 rounded subpanel-bg text-[7.5px] font-bold hover:border-theme transition">+1h</button>
                </div>
              </div>
            </td>
          `;
        });
        studyHtml += `
          <td class="py-1.5 px-0.5 text-center align-middle w-[13.5%]">
            ${renderProgressCell(m.studyPct, `${formatHoursToHMin(m.studyReal)}`, streaks.study)}
          </td>
        `;

        // 4. Asistencia
        let attHtml = `<td class="py-1.5 px-0.5 text-left font-bold sticky left-0 z-20 panel-bg w-[13%]"><div class="flex items-center gap-1"><div class="vector-seal bg-theme-main text-white w-4 h-4 shadow-xs shrink-0"><svg class="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11"></path></svg></div><span class="text-[11px] truncate">Clases</span></div><div class="text-[8.5px] text-stone-400 dark:text-slate-400 font-normal pl-5 truncate">${w.goals.academic?.attMinPercent || 85}%</div></td>`;
        w.days.forEach((day, dIdx) => {
          const isToday = dIdx === todayDayIndex;
          const isPast = dIdx < todayDayIndex;
          const colClass = isToday ? 'today-col w-[11.5%]' : (isPast ? 'past-col w-[10.5%]' : 'w-[10.5%]');
          const classes = day.attendance || [];
          attHtml += `
            <td class="py-1 px-0.5 ${colClass} align-top">
              <div class="space-y-0.5">
                ${classes.length === 0 ? `<span class="text-[8.5px] text-slate-400 block py-0.5">—</span>` : ''}
                ${classes.map((c, cIdx) => {
                  let badge = '<span class="w-2 h-2 rounded-xs border border-stone-400 dark:border-slate-500 inline-block"></span>';
                  let btnBg = 'subpanel-bg border';
                  if (c.status === 'present') { 
                     badge = '<svg class="w-2.5 h-2.5 text-theme-main" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>'; 
                     btnBg = 'bg-theme-soft border-theme text-theme-main font-bold'; 
                  } else if (c.status === 'absent') { 
                     badge = '<svg class="w-2.5 h-2.5 text-theme-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'; 
                     btnBg = 'bg-theme-accent-soft border-theme-accent text-theme-accent font-bold'; 
                  } else if (c.status === 'holiday') { 
                     badge = '<svg class="w-2.5 h-2.5 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>'; 
                     btnBg = 'bg-amber-500/10 border-amber-500/40 text-amber-500 font-bold'; 
                  }
                  return `
                    <button onclick="app.cycleAttendance(${dIdx}, ${cIdx})" class="w-full text-left p-0.5 rounded border text-[8px] flex items-center justify-between gap-0.5 ${btnBg} truncate transition active:translate-y-0.5 hover:border-theme" title="${c.subject}">
                      <span class="truncate">${c.subject}</span>
                      <span class="shrink-0 flex items-center justify-center">${badge}</span>
                    </button>
                  `;
                }).join('')}
              </div>
            </td>
          `;
        });
        attHtml += `
          <td class="py-1.5 px-0.5 text-center align-middle w-[13.5%]">
            ${renderProgressCell(m.attPct, `${Math.round(m.attPct)}%`, streaks.att)}
          </td>
        `;

        // 5. Nutrición
        const curNutriMargin = w.goals.nutri?.margin || 150;
        let nutriHtml = `<td class="py-1.5 px-0.5 text-left font-bold sticky left-0 z-20 panel-bg w-[13%]"><div class="flex items-center gap-1"><div class="vector-seal bg-theme-main text-white w-4 h-4 shadow-xs shrink-0"><svg class="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 17 4.5s-.5 1.5-1.6 7.2A7 7 0 0 1 11 20z"></path></svg></div><span class="text-[11px] truncate">Nutri</span></div><div class="text-[8.5px] text-stone-400 dark:text-slate-400 font-normal pl-5 truncate">${w.goals.nutri?.minDays || 6}d</div></td>`;
        w.days.forEach((day, dIdx) => {
          const isToday = dIdx === todayDayIndex;
          const isPast = dIdx < todayDayIndex;
          const colClass = isToday ? 'today-col w-[11.5%]' : (isPast ? 'past-col w-[10.5%]' : 'w-[10.5%]');
          const ev = evalNutritionStatus(day.nutritionKcal, w.goals.nutri?.kcal, w.goals.nutri?.phase, curNutriMargin);
          let badgeIcon = '<span class="w-2 h-2 rounded-xs border border-stone-400 dark:border-slate-500 inline-block"></span>';
          if (ev.status !== 'pending') {
            badgeIcon = ev.score >= 0.8 
              ? '<svg class="w-2.5 h-2.5 text-theme-main" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>' 
              : '<svg class="w-2.5 h-2.5 text-theme-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
          }
          const diffText = ev.status === 'pending' ? '—' : (ev.diff > 0 ? `+${ev.diff}` : `${ev.diff}`);

          nutriHtml += `
            <td class="py-1 px-0.5 ${colClass} align-top text-center">
              <div class="space-y-0.5">
                <input type="number" step="50" min="500" max="8000" placeholder="Kcal" value="${day.nutritionKcal != null ? day.nutritionKcal : ''}" onchange="app.setDayKcal(${dIdx}, this.value)" class="w-full input-bg border rounded px-0.5 py-0.5 text-center font-mono font-bold text-[9px] outline-none focus:border-theme" title="Escribir Kcal consumidas hoy" />
                <button type="button" onclick="app.cycleNutrition(${dIdx})" class="w-full py-0.5 rounded border text-[8px] flex items-center justify-center gap-1 ${ev.badgeClass}" title="${ev.label} (Clic para alternar estado)">
                  <span class="flex items-center justify-center">${badgeIcon}</span>
                  <span class="font-mono text-[7.5px] font-bold">${diffText}</span>
                </button>
              </div>
            </td>
          `;
        });
        const validNutriDays = w.days.filter(d => (d.nutritionScore !== undefined ? d.nutritionScore >= 0.8 : d.nutrition === 'success')).length;
        nutriHtml += `
          <td class="py-1.5 px-0.5 text-center align-middle w-[13.5%]">
            ${renderProgressCell(m.nutriPct, `${validNutriDays}/${w.goals.nutri?.minDays || 6}d`, streaks.nutri)}
          </td>
        `;

        // 6. Gasto Día
        let spendHtml = `<td class="py-1.5 px-0.5 text-left font-bold sticky left-0 z-20 panel-bg w-[13%]"><div class="flex items-center gap-1"><div class="vector-seal bg-theme-main text-white w-4 h-4 shadow-xs shrink-0"><svg class="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"></rect><line x1="2" y1="10" x2="22" y2="10"></line></svg></div><span class="text-[11px] truncate">Gasto</span></div><div class="text-[8.5px] text-stone-400 dark:text-slate-400 font-normal pl-5 truncate">Suma €</div></td>`;
        w.days.forEach((_, dIdx) => {
          const isToday = dIdx === todayDayIndex;
          const isPast = dIdx < todayDayIndex;
          const colClass = isToday ? 'today-col w-[11.5%]' : (isPast ? 'past-col w-[10.5%]' : 'w-[10.5%]');
          const daySpend = w.expenses.filter(e => Number(e.dayIndex) === dIdx).reduce((a, b) => a + Number(b.amount), 0);
          spendHtml += `<td class="py-1 px-0.5 ${colClass} align-middle font-mono font-bold text-[10px]">${daySpend > 0 ? `${daySpend.toFixed(1)}€` : '—'}</td>`;
        });
        spendHtml += `
          <td class="py-1.5 px-0.5 text-center align-middle w-[13.5%]">
            ${renderProgressCell(m.finPct, `${m.spent.toFixed(1)}€`, streaks.fin)}
          </td>
        `;

        let rowsHtml = '';
        if (enabled.gym) rowsHtml += `<tr>${gymHtml}</tr>`;
        if (enabled.run) rowsHtml += `<tr>${runHtml}</tr>`;
        if (enabled.study) rowsHtml += `<tr>${studyHtml}</tr>`;
        if (enabled.academic) rowsHtml += `<tr>${attHtml}</tr>`;
        if (enabled.nutri) rowsHtml += `<tr>${nutriHtml}</tr>`;
        if (enabled.budget) rowsHtml += `<tr>${spendHtml}</tr>`;

        const metricHabits = activeHabits.filter(h => !h.isReminderOnly);
        const reminderHabits = activeHabits.filter(h => !!h.isReminderOnly);

        function buildHabitRowHtml(h) {
          const isReminder = !!h.isReminderOnly;
          const borderLClass = isReminder ? 'border-l-3 border-l-amber-500 pl-1.5' : 'border-l-3 border-l-theme-main pl-1.5';
          const iconColorClass = isReminder ? 'text-amber-500' : 'text-theme-main';

          let hRow = `<td class="py-1.5 px-0.5 text-left font-bold sticky left-0 z-20 panel-bg w-[13%] ${borderLClass}">
            <div class="flex items-center gap-1">
              <span class="w-4 h-4 rounded subpanel-bg flex items-center justify-center ${iconColorClass} shrink-0">
                ${renderItemIcon(h.iconId || h.icon || h.emoji || 'star', `w-3 h-3 ${iconColorClass}`)}
              </span>
              <span class="text-[11px] truncate">${escapeHtml(h.name)}</span>
            </div>
            <div class="text-[8.5px] text-stone-400 dark:text-slate-400 font-normal pl-5 truncate flex items-center gap-1">
              <span>${h.type === 'max_limit' ? `≤${h.targetDaily}${h.unit || 'h'}` : (h.type === 'min_accum' ? `≥${h.targetWeekly}${h.unit || ''}` : (h.type === 'binary_check' ? `${h.targetWeeklyDays}d` : `~${h.targetCenter}`))}</span>
              ${isReminder ? '<span class="text-[7.5px] text-amber-500 font-mono font-bold">(rec)</span>' : ''}
            </div>
          </td>`;

          const rawDays = habitsData[h.id] || [null, null, null, null, null, null, null];
          w.days.forEach((_, dIdx) => {
            const isToday = dIdx === todayDayIndex;
            const isPast = dIdx < todayDayIndex;
            const colClass = isToday ? 'today-col w-[11.5%]' : (isPast ? 'past-col w-[10.5%]' : 'w-[10.5%]');
            const val = rawDays[dIdx];

            if (h.type === 'max_limit') {
              const cur = val !== null && val !== undefined ? Number(val) : '';
              const isOver = cur !== '' && Number(cur) > Number(h.targetDaily);
              hRow += `
                <td class="py-1 px-0.5 ${colClass} align-middle text-center">
                  <input type="number" step="0.1" placeholder="—" value="${cur}" onchange="app.setHabitDayValue(${dIdx}, '${h.id}', this.value)" class="w-full input-bg border rounded px-0.5 py-0.5 text-center font-mono font-bold text-[9px] ${isOver ? 'text-theme-accent border-theme-accent' : ''}" />
                </td>
              `;
            } else if (h.type === 'min_accum') {
              const cur = val !== null && val !== undefined ? Number(val) : '';
              hRow += `
                <td class="py-1 px-0.5 ${colClass} align-middle text-center">
                  <input type="number" step="0.5" placeholder="—" value="${cur}" onchange="app.setHabitDayValue(${dIdx}, '${h.id}', this.value)" class="w-full input-bg border rounded px-0.5 py-0.5 text-center font-mono font-bold text-[9px]" />
                </td>
              `;
            } else if (h.type === 'binary_check') {
              const isScheduledDay = (h.dailySlots && Array.isArray(h.dailySlots))
                ? (Number(h.dailySlots[dIdx]) > 0)
                : (Array.isArray(h.activeDays) ? h.activeDays.includes(dIdx) : true);

              if (!isScheduledDay) {
                hRow += `
                  <td class="py-1 px-0.5 ${colClass} align-middle text-center">
                    <span class="text-stone-400 dark:text-slate-500 font-mono text-xs font-semibold select-none">—</span>
                  </td>
                `;
              } else {
                const daySlots = (h.dailySlots && Array.isArray(h.dailySlots) && h.dailySlots[dIdx] !== undefined)
                  ? Number(h.dailySlots[dIdx])
                  : (Number(h.slotsCount) || 1);

                const now = new Date();
                const currentHourStr = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
                const isRealToday = isToday && !isWeekOverdue(w.weekNum);

                if (daySlots <= 1) {
                  const isChk = (val === true || val === 1 || val === 'true' || (Array.isArray(val) && val[0]));
                  const slotHour = (h.slotLabels && h.slotLabels[0]) || h.fixedHour || '';
                  const isLate = (isRealToday && slotHour && currentHourStr > slotHour && !isChk);

                  hRow += `
                    <td class="py-1 px-0.5 ${colClass} align-middle text-center">
                      <button type="button" onclick="app.toggleCustomHabitCheck('${h.id}', ${dIdx}, 0)" class="w-6 h-6 min-w-[24px] min-h-[24px] max-w-[24px] max-h-[24px] mx-auto rounded-md border-2 flex items-center justify-center shrink-0 aspect-square transition active:scale-90 cursor-pointer ${isChk ? 'bg-theme-main text-white border-theme-main shadow-xs' : (isLate ? 'border-amber-500 bg-amber-500/20 text-amber-500 ring-2 ring-amber-500/50 dark:text-amber-400' : 'bg-white/90 dark:bg-slate-800 border-stone-400 dark:border-slate-500 text-stone-400 hover:border-theme-main hover:bg-stone-50 dark:hover:bg-slate-700 shadow-2xs')}" title="${slotHour ? 'Hora: ' + slotHour + (isLate ? ' (Atrasado)' : '') : (isChk ? 'Completado' : 'Pendiente')}">
                        ${isChk ? '<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' : (isLate ? '<span class="text-[11px] font-black leading-none">!</span>' : '')}
                      </button>
                    </td>
                  `;
                } else {
                  const slotBtnSize = daySlots > 2 
                    ? 'w-[18px] h-[18px] min-w-[18px] min-h-[18px] max-w-[18px] max-h-[18px] rounded-xs' 
                    : 'w-[20px] h-[20px] min-w-[20px] min-h-[20px] max-w-[20px] max-h-[20px] rounded';

                  hRow += `
                    <td class="py-1 px-0.5 ${colClass} align-middle text-center">
                      <div class="flex items-center justify-center gap-1.5 flex-nowrap py-0.5">
                        ${Array.from({length: daySlots}).map((_, sIdx) => {
                          const isSlotChk = Array.isArray(val) ? !!val[sIdx] : (sIdx === 0 && (val === true || val === 1));
                          const slotHour = (h.slotLabels && h.slotLabels[sIdx]) || h.fixedHour || '';
                          const isSlotLate = (isRealToday && slotHour && currentHourStr > slotHour && !isSlotChk);
                          return `
                            <button type="button" onclick="app.toggleCustomHabitCheck('${h.id}', ${dIdx}, ${sIdx})" class="${slotBtnSize} border-2 flex items-center justify-center shrink-0 aspect-square transition active:scale-90 cursor-pointer ${isSlotChk ? 'bg-theme-main text-white border-theme-main shadow-xs' : (isSlotLate ? 'border-amber-500 bg-amber-500/20 text-amber-500 ring-1.5 ring-amber-500/50 dark:text-amber-400' : 'bg-white/90 dark:bg-slate-800 border-stone-400 dark:border-slate-500 text-stone-400 hover:border-theme-main hover:bg-stone-50 dark:hover:bg-slate-700 shadow-2xs')}" title="${slotHour ? 'Hora: ' + slotHour + (isSlotLate ? ' (Atrasado)' : '') : 'Toma ' + (sIdx+1)}">
                              ${isSlotChk ? '<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' : (isSlotLate ? '<span class="text-[9px] font-black leading-none">!</span>' : '')}
                            </button>
                          `;
                        }).join('')}
                      </div>
                    </td>
                  `;
                }
              }
            } else if (h.type === 'target_range') {
              const cur = val !== null && val !== undefined ? Number(val) : '';
              const inRange = cur !== '' && Math.abs(Number(cur) - Number(h.targetCenter)) <= Number(h.targetMargin);
              hRow += `
                <td class="py-1 px-0.5 ${colClass} align-middle text-center">
                  <input type="number" step="0.5" placeholder="—" value="${cur}" onchange="app.setHabitDayValue(${dIdx}, '${h.id}', this.value)" class="w-full input-bg border rounded px-0.5 py-0.5 text-center font-mono font-bold text-[9px] ${cur !== '' ? (inRange ? 'text-theme-main border-theme' : 'text-theme-accent border-theme-accent') : ''}" />
                </td>
              `;
            }
          });

          // Celda de progreso semanal
          const hPct = m.customHabitsPct ? (m.customHabitsPct[h.id] || 0) : 0;
          let summaryLabel = `${Math.round(hPct)}%`;
          if (h.type === 'max_limit') {
            const sum = rawDays.reduce((acc, v) => acc + (v !== null && !isNaN(v) ? Number(v) : 0), 0);
            summaryLabel = `${sum.toFixed(1)}/${h.targetWeekly}${h.unit || 'h'}`;
          } else if (h.type === 'min_accum') {
            const sum = rawDays.reduce((acc, v) => acc + (v !== null && !isNaN(v) ? Number(v) : 0), 0);
            summaryLabel = `${sum.toFixed(1)}/${h.targetWeekly}${h.unit || ''}`;
          } else if (h.type === 'binary_check') {
            const cnt = rawDays.filter(v => v === true || v === 1 || v === 'true').length;
            summaryLabel = `${cnt}/${h.targetWeeklyDays}d`;
          } else if (h.type === 'target_range') {
            const c = Number(h.targetCenter) || 0, mg = Number(h.targetMargin) || 0;
            const cnt = rawDays.filter(v => v !== null && !isNaN(v) && Number(v) >= (c - mg) && Number(v) <= (c + mg)).length;
            summaryLabel = `${cnt}/${h.targetWeeklyDays}d`;
          }

          if (isReminder) {
            hRow += `
              <td class="py-1.5 px-0.5 text-center align-middle w-[13.5%]">
                <div class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9.5px] font-mono font-bold bg-stone-200/60 dark:bg-slate-800/80 text-stone-600 dark:text-stone-300 border border-stone-300/80 dark:border-slate-700">
                  <span>${summaryLabel}</span>
                </div>
                <div class="text-[7.5px] text-amber-500 font-bold uppercase tracking-wider mt-0.5">Recordatorio</div>
              </td>
            `;
          } else {
            hRow += `
              <td class="py-1.5 px-0.5 text-center align-middle w-[13.5%]">
                ${renderProgressCell(hPct, summaryLabel, null)}
              </td>
            `;
          }

          return `<tr class="border-b border-black/5 dark:border-white/5 ${isReminder ? 'bg-amber-500/[0.015] hover:bg-amber-500/[0.035]' : 'bg-theme-main/[0.015] hover:bg-theme-main/[0.04]'} transition-colors">${hRow}</tr>`;
        }

        // 1. Hábitos métricos: juntos directamente con los módulos base sin cabecera separadora
        metricHabits.forEach(h => {
          rowsHtml += buildHabitRowHtml(h);
        });

        // 2. Solo los recordatorios (que no aportan a estadísticas) se separan con su propia fila divisoria
        if (reminderHabits.length > 0) {
          rowsHtml += `
            <tr class="border-t-2 border-dashed border-stone-300 dark:border-slate-700/80 bg-stone-100/60 dark:bg-slate-800/50">
              <td colspan="9" class="py-1.5 px-2.5 text-left font-bold text-[9px] tracking-wider text-amber-500 uppercase">
                <div class="flex items-center gap-1.5">
                  <span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                  <span>Recordatorios & Tareas Rutinarias (Sin impacto en Score)</span>
                </div>
              </td>
            </tr>
          `;
          reminderHabits.forEach(h => {
            rowsHtml += buildHabitRowHtml(h);
          });
        }

        tbody.innerHTML = rowsHtml || `<tr><td colspan="9" class="py-4 text-center text-xs text-stone-400 italic">No hay módulos ni hábitos activos. Activa alguno en Metas y Horario.</td></tr>`;
      }

      function renderQuickExpensesUI() {
        const w = getActiveWeek();
        const chipsEl = document.getElementById('quickExpenseChips');
        if (chipsEl) {
          chipsEl.innerHTML = (state.dictionary.frequentConcepts || []).map(c => `
            <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg subpanel-bg border text-xs">
              <button onclick="app.fillQuickConcept('${c}')" class="font-medium">${c}</button>
              <button onclick="app.removeFrequentConcept('${c}')" class="text-slate-400 hover:text-rose-400 font-bold ml-1">✕</button>
            </span>
          `).join('');
        }

        const catSelect = document.getElementById('quickCategory');
        if (catSelect) {
          catSelect.innerHTML = (state.financeSettings.customCategories || []).map(c => `<option value="${c.emoji} ${c.name}">${c.emoji} ${c.name}</option>`).join('');
        }

        const daySelect = document.getElementById('quickDaySelect');
        if (daySelect) {
          const todayIdx = (new Date().getDay() + 6) % 7;
          daySelect.innerHTML = DAYS.map((d, i) => `<option value="${i}" ${i === todayIdx ? 'selected' : ''}>${d}</option>`).join('');
        }

        const recentBox = document.getElementById('quickRecentExpenses');
        if (recentBox) {
          const recentExpenses = [...w.expenses].reverse().slice(0, 5);
          if (recentExpenses.length === 0) {
            recentBox.innerHTML = `<span class="text-[11px] text-stone-400 dark:text-slate-500 italic block py-2 text-center">Sin movimientos registrados esta semana.</span>`;
          } else {
            recentBox.innerHTML = recentExpenses.map(e => {
              const emoji = (e.category || '📦').split(' ')[0] || '📦';
              const cleanCategory = (e.category || '').replace(/^[^\s]+\s*/, '');
              return `
                <div data-expense-id="${e.id}" oncontextmenu="app.openExpenseActionsMenu(event, '${e.id}'); return false;" class="hairline-row flex items-center justify-between text-xs py-1.5 px-1 hover:bg-stone-200/40 dark:hover:bg-slate-800/40 rounded-lg transition cursor-pointer">
                  <div class="flex items-center gap-2 truncate min-w-0">
                    <span class="px-1.5 py-0.5 rounded font-mono font-bold text-[10px] bg-stone-200 dark:bg-slate-800 text-stone-700 dark:text-slate-300 border border-stone-300 dark:border-slate-700 shrink-0">${DAYS[e.dayIndex] || 'LUN'}</span>
                    <span class="emoji-sticker text-[11px] shrink-0">${emoji}</span>
                    <span class="font-bold text-stone-900 dark:text-white truncate">${escapeHtml(e.concept)}</span>
                    ${cleanCategory ? `<span class="text-[10px] text-stone-400 dark:text-slate-500 truncate hidden sm:inline">• ${cleanCategory}</span>` : ''}
                  </div>
                  <div class="flex items-center gap-2.5 shrink-0 ml-2">
                    <span class="font-mono font-extrabold text-theme-accent">${Number(e.amount).toFixed(2)} €</span>
                    <div class="hairline-actions flex items-center gap-1">
                      <button onclick="app.openEditExpenseModal('${e.id}')" class="p-1 rounded text-stone-400 hover:text-theme-main transition" title="Editar gasto">
                        <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      </button>
                      <button onclick="app.deleteExpense('${e.id}')" class="p-1 rounded text-stone-400 hover:text-rose-400 transition" title="Eliminar gasto">✕</button>
                      <button type="button" onclick="app.openExpenseActionsMenu(event, '${e.id}')" oncontextmenu="app.openExpenseActionsMenu(event, '${e.id}'); return false;" class="w-6 h-6 rounded-lg subpanel-bg border border-stone-300/60 dark:border-slate-700/60 hover:border-theme-main text-stone-600 dark:text-slate-300 hover:text-stone-900 dark:hover:text-white flex items-center justify-center font-bold text-xs transition shadow-xs" title="Más opciones">•••</button>
                    </div>
                  </div>
                </div>
              `;
            }).join('');
          }
        }
        renderDockExpenseUI();
      }

      function findLearnedCategoryForConcept(concept) {
        if (!concept || !concept.trim()) return null;
        const norm = concept.trim().toLowerCase();
        const counts = {};
        Object.values(state.weeks || {}).forEach(w => {
          (w?.expenses || []).forEach(e => {
            const cNorm = (e.concept || '').trim().toLowerCase();
            if (cNorm === norm && e.category) {
              const cat = e.category.trim();
              counts[cat] = (counts[cat] || 0) + 1;
            }
          });
        });

        // Si no hay coincidencia exacta, buscar si algún gasto previo contiene la palabra o viceversa
        if (Object.keys(counts).length === 0) {
          Object.values(state.weeks || {}).forEach(w => {
            (w?.expenses || []).forEach(e => {
              const cNorm = (e.concept || '').trim().toLowerCase();
              if (cNorm && e.category && (cNorm.includes(norm) || norm.includes(cNorm))) {
                const cat = e.category.trim();
                counts[cat] = (counts[cat] || 0) + 1;
              }
            });
          });
        }

        let bestCat = null;
        let maxCount = 0;
        for (const [cat, cnt] of Object.entries(counts)) {
          if (cnt > maxCount) {
            maxCount = cnt;
            bestCat = cat;
          }
        }
        return bestCat;
      }

      function applyLearnedCategoryToSelect(selectEl, learnedCat) {
        if (!selectEl || !learnedCat) return false;
        const learnedClean = learnedCat.replace(/^[^\s]+\s*/, '').trim().toLowerCase();
        const learnedFull = learnedCat.trim().toLowerCase();

        for (let i = 0; i < selectEl.options.length; i++) {
          const opt = selectEl.options[i];
          const optVal = opt.value.trim().toLowerCase();
          const optText = opt.textContent.trim().toLowerCase();
          const optClean = optVal.replace(/^[^\s]+\s*/, '').trim();

          if (optVal === learnedFull || optText === learnedFull || optClean === learnedClean || optVal.includes(learnedClean) || learnedClean.includes(optClean)) {
            selectEl.selectedIndex = i;
            return true;
          }
        }
        return false;
      }

      function getMatchingExpenseConcepts(query = '') {
        const allConceptsMap = new Map();
        (state.dictionary?.frequentConcepts || []).forEach(c => {
          if (c && c.trim()) {
            const trimmed = c.trim();
            const key = trimmed.toLowerCase();
            if (!allConceptsMap.has(key)) allConceptsMap.set(key, { concept: trimmed, category: null });
          }
        });
        Object.values(state.weeks || {}).forEach(w => {
          (w?.expenses || []).forEach(e => {
            if (e.concept && e.concept.trim()) {
              const trimmed = e.concept.trim();
              const key = trimmed.toLowerCase();
              const cat = e.category || null;
              if (!allConceptsMap.has(key)) {
                allConceptsMap.set(key, { concept: trimmed, category: cat });
              } else if (cat && !allConceptsMap.get(key).category) {
                allConceptsMap.get(key).category = cat;
              }
            }
          });
        });
        const allConcepts = Array.from(allConceptsMap.values());
        const q = (query || '').trim().toLowerCase();
        return q ? allConcepts.filter(item => item.concept.toLowerCase().includes(q)) : allConcepts.slice(0, 10);
      }

      function renderDockExpenseUI(filterQuery = '') {
        const catSelect = document.getElementById('dockExpenseCategory');
        if (catSelect) {
          catSelect.innerHTML = (state.financeSettings.customCategories || []).map(c => `<option value="${c.emoji} ${c.name}">${c.emoji} ${c.name}</option>`).join('');
        }
        const daySelect = document.getElementById('dockExpenseDay');
        if (daySelect) {
          const todayIdx = (new Date().getDay() + 6) % 7;
          daySelect.innerHTML = DAYS.map((d, i) => `<option value="${i}" ${i === todayIdx ? 'selected' : ''}>${d}</option>`).join('');
        }
        const chipsBox = document.getElementById('dockExpenseChips');
        if (chipsBox) {
          const filtered = getMatchingExpenseConcepts(filterQuery);
          const q = (filterQuery || '').trim();

          if (filtered.length === 0) {
            chipsBox.innerHTML = q ? `<span class="text-[10px] text-stone-400 dark:text-slate-500 italic py-0.5">Sin coincidencias previas (se creará "${escapeHtml(filterQuery)}")</span>` : '';
          } else {
            chipsBox.innerHTML = filtered.slice(0, 8).map(item => {
              const c = item.concept;
              const catLabel = item.category ? `<span class="opacity-60 text-[9px] ml-1">(${escapeHtml(item.category.replace(/^[^\s]+\s*/, ''))})</span>` : '';
              return `
                <button type="button" onclick="app.fillDockExpenseConcept('${escapeHtml(c)}')" class="inline-flex items-center px-2 py-0.5 rounded-md subpanel-bg border text-[11px] hover:border-theme-main font-medium transition active:scale-95 text-stone-700 dark:text-slate-300">
                  <span>${escapeHtml(c)}</span>${catLabel}
                </button>
              `;
            }).join('');
          }
        }
      }

      function renderPomodoroUI() {
        const p = state.pomo;
        const mins = Math.floor(p.timeLeft / 60);
        const secs = p.timeLeft % 60;
        const timeStr = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

        const elClock = document.getElementById('pomoClockDisplay');
        if (elClock) elClock.textContent = timeStr;
        const zenTimer = document.getElementById('zenTimerDisplay');
        if (zenTimer) zenTimer.textContent = timeStr;

        const effectiveHrs = (p.effectiveSeconds / 3600).toFixed(2);
        const effectiveMins = Math.floor(p.effectiveSeconds / 60);
        const effStr = `${effectiveMins}m (${effectiveHrs}h)`;
        const elEff = document.getElementById('pomoEffectiveDisplay');
        if (elEff) elEff.textContent = effStr;
        const zenEff = document.getElementById('zenEffectiveTime');
        if (zenEff) zenEff.textContent = effStr;

        const phaseText = p.phase === 'work' ? 'ENFOQUE' : 'DESCANSO';
        const elPhase = document.getElementById('pomoPhasePill');
        if (elPhase) elPhase.textContent = phaseText;
        const zenPhase = document.getElementById('zenPhaseLabel');
        if (zenPhase) zenPhase.textContent = `BLOQUE DE ${phaseText}`;

        const playText = p.isRunning ? '⏸️ Pausar' : '▶️ Iniciar';
        const elPlay = document.getElementById('pomoMainBtn');
        if (elPlay) elPlay.textContent = playText;
        const zenPlay = document.getElementById('zenPlayBtn');
        if (zenPlay) zenPlay.textContent = `${playText} (Espacio)`;

        const subjects = ['Estudio General', ...Object.keys(state.subjectRules)];
        const subHtml = subjects.map(s => `<option value="${s}" ${s === p.selectedSubject ? 'selected' : ''}>${s}</option>`).join('');
        const elSub = document.getElementById('pomoSubject');
        if (elSub) elSub.innerHTML = subHtml;
        const zenSub = document.getElementById('zenSubjectSelect');
        if (zenSub) zenSub.innerHTML = subHtml;

        const w = getActiveWeek();
        const curSubNum = ((w && w.studyBySubject) ? (Number(w.studyBySubject[p.selectedSubject]) || 0) : 0);
        const curSubHours = formatHoursToHMin(curSubNum);
        const elZenSubName = document.getElementById('zenSubjectName');
        if (elZenSubName) elZenSubName.textContent = p.selectedSubject;
        const elZenSubHours = document.getElementById('zenSubjectHours');
        if (elZenSubHours) elZenSubHours.textContent = curSubHours;
        const elDockSubHours = document.getElementById('dockPomoSubjectHours');
        if (elDockSubHours) elDockSubHours.textContent = curSubHours;

        const zenPreset = document.getElementById('zenPresetSelect');
        if (zenPreset) zenPreset.value = p.preset;
        const dockPreset = document.getElementById('dockPomoPreset');
        if (dockPreset) dockPreset.value = p.preset;

        const freeInputs = document.getElementById('zenFreeInputs');
        if (freeInputs) {
          if (p.preset === 'free') {
            freeInputs.classList.remove('hidden');
            const studyInput = document.getElementById('zenFreeStudyMin');
            if (studyInput && document.activeElement !== studyInput) studyInput.value = p.studyMin;
            const restInput = document.getElementById('zenFreeRestMin');
            if (restInput && document.activeElement !== restInput) restInput.value = p.restMin;
          } else {
            freeInputs.classList.add('hidden');
          }
        }

        const dockFree = document.getElementById('dockPomoFreeInputs');
        if (dockFree) {
          if (p.preset === 'free') {
            dockFree.classList.remove('hidden');
            const dStudy = document.getElementById('dockFreeStudyMin');
            if (dStudy && document.activeElement !== dStudy) dStudy.value = p.studyMin;
            const dRest = document.getElementById('dockFreeRestMin');
            if (dRest && document.activeElement !== dRest) dRest.value = p.restMin;
          } else {
            dockFree.classList.add('hidden');
          }
        }

        // Sincronización con Dock Flotante Pomodoro
        const dockDisplay = document.getElementById('dockPomoDisplay');
        if (dockDisplay) {
          dockDisplay.textContent = timeStr;
          document.getElementById('dockPomoEffective').textContent = effStr;
          document.getElementById('dockPomoPhaseBadge').textContent = phaseText;
          document.getElementById('dockPomoPlayBtn').textContent = playText;
          document.getElementById('dockPomoPillTime').textContent = timeStr;
          document.getElementById('dockPomoPillSubject').textContent = p.selectedSubject.replace('Estudio ', '');

          const dockPing = document.getElementById('dockPomoLivePing');
          const dockDot = document.getElementById('dockPomoLiveDot');
          const dockPill = document.getElementById('dockPomoPill');
          if (p.isRunning) {
            if (dockPing) dockPing.classList.remove('hidden');
            if (dockDot) dockDot.className = 'relative inline-flex rounded-full h-2 w-2 bg-emerald-400';
            if (dockPill) dockPill.classList.add('pomo-pulse');
          } else {
            if (dockPing) dockPing.classList.add('hidden');
            if (dockDot) dockDot.className = 'relative inline-flex rounded-full h-2 w-2 bg-slate-400';
            if (dockPill) dockPill.classList.remove('pomo-pulse');
          }

          const dockSub = document.getElementById('dockPomoSubject');
          if (dockSub && dockSub.innerHTML !== subHtml) {
            dockSub.innerHTML = subHtml;
            dockSub.value = p.selectedSubject;
          }
        }

        if (p.isRunning) document.title = `${timeStr} • ${p.selectedSubject}`;
        else document.title = `Centro de Control Personal`;
      }

      function getUrgencyBadge(dateStr, timeStr, isDone = false) {
        if (!dateStr && !timeStr) return '';
        const tSuffix = timeStr ? ` ${escapeHtml(timeStr)}` : '';
        if (isDone) {
          return `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-mono text-[9px] bg-theme-accent-soft text-theme-accent border border-theme-accent/40 font-medium opacity-80"><svg class="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg><span>${dateStr ? dateStr : ''}${tSuffix}</span></span>`;
        }
        if (!dateStr) {
          return `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-mono font-bold text-[9px] bg-slate-800 text-slate-300 border border-slate-700"><svg class="w-2.5 h-2.5 text-stone-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg><span>${escapeHtml(timeStr)}</span></span>`;
        }
        const now = new Date();
        const todayZero = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const [y, m, d] = dateStr.split('-').map(Number);
        const targetZero = new Date(y, m - 1, d);
        const diffDays = Math.round((targetZero - todayZero) / 86400000);

        // Si es hoy pero tiene hora límite y ya pasó la hora
        let isPastTimeToday = false;
        if (diffDays === 0 && timeStr) {
          const [th, tm] = timeStr.split(':').map(Number);
          if (!isNaN(th)) {
            const targetTime = new Date(y, m - 1, d, th, isNaN(tm) ? 0 : tm, 0, 0);
            if (now.getTime() > targetTime.getTime()) {
              isPastTimeToday = true;
            }
          }
        }

        if (diffDays < 0 || isPastTimeToday) {
          const label = isPastTimeToday ? `Atrasada hoy (${escapeHtml(timeStr)})` : `Atrasada (${dateStr}${tSuffix})`;
          return `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-mono font-bold text-[9px] bg-theme-accent text-white shadow-xs"><span class="w-1.5 h-1.5 rounded-full bg-white animate-ping"></span><span>${label}</span></span>`;
        } else if (diffDays === 0) {
          return `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-mono font-bold text-[9px] bg-theme-accent text-white animate-pulse"><span class="w-1.5 h-1.5 rounded-full bg-white"></span><span>¡Vence Hoy!${tSuffix}</span></span>`;
        } else if (diffDays === 1) {
          return `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-mono font-bold text-[9px] bg-theme-accent-soft text-theme-accent border border-theme-accent/40"><span class="w-1.5 h-1.5 rounded-full bg-theme-accent"></span><span>Mañana${tSuffix}</span></span>`;
        } else if (diffDays <= 7) {
          return `<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded font-mono font-bold text-[9px] bg-theme-soft text-theme-main border border-theme"><svg class="w-2.5 h-2.5 text-theme-main" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg><span>En ${diffDays}d${tSuffix}</span></span>`;
        } else {
          return `<span class="inline-flex items-center gap-1 text-[10px] text-stone-500 dark:text-slate-400 font-mono"><svg class="w-2.5 h-2.5 text-stone-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg><span>${dateStr}${tSuffix}</span></span>`;
        }
      }

      function findNodeAndParentInTree(nodes, targetId, parent = null) {
        if (!Array.isArray(nodes)) return null;
        for (let i = 0; i < nodes.length; i++) {
          const node = nodes[i];
          if (node && node.id === targetId) {
            return { node, parent, array: nodes, index: i };
          }
          if (node && Array.isArray(node.children) && node.children.length > 0) {
            const found = findNodeAndParentInTree(node.children, targetId, node);
            if (found) return found;
          }
        }
        return null;
      }

      function getNodePath(nodes, targetId, currentPath = []) {
        if (!Array.isArray(nodes)) return null;
        for (const node of nodes) {
          if (!node) continue;
          const nextPath = [...currentPath, node.title];
          if (node.id === targetId) return nextPath;
          if (Array.isArray(node.children) && node.children.length > 0) {
            const found = getNodePath(node.children, targetId, nextPath);
            if (found) return found;
          }
        }
        return null;
      }

      function isDescendantOf(rootNode, targetId) {
        if (!rootNode || !Array.isArray(rootNode.children)) return false;
        for (const child of rootNode.children) {
          if (child.id === targetId || isDescendantOf(child, targetId)) return true;
        }
        return false;
      }

      function removeNodesByIdsFromTree(nodes, idSet) {
        if (!Array.isArray(nodes)) return [];
        return nodes.filter(node => {
          if (!node) return false;
          if (idSet.has(node.id)) return false;
          if (Array.isArray(node.children) && node.children.length > 0) {
            node.children = removeNodesByIdsFromTree(node.children, idSet);
          }
          return true;
        });
      }

      function generateDuplicateTitle(title) {
        if (!title) return 'Copia';
        const numMatch = title.match(/^(.*?)(\d+)$/);
        if (numMatch) {
          const prefix = numMatch[1];
          const num = parseInt(numMatch[2], 10);
          return `${prefix}${num + 1}`;
        }
        const copyMatch = title.match(/^(.*?)(?: \(Copia(?: (\d+))?\))$/);
        if (copyMatch) {
          const base = copyMatch[1];
          const copyNum = copyMatch[2] ? parseInt(copyMatch[2], 10) + 1 : 2;
          return `${base} (Copia ${copyNum})`;
        }
        return `${title} (Copia)`;
      }

      function nodeHasDates(node) {
        if (!node) return false;
        if (node.date) return true;
        if (Array.isArray(node.children) && node.children.length > 0) {
          return node.children.some(c => nodeHasDates(c));
        }
        return false;
      }

      function generateNumberedCopyTitle(title, copyIndex = 1) {
        if (!title) return `Copia ${copyIndex}`;
        const numMatch = title.match(/^(.*?)(\d+)$/);
        if (numMatch) {
          const prefix = numMatch[1];
          const num = parseInt(numMatch[2], 10);
          return `${prefix}${num + copyIndex}`;
        }
        const copyMatch = title.match(/^(.*?)(?: \(Copia(?: (\d+))?\))$/);
        if (copyMatch) {
          const base = copyMatch[1];
          const startNum = copyMatch[2] ? parseInt(copyMatch[2], 10) : 1;
          return `${base} (Copia ${startNum + copyIndex})`;
        }
        return copyIndex === 1 ? `${title} (Copia)` : `${title} (Copia ${copyIndex + 1})`;
      }

      function shiftNodeDates(node, daysShift, adjustWeekend = false) {
        if (!node || daysShift === 0) return;
        function shiftDateStr(dateStr) {
          if (!dateStr || typeof dateStr !== 'string') return dateStr;
          const parts = dateStr.split('-');
          if (parts.length !== 3) return dateStr;
          const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
          if (isNaN(d.getTime())) return dateStr;
          d.setDate(d.getDate() + daysShift);
          if (adjustWeekend) {
            const day = d.getDay();
            if (day === 6) d.setDate(d.getDate() - 1);
            else if (day === 0) d.setDate(d.getDate() - 2);
          }
          const yyyy = d.getFullYear();
          const mm = String(d.getMonth() + 1).padStart(2, '0');
          const dd = String(d.getDate()).padStart(2, '0');
          return `${yyyy}-${mm}-${dd}`;
        }

        function walk(item) {
          if (item.date) {
            item.date = shiftDateStr(item.date);
          }
          item.done = false;
          if (item.status !== undefined) item.status = 'pending';
          if (Array.isArray(item.children)) {
            item.children.forEach(c => walk(c));
          }
        }

        walk(node);
      }

      function deepCloneNodeWithNewIds(node) {
        const cloned = JSON.parse(JSON.stringify(node));
        function reId(item, isRoot) {
          item.id = (item.isContainer ? 'cont_' : (item.children !== undefined ? 'it_' : 'sub_')) + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
          if (isRoot) {
            item.title = generateDuplicateTitle(item.title || '');
          }
          if (Array.isArray(item.children)) {
            item.children.forEach(c => reId(c, false));
          }
        }
        reId(cloned, true);
        return cloned;
      }

      function isItemOrSubtaskDone(node) {
        if (!node) return false;
        if (node.done || node.status === 'done') return true;
        if (Array.isArray(node.children) && node.children.length > 0) {
          return node.children.every(child => isItemOrSubtaskDone(child));
        }
        return false;
      }

      function setChildrenStatusCascade(node, isDone) {
        if (!node) return;
        node.done = isDone;
        if (node.status !== undefined) node.status = isDone ? 'done' : 'pending';
        if (Array.isArray(node.children)) {
          node.children.forEach(c => setChildrenStatusCascade(c, isDone));
        }
      }

      function updateParentsStatusCascade(rootArr, targetId) {
        const found = findNodeAndParentInTree(rootArr, targetId);
        if (!found || !found.parent) return;
        const parent = found.parent;
        if (Array.isArray(parent.children) && parent.children.length > 0) {
          const allChildrenDone = parent.children.every(c => c.done || c.status === 'done');
          if (allChildrenDone) {
            parent.done = true;
            if (parent.status !== undefined) parent.status = 'done';
          } else {
            parent.done = false;
            if (parent.status !== undefined) parent.status = 'pending';
          }
          updateParentsStatusCascade(rootArr, parent.id);
        }
      }

      function countTreeStats(children) {
        if (!Array.isArray(children) || children.length === 0) {
          return { total: 0, done: 0, pct: 100 };
        }
        const total = children.length;
        let done = 0;
        children.forEach(c => {
          if (isItemOrSubtaskDone(c)) done++;
        });
        const pct = total > 0 ? Math.round((done / total) * 100) : 100;
        return { total, done, pct };
      }

      function renderSubnotesTree(children, cat, depth = 1) {
        if (!Array.isArray(children) || children.length === 0) return '';

        // Líneas de hilo con degradado y alternancia de dos tonos según la profundidad
        const isOdd = depth % 2 === 1;
        const threadBorderClass = isOdd ? 'subnote-thread-odd' : 'subnote-thread-even';

        return `
          <div class="space-y-1.5 ${depth === 1 ? 'pt-1.5' : 'pt-1'}">
            ${children.map(sub => {
              visibleListItemIds.push(sub.id);
              const isSelected = selectedListItemIds.has(sub.id);
              const selectClass = isSelected ? 'ring-2 ring-theme-main bg-theme-soft border-theme-main shadow-sm' : '';
              const hasSubs = Array.isArray(sub.children) && sub.children.length > 0;
              const subStats = hasSubs ? countTreeStats(sub.children) : null;
              const isCollapsed = !!sub.collapsed;
              const allDone = subStats && subStats.total > 0 && subStats.done === subStats.total;

              return `
                <div class="pl-3 sm:pl-4 ${threadBorderClass} space-y-1 transition-colors">
                  <div id="list-item-${sub.id}" data-item-id="${sub.id}" draggable="true" ondragstart="app.handleListDragStart(event, '${cat}', '${sub.id}')" ondragend="app.handleListDragEnd(event)" ondragover="app.handleListDragOver(event, '${cat}', '${sub.id}')" ondragleave="app.handleListDragLeave(event)" ondrop="app.handleListDrop(event, '${cat}', '${sub.id}')" ontouchstart="app.handleListTouchStart(event, '${cat}', '${sub.id}')" ontouchmove="app.handleListTouchMove(event)" ontouchend="app.handleListTouchEnd(event)" oncontextmenu="app.openItemActionsMenu(event, '${cat}', '${sub.id}'); return false;" onclick="if(event.target.tagName !== 'BUTTON' && event.target.tagName !== 'INPUT' && (event.ctrlKey || event.metaKey || event.shiftKey || app.isSelectionModeActive())) { app.handleItemCheckboxToggle('${sub.id}', event); }" class="p-1.5 rounded-xl panel-bg border border-stone-200/60 dark:border-slate-800/80 hover:border-theme flex items-center justify-between gap-2 text-[11px] transition shadow-xs draggable-card cursor-pointer ${selectClass}">
                    <div class="flex items-center gap-1.5 flex-1 min-w-0">
                      <label class="cursor-pointer flex items-center pr-0.5 shrink-0 ${selectionModeActive || selectedListItemIds.size > 0 ? '' : 'hidden'}" onclick="event.stopPropagation()">
                        <input type="checkbox" ${isSelected ? 'checked' : ''} onchange="app.handleItemCheckboxToggle('${sub.id}', event)" class="rounded accent-theme-main w-3 h-3 cursor-pointer">
                      </label>
                      ${hasSubs ? `
                        <button type="button" onclick="app.toggleCollapseListNode('${cat}', '${sub.id}')" class="w-4 h-4 rounded hover:bg-stone-200 dark:hover:bg-slate-800 text-stone-400 dark:text-slate-400 hover:text-theme-main transition text-[9px] shrink-0 font-bold flex items-center justify-center leading-none" title="${isCollapsed ? 'Desplegar subnotas' : 'Plegar subnotas'}">
                          ${isCollapsed ? '▶' : '▼'}
                        </button>
                      ` : ''}
                      <button type="button" onclick="app.toggleSubtaskStatus('${cat}', '${sub.id}')" class="w-4 h-4 rounded-md flex items-center justify-center border transition shrink-0 ${sub.done ? 'bg-theme-main border-theme-main text-white' : 'border-stone-400 dark:border-slate-600 hover:border-theme-main'}" title="${sub.done ? 'Marcar pendiente' : 'Marcar completado'}">
                        ${sub.done ? '<svg class="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
                      </button>
                      <div class="flex-1 min-w-0 flex items-center gap-1.5">
                        <span class="${sub.done ? 'line-through text-stone-400 dark:text-slate-500' : 'text-stone-800 dark:text-slate-200 font-semibold'} break-words">${escapeHtml(sub.title)}</span>
                        ${(sub.date || sub.time) ? getUrgencyBadge(sub.date, sub.time, sub.done || sub.status === 'done') : ''}
                        ${hasSubs ? `
                          <button type="button" onclick="app.toggleCollapseListNode('${cat}', '${sub.id}')" class="text-[9px] px-1.5 py-0.2 rounded-full font-mono font-bold ${allDone ? 'bg-theme-accent text-white' : (isCollapsed ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/40' : 'bg-theme-soft text-theme-main border border-theme')} shrink-0 hover:scale-105 transition" title="${isCollapsed ? 'Plegado. Clic para desplegar' : 'Desplegado. Clic para plegar'}">
                            ${isCollapsed ? '▶ ' : ''}${subStats.done}/${subStats.total}
                          </button>
                        ` : ''}
                      </div>
                    </div>
                    <!-- Acciones Descongestionadas Atenuadas -->
                    <div class="flex items-center gap-1 shrink-0 opacity-60 hover:opacity-100 transition">
                      <button type="button" onclick="app.openAddSubtaskModal('${cat}', '${sub.id}')" class="px-2 py-0.5 rounded-lg bg-theme-soft hover:bg-theme-main hover:text-white border border-theme text-theme-main font-semibold text-[9px] flex items-center gap-0.5 transition" title="Añadir subnota dentro de '${sub.title.replace(/'/g, "\\'")}'"><span>+</span> Subnota</button>
                      <button type="button" onclick="app.openItemActionsMenu(event, '${cat}', '${sub.id}')" oncontextmenu="app.openItemActionsMenu(event, '${cat}', '${sub.id}'); return false;" class="w-6 h-6 rounded-lg subpanel-bg border border-stone-300/60 dark:border-slate-700/60 hover:border-theme-main text-stone-600 dark:text-slate-300 hover:text-stone-900 dark:hover:text-white flex items-center justify-center font-bold text-xs transition shadow-xs" title="Más opciones">•••</button>
                    </div>
                  </div>

                  <!-- Nivel Siguiente Recursivo si no está plegado -->
                  ${hasSubs && !isCollapsed ? renderSubnotesTree(sub.children, cat, depth + 1) : ''}
                </div>
              `;
            }).join('')}
          </div>
        `;
      }

      function renderListsTree() {
        visibleListItemIds = [];
        const cat = state.ui.listTab || 'entregas';
        const sort = state.ui.listSort || 'manual';
        ['entregas', 'notas', 'compras', 'objetivos'].forEach(c => {
          const btn = document.getElementById(`listTab_${c}`);
          if (!btn) return;
          if (c === cat) {
            btn.className = 'py-1.5 px-1 rounded-lg bg-theme-main text-white font-bold shadow-xs flex items-center justify-center gap-1.5 transition';
          } else {
            btn.className = 'py-1.5 px-1 rounded-lg text-stone-500 dark:text-slate-400 hover:text-stone-900 dark:hover:text-slate-100 flex items-center justify-center gap-1.5 transition';
          }
        });

        // Fechas universales habilitadas para todas las pestañas de listas
        const dateBox = document.getElementById('newListItemDateBox');
        if (dateBox) dateBox.classList.remove('hidden');

        const sManual = document.getElementById('sortManualBtn');
        const sDate = document.getElementById('sortDateBtn');
        const sName = document.getElementById('sortNameBtn');
        if (sManual && sDate && sName) {
          sManual.className = sort === 'manual' ? 'font-bold text-theme-main underline underline-offset-2' : 'hover:text-theme-main transition-colors text-stone-500 dark:text-slate-400';
          sDate.className = sort === 'date' ? 'font-bold text-theme-main underline underline-offset-2' : 'hover:text-theme-main transition-colors text-stone-500 dark:text-slate-400';
          sName.className = sort === 'name' ? 'font-bold text-theme-main underline underline-offset-2' : 'hover:text-theme-main transition-colors text-stone-500 dark:text-slate-400';
        }

        let rawItems = [...(state.lists[cat] || [])];

        // Manejo de Barra de Filtro Activo desde Avisos/Hitos
        const filterBar = document.getElementById('listFilterActiveBar');
        const filterText = document.getElementById('listFilterActiveText');
        const activeFilter = state.ui.activeListFilter;
        let filteredIdsSet = null;

        if (activeFilter && activeFilter.ids && Array.isArray(activeFilter.ids) && activeFilter.ids.length > 0) {
          filteredIdsSet = new Set(activeFilter.ids);
          if (filterBar) filterBar.classList.remove('hidden');
          if (filterText) filterText.textContent = activeFilter.label || `Mostrando ${activeFilter.ids.length} notas seleccionadas`;
        } else {
          if (filterBar) filterBar.classList.add('hidden');
        }

        // Función auxiliar para saber si un nodo o alguno de sus descendientes está en el filtro
        function nodeMatchesFilter(n) {
          if (!filteredIdsSet) return true;
          if (filteredIdsSet.has(n.id)) return true;
          if (Array.isArray(n.children)) {
            return n.children.some(c => nodeMatchesFilter(c));
          }
          return false;
        }

        // Separar elementos activos vs completados
        let activeItems = rawItems.filter(it => it.isContainer || (!it.done && it.status !== 'done' && it.status !== 'completed'));
        const completedItems = rawItems.filter(it => !it.isContainer && (it.done === true || it.status === 'done' || it.status === 'completed'));

        if (filteredIdsSet) {
          activeItems = activeItems.filter(it => nodeMatchesFilter(it));
        }

        // Ordenación de activos: Pinned arriba primero, luego por criterio elegido
        activeItems.sort((a, b) => {
          if (a.pinned && !b.pinned) return -1;
          if (!a.pinned && b.pinned) return 1;
          if (sort === 'date') {
            const dtA = ((a.date || '9999-99-99') + ' ' + (a.time || '00:00')).trim();
            const dtB = ((b.date || '9999-99-99') + ' ' + (b.time || '00:00')).trim();
            return dtA.localeCompare(dtB);
          }
          if (sort === 'name') return a.title.localeCompare(b.title);
          return 0; // manual
        });

        const container = document.getElementById('listItemsTree');
        if (activeItems.length === 0) {
          container.innerHTML = `<span class="text-slate-400 text-[11px] block text-center py-4">No hay tareas o paquetes activos.</span>`;
        } else {
          container.innerHTML = activeItems.map((item, idx) => {
            visibleListItemIds.push(item.id);
            const isSelected = selectedListItemIds.has(item.id);
            const selectClass = isSelected ? 'ring-2 ring-theme-main bg-theme-soft border-theme-main shadow-md' : '';
            const isPinned = !!item.pinned;
            const isContainer = !!item.isContainer;
            const pinClass = isPinned ? 'border-l-4 border-amber-400 bg-amber-500/10' : '';

            // Renderizado de Carpeta / Paquete Permanente
            if (isContainer) {
              const children = Array.isArray(item.children) ? item.children : [];
              const stats = countTreeStats(children);
              const totalSubs = stats.total;
              const doneSubs = stats.done;
              const allDone = totalSubs > 0 && doneSubs === totalSubs;
              const subPct = stats.pct;
              const isCollapsed = !!item.collapsed;

              return `
                <div id="list-item-${item.id}" data-item-id="${item.id}" draggable="true" ondragstart="app.handleListDragStart(event, '${cat}', '${item.id}')" ondragend="app.handleListDragEnd(event)" ondragover="app.handleListDragOver(event, '${cat}', '${item.id}')" ondragleave="app.handleListDragLeave(event)" ondrop="app.handleListDrop(event, '${cat}', '${item.id}')" ontouchstart="app.handleListTouchStart(event, '${cat}', '${item.id}')" ontouchmove="app.handleListTouchMove(event)" ontouchend="app.handleListTouchEnd(event)" oncontextmenu="app.openItemActionsMenu(event, '${cat}', '${item.id}'); return false;" onclick="if(event.target.tagName !== 'BUTTON' && event.target.tagName !== 'INPUT' && (event.ctrlKey || event.metaKey || event.shiftKey || app.isSelectionModeActive())) { app.handleItemCheckboxToggle('${item.id}', event); }" class="p-2.5 rounded-xl subpanel-bg border ${pinClass} space-y-2 text-xs shadow-sm draggable-card cursor-pointer ${selectClass}">
                  <!-- Cabecera de la Carpeta Permanente (Título Máxima Prioridad + •••) -->
                  <div class="flex items-center justify-between gap-2 border-b border-stone-200/70 dark:border-slate-800/80 pb-1.5">
                    <div class="flex items-center gap-1.5 flex-1 min-w-0">
                      <label class="cursor-pointer flex items-center pr-0.5 shrink-0 ${selectionModeActive || selectedListItemIds.size > 0 ? '' : 'hidden'}" onclick="event.stopPropagation()">
                        <input type="checkbox" ${isSelected ? 'checked' : ''} onchange="app.handleItemCheckboxToggle('${item.id}', event)" class="rounded accent-theme-main w-3.5 h-3.5 cursor-pointer">
                      </label>
                      ${totalSubs > 0 ? `
                        <button type="button" onclick="app.toggleCollapseListNode('${cat}', '${item.id}')" class="w-5 h-5 rounded hover:bg-stone-200 dark:hover:bg-slate-800 text-stone-400 dark:text-slate-400 hover:text-theme-main transition text-xs shrink-0 font-bold flex items-center justify-center leading-none" title="${isCollapsed ? 'Desplegar paquete' : 'Plegar paquete'}">
                          ${isCollapsed ? '▶' : '▼'}
                        </button>
                      ` : ''}
                      <span class="cursor-pointer text-theme-main shrink-0 flex items-center" onclick="app.toggleCollapseListNode('${cat}', '${item.id}')" title="Plegar/Desplegar">
                        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                      </span>
                      <div class="flex-1 min-w-0 flex items-center gap-1.5 cursor-pointer" onclick="app.toggleCollapseListNode('${cat}', '${item.id}')">
                        <span class="font-extrabold text-stone-900 dark:text-white text-[13px] break-words">${escapeHtml(item.title)}</span>
                        ${isPinned ? `<span class="inline-flex items-center text-amber-500 shrink-0" title="Nota fijada"><svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"/></svg></span>` : ''}
                        ${(item.date || item.time) ? getUrgencyBadge(item.date, item.time, allDone) : ''}
                      </div>
                    </div>
                    <!-- Acciones Carpeta Descongestionadas con ••• -->
                    <div class="flex items-center gap-1 shrink-0 opacity-80 hover:opacity-100 transition">
                      <button type="button" onclick="app.openAddSubtaskModal('${cat}', '${item.id}')" class="px-2 py-0.5 rounded-lg bg-theme-soft hover:bg-theme-main hover:text-white border border-theme text-theme-main font-bold text-[10px] transition" title="Añadir subnota o entrega a este paquete">+ Subnota</button>
                      <button type="button" onclick="app.openItemActionsMenu(event, '${cat}', '${item.id}')" oncontextmenu="app.openItemActionsMenu(event, '${cat}', '${item.id}'); return false;" class="w-6 h-6 rounded-lg subpanel-bg border border-stone-300/60 dark:border-slate-700/60 hover:border-theme-main text-stone-600 dark:text-slate-300 hover:text-stone-900 dark:hover:text-white flex items-center justify-center font-bold text-xs transition shadow-xs" title="Más opciones">•••</button>
                    </div>
                  </div>

                  <!-- Estado del paquete y barra de progreso -->
                  <div class="flex items-center justify-between text-[10px] text-stone-500 dark:text-slate-400">
                    <span class="font-semibold text-stone-600 dark:text-slate-300">${item.note ? escapeHtml(item.note) : 'Paquete permanente'}</span>
                    ${allDone ? `
                      <button type="button" onclick="app.toggleCollapseListNode('${cat}', '${item.id}')" class="px-2 py-0.5 rounded-full bg-theme-accent text-white font-bold font-mono">Al día (${doneSubs}/${totalSubs}) ${isCollapsed ? '▶' : '▼'}</button>
                    ` : (totalSubs === 0 ? `
                      <span class="px-2 py-0.5 rounded-full bg-stone-200/60 dark:bg-slate-800 text-stone-500 dark:text-slate-400 font-mono">Sin entregas asignadas</span>
                    ` : `
                      <button type="button" onclick="app.toggleCollapseListNode('${cat}', '${item.id}')" class="px-2 py-0.5 rounded-full bg-theme-soft text-theme-main border border-theme font-bold font-mono">${doneSubs}/${totalSubs} (${subPct}%) ${isCollapsed ? '▶' : '▼'}</button>
                    `)}
                  </div>

                  ${totalSubs > 0 ? `
                    <div class="h-1.5 w-full bg-stone-200 dark:bg-slate-900 rounded-full overflow-hidden border border-stone-300/60 dark:border-slate-800">
                      <div style="width: ${subPct}%" class="h-full bg-theme-main transition-all duration-300"></div>
                    </div>
                  ` : ''}

                  <!-- Subtareas / Entregas dentro del Paquete (Recursivo si no está plegado) -->
                  ${totalSubs > 0 && !isCollapsed ? renderSubnotesTree(children, cat, 1) : ''}
                </div>
              `;
            }

            // Renderizado de Tarea / Nota Normal (con soporte para subnotas recursivas y •••)
            const children = Array.isArray(item.children) ? item.children : [];
            const stats = countTreeStats(children);
            const hasChildren = stats.total > 0;
            const isCollapsed = !!item.collapsed;
            const allDone = hasChildren && stats.total > 0 && stats.done === stats.total;

            return `
              <div id="list-item-${item.id}" data-item-id="${item.id}" draggable="true" ondragstart="app.handleListDragStart(event, '${cat}', '${item.id}')" ondragend="app.handleListDragEnd(event)" ondragover="app.handleListDragOver(event, '${cat}', '${item.id}')" ondragleave="app.handleListDragLeave(event)" ondrop="app.handleListDrop(event, '${cat}', '${item.id}')" ontouchstart="app.handleListTouchStart(event, '${cat}', '${item.id}')" ontouchmove="app.handleListTouchMove(event)" ontouchend="app.handleListTouchEnd(event)" oncontextmenu="app.openItemActionsMenu(event, '${cat}', '${item.id}'); return false;" onclick="if(event.target.tagName !== 'BUTTON' && event.target.tagName !== 'INPUT' && (event.ctrlKey || event.metaKey || event.shiftKey || app.isSelectionModeActive())) { app.handleItemCheckboxToggle('${item.id}', event); }" class="p-2.5 rounded-xl subpanel-bg border ${pinClass} space-y-2 text-xs transition shadow-sm draggable-card cursor-pointer ${selectClass}">
                <div class="flex items-start justify-between gap-2">
                  <div class="flex items-start gap-1.5 flex-1 min-w-0">
                    <label class="cursor-pointer flex items-center pr-0.5 pt-0.5 shrink-0 ${selectionModeActive || selectedListItemIds.size > 0 ? '' : 'hidden'}" onclick="event.stopPropagation()">
                      <input type="checkbox" ${isSelected ? 'checked' : ''} onchange="app.handleItemCheckboxToggle('${item.id}', event)" class="rounded accent-theme-main w-3.5 h-3.5 cursor-pointer">
                    </label>
                    ${hasChildren ? `
                      <button type="button" onclick="app.toggleCollapseListNode('${cat}', '${item.id}')" class="w-4 h-4 rounded hover:bg-stone-200 dark:hover:bg-slate-800 text-stone-400 dark:text-slate-400 hover:text-theme-main transition text-[9px] shrink-0 font-bold flex items-center justify-center leading-none mt-0.5" title="${isCollapsed ? 'Desplegar subnotas' : 'Plegar subnotas'}">
                        ${isCollapsed ? '▶' : '▼'}
                      </button>
                    ` : ''}
                    <button type="button" onclick="app.toggleListItemStatus('${cat}', '${item.id}')" class="w-4 h-4 rounded-md flex items-center justify-center border transition shrink-0 mt-0.5 ${item.done || item.status === 'done' ? 'bg-theme-main border-theme-main text-white' : 'border-stone-400 dark:border-slate-600 hover:border-theme-main'}" title="${item.done || item.status === 'done' ? 'Marcar pendiente' : 'Marcar completado'}">
                      ${item.done || item.status === 'done' ? '<svg class="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>' : ''}
                    </button>
                    <div class="flex-1 min-w-0">
                      <div class="flex flex-wrap items-center gap-1.5">
                        <span class="font-bold text-stone-900 dark:text-white break-words">${escapeHtml(item.title)}</span>
                        ${isPinned ? `<span class="inline-flex items-center text-amber-500 shrink-0" title="Nota fijada"><svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"/></svg></span>` : ''}
                        ${(item.date || item.time) ? getUrgencyBadge(item.date, item.time, item.done || item.status === 'done') : ''}
                        ${hasChildren ? `
                          <button type="button" onclick="app.toggleCollapseListNode('${cat}', '${item.id}')" class="text-[9px] px-1.5 py-0.2 rounded-full font-mono ${allDone ? 'bg-theme-accent text-white' : (isCollapsed ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/40' : 'bg-theme-soft text-theme-main border border-theme')} font-bold hover:scale-105 transition" title="${isCollapsed ? 'Plegado. Clic para desplegar' : 'Desplegado. Clic para plegar'}">
                            ${isCollapsed ? '▶ ' : ''}${stats.done}/${stats.total}
                          </button>
                        ` : ''}
                      </div>
                      ${item.note ? `<div class="text-[10px] text-stone-500 dark:text-slate-400 mt-0.5 leading-tight">${escapeHtml(item.note)}</div>` : ''}
                    </div>
                  </div>
                  <!-- Acciones Tarea con ••• -->
                  <div class="flex items-center gap-1 shrink-0 opacity-80 hover:opacity-100 transition">
                    <button type="button" onclick="app.openAddSubtaskModal('${cat}', '${item.id}')" class="px-1.5 py-0.5 rounded-lg bg-theme-soft hover:bg-theme-main hover:text-white border border-theme text-theme-main font-semibold text-[10px] flex items-center gap-0.5 transition" title="Añadir subnota"><span>+</span> Subnota</button>
                    <button type="button" onclick="app.openItemActionsMenu(event, '${cat}', '${item.id}')" oncontextmenu="app.openItemActionsMenu(event, '${cat}', '${item.id}'); return false;" class="w-6 h-6 rounded-lg subpanel-bg border border-stone-300/60 dark:border-slate-700/60 hover:border-theme-main text-stone-600 dark:text-slate-300 hover:text-stone-900 dark:hover:text-white flex items-center justify-center font-bold text-xs transition shadow-xs" title="Más opciones">•••</button>
                  </div>
                </div>

                <!-- Subnotas dentro del Item (Recursivo si no está plegado) -->
                ${hasChildren && !isCollapsed ? renderSubnotesTree(children, cat, 1) : ''}
              </div>
            `;
          }).join('');
        }

        // Sincronización instantánea del banner de hitos con cualquier cambio de listas
        renderMilestoneWidget();

        // Renderizado del Acordeón de Completadas
        const compSection = document.getElementById('listCompletedSection');
        if (completedItems.length === 0) {
          compSection.classList.add('hidden');
        } else {
          compSection.classList.remove('hidden');
          const isOpen = !!state.ui.completedOpen;
          document.getElementById('listCompletedTitle').innerHTML = `
            <svg class="w-3.5 h-3.5 text-theme-main" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
            <span>Completadas (${completedItems.length})</span>
          `;
          document.getElementById('listCompletedToggleIcon').textContent = isOpen ? '▲' : '▼';
          const compTree = document.getElementById('listCompletedTree');
          if (isOpen) {
            compTree.classList.remove('hidden');
            compTree.innerHTML = completedItems.map(item => {
              visibleListItemIds.push(item.id);
              const isSelected = selectedListItemIds.has(item.id);
              const selectClass = isSelected ? 'ring-2 ring-theme-main bg-theme-soft border-theme-main' : '';
              return `
                <div data-item-id="${item.id}" oncontextmenu="app.openItemActionsMenu(event, '${cat}', '${item.id}'); return false;" onclick="if(event.target.tagName !== 'BUTTON' && event.target.tagName !== 'INPUT' && (event.ctrlKey || event.metaKey || event.shiftKey || app.isSelectionModeActive())) { app.handleItemCheckboxToggle('${item.id}', event); }" class="p-1.5 rounded-lg subpanel-bg border border-slate-800/80 flex items-center justify-between gap-2 text-xs opacity-75 hover:opacity-100 transition cursor-pointer ${selectClass}">
                  <div class="flex items-center gap-2 flex-1 min-w-0">
                    <label class="cursor-pointer flex items-center shrink-0 ${selectionModeActive || selectedListItemIds.size > 0 ? '' : 'hidden'}" onclick="event.stopPropagation()">
                      <input type="checkbox" ${isSelected ? 'checked' : ''} onchange="app.handleItemCheckboxToggle('${item.id}', event)" class="rounded accent-theme-main w-3 h-3 cursor-pointer">
                    </label>
                    <button onclick="app.toggleListItemStatus('${cat}', '${item.id}')" class="w-4 h-4 rounded-md flex items-center justify-center bg-theme-main border border-theme-main text-white shrink-0 hover:opacity-90 transition" title="Restaurar tarea">
                      <svg class="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
                    </button>
                    <div class="truncate line-through text-slate-500 flex-1">
                      <span class="font-medium">${item.title}</span>
                      ${(item.date || item.time) ? `<span class="text-[10px] ml-1 opacity-70">(${[item.date, item.time].filter(Boolean).join(' ')})</span>` : ''}
                    </div>
                  </div>
                  <div class="flex items-center gap-1">
                    <button onclick="app.deleteListItem('${cat}', '${item.id}')" class="text-slate-500 hover:text-theme-accent px-1 font-bold text-xs" title="Borrar definitivamente">✕</button>
                    <button type="button" onclick="app.openItemActionsMenu(event, '${cat}', '${item.id}')" oncontextmenu="app.openItemActionsMenu(event, '${cat}', '${item.id}'); return false;" class="w-6 h-6 rounded-lg subpanel-bg border border-stone-300/60 dark:border-slate-700/60 hover:border-theme-main text-stone-600 dark:text-slate-300 hover:text-stone-900 dark:hover:text-white flex items-center justify-center font-bold text-xs transition shadow-xs" title="Más opciones">•••</button>
                  </div>
                </div>
              `;
            }).join('') + `
              <div class="pt-1 text-right">
                <button onclick="app.clearCompletedList('${cat}')" class="text-[10px] text-slate-500 hover:text-theme-accent font-semibold">Vaciar completadas</button>
              </div>
            `;
          } else {
            compTree.classList.add('hidden');
          }
        }

        // Sincronizar visibilidad y conteo de la barra de acciones masivas y mini-calendario de notas
        updateBulkToolbar();
        renderNotesMiniCalendar();
      }

      // RENDER PESTAÑA 2: METAS Y HORARIO
      function renderTab2() {
        const w = getActiveWeek();
        const g = state.goalsTemplate;
        const enabled = state.enabledModules || { gym: true, run: true, study: true, academic: true, nutri: true, budget: true };

        // Renderizar toggles de módulos nativos + hábitos personalizados
        const togglesContainer = document.getElementById('modularTogglesRow');
        if (togglesContainer) {
          const deleted = state.deletedBaseModules || [];
          const baseModules = [
            { key: 'gym', label: 'Gimnasio', iconId: 'dumbbell', isBase: true },
            { key: 'run', label: 'Running / Cardio', iconId: 'run', isBase: true },
            { key: 'study', label: 'Estudio', iconId: 'book', isBase: true },
            { key: 'academic', label: 'Asistencia Clases', iconId: 'graduation-cap', isBase: true },
            { key: 'nutri', label: 'Nutrición / Kcal', iconId: 'apple', isBase: true },
            { key: 'budget', label: 'Presupuesto Semanal', iconId: 'wallet', isBase: true }
          ].filter(m => !deleted.includes(m.key));

          const customHabitsList = (state.customHabits || []).map(h => ({
            key: h.id,
            label: h.name,
            iconId: h.iconId || h.icon || h.emoji || 'star',
            isBase: false,
            active: h.active !== false
          }));

          const allToggles = [
            ...baseModules.map(m => ({
              ...m,
              active: enabled[m.key] !== false
            })),
            ...customHabitsList
          ];

          togglesContainer.innerHTML = allToggles.map(item => {
            const isAct = item.active;
            const toggleFn = item.isBase ? `app.toggleModule('${item.key}')` : `app.toggleCustomHabit('${item.key}')`;
            const deleteFn = item.isBase ? `app.deleteBaseModule('${item.key}', '${escapeHtml(item.label)}')` : `app.deleteCustomHabit('${item.key}')`;

            return `
              <div class="inline-flex items-center rounded-xl border transition shadow-xs ${isAct ? 'bg-theme-main text-white border-theme' : 'subpanel-bg border-stone-300 dark:border-slate-700 text-stone-400 dark:text-slate-500 opacity-60'}">
                <button type="button" onclick="${toggleFn}" class="px-2.5 py-1.5 text-xs font-bold flex items-center gap-1.5 transition active:scale-95" title="${isAct ? 'Clic para pausar' : 'Clic para activar'}">
                  <span class="w-3.5 h-3.5 flex items-center justify-center shrink-0">${renderItemIcon(item.iconId, 'w-3.5 h-3.5')}</span>
                  <span class="truncate max-w-[120px]">${escapeHtml(item.label)}</span>
                  <span class="w-1.5 h-1.5 rounded-full ${isAct ? 'bg-white' : 'bg-stone-400 dark:bg-slate-600'}"></span>
                </button>
                <button type="button" onclick="${deleteFn}" class="pr-2 pl-1 py-1.5 text-xs opacity-60 hover:opacity-100 hover:text-rose-300 transition" title="Eliminar módulo de la plantilla">
                  ✕
                </button>
              </div>
            `;
          }).join('') + (deleted.length > 0 ? `
            <button type="button" onclick="app.restoreBaseModules()" class="px-2.5 py-1.5 rounded-xl border border-dashed border-theme text-theme-main text-xs font-bold hover:bg-theme-main/10 transition">
              + Restaurar módulos (${deleted.length})
            </button>
          ` : '');
        }

        document.getElementById('goalGymInput').value = g.gymSessions;
        document.getElementById('goalRunKmInput').value = g.runKm;
        document.getElementById('goalNutriPhase').value = g.nutri?.phase || 'volumen';
        const kcalEl = document.getElementById('goalNutriKcal');
        if (kcalEl) kcalEl.value = g.nutri?.kcal || 2800;
        const marginEl = document.getElementById('goalNutriMargin');
        if (marginEl) marginEl.value = g.nutri?.margin || 150;
        document.getElementById('goalNutriDays').value = g.nutri?.minDays || 6;
        document.getElementById('goalAttPercentInput').value = g.academic?.attMinPercent || 85;

        // Horas estudio inputs
        document.getElementById('studyPlanInputsGrid').innerHTML = DAYS.map((d, i) => `
          <div class="space-y-1 text-center">
            <span class="text-[10px] text-slate-400 font-bold">${d}</span>
            <input type="number" step="0.5" value="${w.studyHoursPlan[i] || 0}" onchange="app.setStudyPlanDay(${i}, this.value)" class="w-full input-bg border rounded-lg py-1 text-center font-mono font-bold text-xs" />
          </div>
        `).join('');

        // Grid Horario Lunes a Domingo
        document.getElementById('scheduleDaysGrid').innerHTML = DAYS.map((d, dIdx) => {
          const classes = state.scheduleTemplate[dIdx] || [];
          return `
            <div class="p-2.5 rounded-xl subpanel-bg border space-y-2 ${dIdx === 6 ? 'col-span-2 sm:col-span-1' : ''}">
              <div class="flex justify-between items-center border-b pb-1">
                <span class="font-extrabold text-theme-main">${d}</span>
                <button onclick="app.openAddClassScheduleModal(${dIdx})" class="px-2 py-0.5 rounded-lg bg-theme-main hover:opacity-90 text-white font-bold text-[10px] border border-theme/60 active:translate-y-0.5 transition">+ Clase</button>
              </div>
              <div class="space-y-1.5 min-h-[90px]">
                ${classes.length === 0 ? `<div class="text-slate-500 text-[10px] py-4 text-center">— Libre —</div>` : ''}
                ${classes.map((c, cIdx) => `
                  <div data-class-id="${dIdx}_${cIdx}" oncontextmenu="app.openClassActionsMenu(event, ${dIdx}, ${cIdx}); return false;" class="p-1.5 rounded-lg panel-bg border text-[11px] space-y-1 min-w-0 cursor-pointer">
                    <div class="flex items-center justify-between gap-1 min-w-0">
                      <div class="min-w-0 flex-1 cursor-pointer hover:text-theme-main transition-colors flex items-center gap-1.5" onclick="app.openEditClassScheduleModal(${dIdx}, ${cIdx})" title="Editar clase: ${c.subject}">
                        <span class="font-bold text-stone-900 dark:text-white truncate flex-1 min-w-0" title="${c.subject}">${c.subject}</span>
                        <span class="text-[9px] px-1 py-0.2 rounded font-mono font-bold shrink-0 ${c.type === 'P' ? 'bg-theme-accent-soft text-theme-accent border border-theme-accent/30' : (c.type === 'G' ? 'bg-theme-accent text-white' : 'bg-theme-soft text-theme-main border border-theme')}">[${c.type || 'T'}]</span>
                      </div>
                      <div class="flex items-center gap-0.5 shrink-0">
                        <button onclick="app.openEditClassScheduleModal(${dIdx}, ${cIdx})" class="text-slate-400 hover:text-theme-main p-0.5 transition" title="Editar clase">
                          <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                        <button onclick="app.deleteClassFromSchedule(${dIdx}, ${cIdx})" class="text-slate-400 hover:text-theme-accent font-bold px-0.5 text-xs" title="Eliminar clase">✕</button>
                        <button type="button" onclick="app.openClassActionsMenu(event, ${dIdx}, ${cIdx})" oncontextmenu="app.openClassActionsMenu(event, ${dIdx}, ${cIdx}); return false;" class="text-slate-400 hover:text-stone-900 dark:hover:text-white p-0.5 font-bold text-xs" title="Más opciones">•••</button>
                      </div>
                    </div>
                    ${c.time ? `
                      <div class="flex items-center gap-1 text-[9.5px] text-stone-500 dark:text-slate-400 font-mono">
                        <svg class="w-2.5 h-2.5 shrink-0 opacity-70" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                        <span class="truncate">${c.time}</span>
                      </div>
                    ` : ''}
                  </div>
                `).join('')}
              </div>
            </div>
          `;
        }).join('');

        // Colchón de Faltas con Semáforo de Riesgo
        const subjects = Object.keys(state.subjectRules);
        const container = document.getElementById('subjectRulesCardsGrid');
        if (subjects.length === 0) {
          container.innerHTML = `
            <div class="col-span-full p-6 text-center text-slate-400 subpanel-bg rounded-xl border border-dashed border-slate-700">
              <p class="font-semibold text-sm text-slate-300">No hay asignaturas configuradas en la plantilla.</p>
              <p class="text-xs mt-1">Haz clic en <strong class="text-theme-main">+ Añadir Asignatura</strong> arriba o añade clases al horario semanal.</p>
            </div>
          `;
          return;
        }

        container.innerHTML = subjects.map(sub => {
          const info = calculateSubjectCushion(sub);
          const r = info.rule;

          // Semáforo visual vectorial
          let trafficBadge = '';
          if (info.cushion >= 3) {
            trafficBadge = `<span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded font-bold font-mono text-[10px] bg-theme-soft text-theme-main border border-theme"><span class="w-2 h-2 rounded-full bg-theme-main inline-block shrink-0"></span><span>Seguro (+${info.cushion})</span></span>`;
          } else if (info.cushion >= 1) {
            trafficBadge = `<span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded font-bold font-mono text-[10px] bg-theme-accent-soft text-theme-accent border border-theme-accent"><span class="w-2 h-2 rounded-full bg-theme-accent inline-block shrink-0"></span><span>Precaución (+${info.cushion})</span></span>`;
          } else if (info.cushion === 0) {
            trafficBadge = `<span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded font-bold font-mono text-[10px] bg-theme-accent text-white font-bold"><span class="w-2 h-2 rounded-full bg-white inline-block shrink-0 animate-pulse"></span><span>Al límite (0 faltas)</span></span>`;
          } else {
            trafficBadge = `<span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded font-bold font-mono text-[10px] bg-theme-accent text-white font-bold animate-pulse"><span class="w-2 h-2 rounded-full bg-white inline-block shrink-0 animate-ping"></span><span>Pérdida Eval. (${info.cushion})</span></span>`;
          }

          const subArg = sub.replace(/'/g, "\\'");
          return `
            <div data-subject-id="${subArg}" oncontextmenu="app.openSubjectActionsMenu(event, '${subArg}'); return false;" class="p-3.5 rounded-xl subpanel-bg border space-y-2.5 cursor-pointer">
              <div class="flex justify-between items-center border-b pb-1.5">
                <div class="flex items-center gap-1.5">
                  <span class="font-extrabold text-sm text-white">${sub}</span>
                  <button onclick="app.renameSubjectPrompt('${subArg}')" class="text-slate-400 hover:text-theme-main p-1 transition" title="Renombrar asignatura en toda la app">
                    <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  </button>
                  <button onclick="app.deleteSubjectPrompt('${subArg}')" class="text-slate-400 hover:text-theme-accent p-1 transition" title="Eliminar asignatura y todas sus clases de la plantilla">
                    <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                  </button>
                  <button type="button" onclick="app.openSubjectActionsMenu(event, '${subArg}')" oncontextmenu="app.openSubjectActionsMenu(event, '${subArg}'); return false;" class="w-6 h-6 rounded-lg subpanel-bg border border-stone-300/60 dark:border-slate-700/60 hover:border-theme-main text-stone-600 dark:text-slate-300 hover:text-stone-900 dark:hover:text-white flex items-center justify-center font-bold text-xs transition shadow-xs" title="Más opciones">•••</button>
                </div>
                ${trafficBadge}
              </div>

              <div class="grid grid-cols-2 gap-2 text-[11px]">
                <div class="space-y-1">
                  <span class="text-stone-500 dark:text-slate-400 block text-[10px]">Total Clases Cuatrimestre:</span>
                  <div class="flex items-center gap-1">
                    <input type="number" min="1" value="${info.realTotalClasses}" onchange="app.setSubjectManualTotalClasses('${sub}', this.value)" class="w-16 input-bg border rounded px-1.5 py-0.5 font-mono font-bold text-stone-900 dark:text-white" title="Modificar total de clases del cuatrimestre" />
                    ${r.manualTotalClasses !== undefined ? `<button onclick="app.resetSubjectManualTotalClasses('${sub}')" class="text-[9px] text-stone-400 hover:text-rose-400" title="Restablecer a cálculo automático">↺</button>` : ''}
                  </div>
                </div>
                <div class="space-y-1">
                  <span class="text-stone-500 dark:text-slate-400 block text-[10px]">Máx. Faltas Permitidas:</span>
                  <strong class="font-mono text-theme-main text-sm block pt-0.5">${info.maxAllowed}</strong>
                </div>
              </div>

              <div class="grid grid-cols-2 gap-2 text-[11px] pt-1.5 border-t border-stone-200/60 dark:border-slate-800/80">
                <div class="space-y-1">
                  <span class="text-stone-500 dark:text-slate-400 block text-[10px]">Faltas acumuladas:</span>
                  <div class="flex items-center gap-1">
                    <input type="number" min="0" value="${info.absentTotal}" onchange="app.setSubjectManualAbsentTotal('${sub}', this.value)" class="w-16 input-bg border rounded px-1.5 py-0.5 font-mono font-bold text-theme-accent" title="Modificar faltas acumuladas" />
                    ${r.manualAbsentTotal !== undefined ? `<button onclick="app.resetSubjectManualAbsentTotal('${sub}')" class="text-[9px] text-stone-400 hover:text-rose-400" title="Restablecer a cómputo de semanas">↺</button>` : ''}
                  </div>
                </div>
                <div class="space-y-1">
                  <span class="text-stone-500 dark:text-slate-400 block text-[10px]">Colchón Disponible:</span>
                  <strong class="font-mono text-lg ${info.cushion <= 0 ? 'text-theme-accent' : 'text-theme-main'} block pt-0.5">${info.cushion}</strong>
                </div>
              </div>

              <div class="flex items-center justify-between gap-1 pt-1 text-[10px]">
                <span class="text-stone-500 dark:text-slate-400">Regla:</span>
                <div class="flex items-center gap-1">
                  <select onchange="app.setSubjectRuleType('${sub}', this.value)" class="input-bg border rounded px-1.5 py-0.5 text-[11px]">
                    <option value="percent" ${r.ruleType === 'percent' ? 'selected' : ''}>% Asistencia</option>
                    <option value="fixed" ${r.ruleType === 'fixed' ? 'selected' : ''}>Faltas Fijas</option>
                  </select>
                  <input type="number" value="${r.ruleType === 'percent' ? r.minPercent : r.fixedMaxFails}" onchange="app.setSubjectRuleValue('${sub}', this.value)" class="w-12 input-bg border rounded px-1 py-0.5 text-center font-bold font-mono text-[11px]" />
                </div>
              </div>
            </div>
          `;
        }).join('');
      }

      function calculateSubjectCushion(subject) {
        const rule = state.subjectRules[subject] || { ruleType: 'percent', minPercent: 85, fixedMaxFails: 3 };
        const termWeeks = state.goalsTemplate.academic?.termWeeks || 15;
        let sessionsPerWeek = 0;
        state.scheduleTemplate.forEach(day => {
          day.forEach(c => { if (c.subject === subject) sessionsPerWeek++; });
        });
        const totalBase = sessionsPerWeek * termWeeks;
        let holidaysTotal = 0, absentTotal = 0;
        Object.values(state.weeks).forEach(wk => {
          wk.days.forEach(d => {
            (d.attendance || []).forEach(c => {
              if (c.subject === subject) {
                if (c.status === 'holiday') holidaysTotal++;
                if (c.status === 'absent') absentTotal++;
              }
            });
          });
        });
        const computedClasses = Math.max(1, totalBase - holidaysTotal);
        const realTotalClasses = rule.manualTotalClasses !== undefined ? Number(rule.manualTotalClasses) : computedClasses;
        const realAbsentTotal = rule.manualAbsentTotal !== undefined ? Number(rule.manualAbsentTotal) : absentTotal;
        let maxAllowed = rule.ruleType === 'fixed' ? (Number(rule.fixedMaxFails) || 3) : Math.floor(realTotalClasses * (1 - ((Number(rule.minPercent) || 85) / 100)));
        return { realTotalClasses, maxAllowed, absentTotal: realAbsentTotal, cushion: maxAllowed - realAbsentTotal, rule };
      }

      function getAllRegisteredSubjects() {
        const set = new Set();
        set.add('Estudio General');
        if (state.subjectRules) {
          Object.keys(state.subjectRules).forEach(s => { if (s) set.add(s); });
        }
        if (Array.isArray(state.scheduleTemplate)) {
          state.scheduleTemplate.forEach(day => {
            if (Array.isArray(day)) {
              day.forEach(c => { if (c && c.subject) set.add(c.subject); });
            }
          });
        }
        const w = getActiveWeek();
        if (w && w.studyBySubject) {
          Object.keys(w.studyBySubject).forEach(s => { if (s) set.add(s); });
        }
        return Array.from(set);
      }

      function renderTab4StudySubjects(isWeek) {
        const grid = document.getElementById('tab4StudySubjectsGrid');
        const badge = document.getElementById('tab4StudyTotalBadge');
        if (!grid) return;

        const subjects = getAllRegisteredSubjects();
        const w = getActiveWeek();
        const allWeeks = Object.values(state.weeks || {});

        let scopeTotal = 0;
        const cardsHtml = subjects.map(sub => {
          const curWeekHrs = (w && w.studyBySubject) ? (Number(w.studyBySubject[sub]) || 0) : 0;
          const curGlobalHrs = allWeeks.reduce((acc, wk) => acc + ((wk && wk.studyBySubject) ? (Number(wk.studyBySubject[sub]) || 0) : 0), 0);
          const displayedHrs = isWeek ? curWeekHrs : curGlobalHrs;
          scopeTotal += displayedHrs;

          const safeSub = escapeHtml(sub);
          const subArg = sub.replace(/'/g, "\\'");

          return `
            <div data-subject-id="${subArg}" oncontextmenu="app.openSubjectActionsMenu(event, '${subArg}'); return false;" class="p-3 rounded-xl subpanel-bg border border-stone-200/80 dark:border-slate-800/80 space-y-2 text-xs hover:border-blue-500/50 transition shadow-xs cursor-pointer">
              <div class="flex items-center justify-between gap-1">
                <span class="font-bold text-stone-900 dark:text-white truncate text-xs" title="${safeSub}">${safeSub}</span>
                <div class="flex items-center gap-1.5 shrink-0">
                  <button type="button" onclick="app.promptSetSubjectStudyHours('${subArg}')" class="font-mono font-black text-sm text-theme-main dark:text-blue-400 hover:underline cursor-pointer" title="Editar cifra exacta manualmente">${formatHoursToHMin(displayedHrs)}</button>
                  <button type="button" onclick="app.openSubjectActionsMenu(event, '${subArg}')" oncontextmenu="app.openSubjectActionsMenu(event, '${subArg}'); return false;" class="w-5 h-5 rounded subpanel-bg border border-stone-300/60 dark:border-slate-700/60 hover:border-theme-main text-stone-600 dark:text-slate-300 hover:text-stone-900 dark:hover:text-white flex items-center justify-center font-bold text-[10px] transition shadow-xs" title="Más opciones">•••</button>
                </div>
              </div>
              <div class="flex items-center justify-between text-[10px] text-stone-500 dark:text-slate-400">
                <span>Semana: <strong class="text-stone-800 dark:text-slate-200 font-mono">${formatHoursToHMin(curWeekHrs)}</strong></span>
                <span>Histórico: <strong class="text-emerald-600 dark:text-emerald-400 font-mono">${formatHoursToHMin(curGlobalHrs)}</strong></span>
              </div>
              <div class="flex items-center justify-between gap-1 pt-1.5 border-t border-stone-200/60 dark:border-slate-800/80">
                <div class="flex items-center gap-1">
                  <button type="button" onclick="app.adjustSubjectStudyHours('${subArg}', -1.0)" class="px-1.5 py-0.5 rounded subpanel-bg border hover:border-rose-500 text-rose-500 dark:text-rose-400 font-mono font-bold text-[10px] transition" title="Restar 1 hora a esta semana">-1h</button>
                  <button type="button" onclick="app.adjustSubjectStudyHours('${subArg}', -0.5)" class="px-1.5 py-0.5 rounded subpanel-bg border hover:border-rose-500 text-rose-500 dark:text-rose-400 font-mono font-bold text-[10px] transition" title="Restar 0.5 horas a esta semana">-0.5h</button>
                </div>
                <button type="button" onclick="app.promptSetSubjectStudyHours('${subArg}')" class="px-1.5 py-0.5 rounded subpanel-bg border hover:border-blue-400 text-stone-600 dark:text-slate-300 hover:text-stone-900 dark:hover:text-white font-mono text-[10px] transition" title="Editar cifra exacta manualmente">
                  <svg class="w-3 h-3 inline-block" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
                <div class="flex items-center gap-1">
                  <button type="button" onclick="app.adjustSubjectStudyHours('${subArg}', 0.5)" class="px-1.5 py-0.5 rounded subpanel-bg border hover:border-emerald-500 text-emerald-600 dark:text-emerald-400 font-mono font-bold text-[10px] transition" title="Sumar 0.5 horas a esta semana">+0.5h</button>
                  <button type="button" onclick="app.adjustSubjectStudyHours('${subArg}', 1.0)" class="px-1.5 py-0.5 rounded subpanel-bg border hover:border-emerald-500 text-emerald-600 dark:text-emerald-400 font-mono font-bold text-[10px] transition" title="Sumar 1 hora a esta semana">+1h</button>
                </div>
              </div>
            </div>
          `;
        }).join('');

        grid.innerHTML = cardsHtml;
        if (badge) badge.textContent = formatHoursToHMin(scopeTotal);
      }

      function renderTab4CustomHabits(isWeek) {
        const grid = document.getElementById('tab4CustomHabitsGrid');
        const section = document.getElementById('tab4CustomHabitsSection');
        if (!grid || !section) return;

        const activeHabits = (state.customHabits || []).filter(h => h.active !== false);
        if (activeHabits.length === 0) {
          section.classList.add('hidden');
          return;
        }
        section.classList.remove('hidden');

        const curW = getActiveWeek();
        const curMetrics = calculateWeekMetrics(curW);
        const allWeeks = Object.values(state.weeks || {});

        grid.innerHTML = activeHabits.map(h => {
          const stats = curMetrics.customHabitsStats?.[h.id] || {};
          const curPct = curMetrics.customHabitsPct?.[h.id] || 0;
          const color = getScoreColor(curPct);

          let curDesc = '';
          let histDesc = '';

          if (h.type === 'max_limit') {
            const raw = (curW.customHabitsData?.[h.id] || []).filter(v => v !== null && !isNaN(v)).map(Number);
            const avg = raw.length ? (raw.reduce((a, b) => a + b, 0) / raw.length).toFixed(1) : '0';
            curDesc = `Media sem: ${avg} / máx ${h.targetDaily}${h.unit || 'h'}`;

            // Histórico
            let histSum = 0, histDays = 0;
            allWeeks.forEach(w => {
              const vals = (w.customHabitsData?.[h.id] || []).filter(v => v !== null && !isNaN(v)).map(Number);
              vals.forEach(v => { histSum += v; histDays++; });
            });
            const histAvg = histDays ? (histSum / histDays).toFixed(1) : '0';
            histDesc = `Media histórica: ${histAvg}${h.unit || 'h'}/d`;
          } else if (h.type === 'min_accum') {
            const sum = (curW.customHabitsData?.[h.id] || []).reduce((acc, v) => acc + (Number(v) || 0), 0);
            curDesc = `${sum.toFixed(1)} / ${h.targetWeekly} ${h.unit || ''}`;

            let histSum = 0;
            allWeeks.forEach(w => {
              (w.customHabitsData?.[h.id] || []).forEach(v => { histSum += (Number(v) || 0); });
            });
            histDesc = `Acumulado total: ${histSum.toFixed(1)} ${h.unit || ''}`;
          } else if (h.type === 'binary_check') {
            const daysDone = (curW.customHabitsData?.[h.id] || []).filter(Boolean).length;
            curDesc = `${daysDone} / ${h.targetWeeklyDays || 7} días`;

            let histChecks = 0;
            allWeeks.forEach(w => {
              histChecks += (w.customHabitsData?.[h.id] || []).filter(Boolean).length;
            });
            histDesc = `Días totales cumplidos: ${histChecks}`;
          } else if (h.type === 'target_range') {
            const c = Number(h.targetCenter) || 0;
            const mg = Number(h.targetMargin) || 0;
            const valid = (curW.customHabitsData?.[h.id] || []).filter(v => v !== null && !isNaN(v) && Number(v) >= (c - mg) && Number(v) <= (c + mg)).length;
            curDesc = `${valid} / ${h.targetWeeklyDays || 6} días en diana (${c} ± ${mg})`;

            let histValid = 0;
            allWeeks.forEach(w => {
              histValid += (w.customHabitsData?.[h.id] || []).filter(v => v !== null && !isNaN(v) && Number(v) >= (c - mg) && Number(v) <= (c + mg)).length;
            });
            histDesc = `Total días en diana: ${histValid}`;
          }

          return `
            <div class="p-3 rounded-xl subpanel-bg border border-stone-200/80 dark:border-slate-800/80 space-y-2 text-xs hover:border-theme transition shadow-xs flex flex-col justify-between">
              <div class="space-y-1">
                <div class="flex items-center justify-between gap-1">
                  <span class="font-bold text-stone-900 dark:text-white truncate flex items-center gap-1.5" title="${escapeHtml(h.name)}">
                    <span class="w-5 h-5 rounded subpanel-bg flex items-center justify-center text-theme-main shrink-0">
                      ${renderItemIcon(h.iconId || h.icon || h.emoji || 'star', 'w-3.5 h-3.5 text-theme-main')}
                    </span>
                    <span class="truncate">${escapeHtml(h.name)}</span>
                  </span>
                  <span style="color:${color}" class="font-mono font-black text-xs shrink-0">${Math.round(curPct)}%</span>
                </div>
                <div class="text-[10px] text-stone-500 dark:text-slate-400 font-mono">
                  ${curDesc}
                </div>
              </div>
              <div class="pt-1.5 border-t border-stone-200/60 dark:border-slate-800/80 flex items-center justify-between">
                <span class="text-[9px] text-stone-400 dark:text-slate-400 font-mono truncate">${histDesc}</span>
                <button type="button" onclick="app.setEvolMetric('habit_${h.id}')" class="px-2 py-0.5 rounded subpanel-bg border hover:border-theme text-[9.5px] font-bold text-theme-main transition shrink-0" title="Ver gráfica de evolución">Evolución</button>
              </div>
            </div>
          `;
        }).join('');
      }

      function renderSubjectStudyStatsModal() {
        const container = document.getElementById('modalStudySubjectsList');
        if (!container) return;

        const subjects = getAllRegisteredSubjects();
        const w = getActiveWeek();
        const allWeeks = Object.values(state.weeks || {});

        let weekTotal = 0;
        let globalTotal = 0;

        const cardsHtml = subjects.map(sub => {
          const curWeekHrs = (w && w.studyBySubject) ? (Number(w.studyBySubject[sub]) || 0) : 0;
          const curGlobalHrs = allWeeks.reduce((acc, wk) => acc + ((wk && wk.studyBySubject) ? (Number(wk.studyBySubject[sub]) || 0) : 0), 0);
          weekTotal += curWeekHrs;
          globalTotal += curGlobalHrs;

          const safeSub = escapeHtml(sub);
          const subArg = sub.replace(/'/g, "\\'");

          return `
            <div class="p-3 rounded-xl subpanel-bg border border-stone-200/80 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-2 shadow-xs">
              <div class="min-w-0 flex-1">
                <div class="font-bold text-stone-900 dark:text-white text-xs truncate">${safeSub}</div>
                <div class="flex items-center gap-3 text-[10px] text-stone-500 dark:text-slate-400 mt-0.5">
                  <span>Semana: <strong class="text-theme-main dark:text-blue-400 font-mono font-bold">${formatHoursToHMin(curWeekHrs)}</strong></span>
                  <span>Histórico: <strong class="text-theme-main font-mono font-bold">${formatHoursToHMin(curGlobalHrs)}</strong></span>
                </div>
              </div>
              <div class="flex items-center gap-1 shrink-0">
                <button type="button" onclick="app.adjustSubjectStudyHours('${subArg}', -1.0)" class="px-2 py-1 rounded-lg subpanel-bg border hover:border-theme-accent text-theme-accent font-mono font-bold text-xs transition" title="Restar 1 hora">-1h</button>
                <button type="button" onclick="app.adjustSubjectStudyHours('${subArg}', -0.5)" class="px-2 py-1 rounded-lg subpanel-bg border hover:border-theme-accent text-theme-accent font-mono font-bold text-xs transition" title="Restar 0.5 horas">-30m</button>
                <div class="flex items-center gap-1 mx-1">
                  <input type="number" step="0.5" min="0" value="${curWeekHrs.toFixed(1)}" onchange="app.setSubjectStudyHours('${subArg}', this.value)" class="w-16 input-bg border rounded-lg py-1 px-1.5 text-center font-mono font-bold text-xs outline-none focus:border-theme" title="Editar directamente horas de esta semana" />
                  <span class="text-stone-400 text-xs">h</span>
                </div>
                <button type="button" onclick="app.adjustSubjectStudyHours('${subArg}', 0.5)" class="px-2 py-1 rounded-lg subpanel-bg border hover:border-theme text-theme-main font-mono font-bold text-xs transition" title="Sumar 0.5 horas">+30m</button>
                <button type="button" onclick="app.adjustSubjectStudyHours('${subArg}', 1.0)" class="px-2 py-1 rounded-lg subpanel-bg border hover:border-theme text-theme-main font-mono font-bold text-xs transition" title="Sumar 1 hora">+1h</button>
              </div>
            </div>
          `;
        }).join('');

        container.innerHTML = cardsHtml;
        const elW = document.getElementById('modalStudyWeekTotal');
        if (elW) elW.textContent = formatHoursToHMin(weekTotal);
        const elG = document.getElementById('modalStudyGlobalTotal');
        if (elG) elG.textContent = formatHoursToHMin(globalTotal);
      }

      function renderKpi1BlocksModal() {
        const w = getActiveWeek();
        if (!w) return;
        const m = calculateWeekMetrics(w);
        const streaks = calculateStreaks(w.weekNum);
        const g = w.goals || {};

        const gymReal = w.days.reduce((acc, d) => acc + (d.gym.sessions || 0), 0);
        const gymGoal = Math.max(1, g.gymSessions || 4);

        const runKmReal = w.days.reduce((acc, d) => {
          if (d.run.sessions <= 0) return acc;
          const km1 = Number(d.run.s1?.km) || 0;
          const km2 = d.run.sessions > 1 ? (Number(d.run.s2?.km) || 0) : 0;
          const dayKm = (km1 + km2 > 0) ? (km1 + km2) : (Number(d.run.km) || 0);
          return acc + dayKm;
        }, 0);
        const runKmGoal = Math.max(1, g.runKm || 15);

        const studyReal = w.studyRealHours.reduce((acc, h) => acc + (Number(h) || 0), 0);
        const studyPlan = (w.studyHoursPlan || []).reduce((a, b) => a + Number(b), 0) || 15;

        const attPct = Math.round(m.attPct);
        const attTarget = w.goals.academic?.attMinPercent || 85;

        let nutriPoints = 0;
        w.days.forEach(d => {
          if (d.nutritionScore !== undefined && d.nutritionScore !== null) nutriPoints += Number(d.nutritionScore) || 0;
          else if (d.nutrition === 'success') nutriPoints += 1;
        });
        const nutriSuccess = Math.round(nutriPoints * 10) / 10;
        const nutriGoal = Math.max(1, g.nutri?.minDays || 6);

        const budgetLimit = Number(w.budgetLimit) || 60;
        const spent = m.spent;

        const enabled = getWeekEnabledModules(w);
        const activeHabits = (state?.customHabits || []).filter(h => h.active !== false);

        const allPillars = [];
        if (enabled.gym) {
          allPillars.push({
            id: 'gym',
            name: 'Gimnasio',
            iconSvg: '<svg class="w-4 h-4 text-theme-main" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 5v14M18 5v14M2 9v6M22 9v6M6 12h12"/></svg>',
            current: `${gymReal} ses`,
            target: `${gymGoal} ses`,
            pct: m.gymPct,
            isMet: m.gymPct >= 100,
            actionLabel: 'Ver Registro',
            actionFn: "app.switchTab(1); app.closeModal('modalKpi1Blocks');"
          });
        }
        if (enabled.run) {
          allPillars.push({
            id: 'run',
            name: 'Carrera',
            iconSvg: '<svg class="w-4 h-4 text-theme-main" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>',
            current: `${runKmReal.toFixed(1)} km`,
            target: `${runKmGoal.toFixed(1)} km`,
            pct: m.runPct,
            isMet: m.runPct >= 100,
            actionLabel: 'Ver Registro',
            actionFn: "app.switchTab(1); app.closeModal('modalKpi1Blocks');"
          });
        }
        if (enabled.study) {
          allPillars.push({
            id: 'study',
            name: 'Estudio',
            iconSvg: '<svg class="w-4 h-4 text-theme-main" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>',
            current: formatHoursToHMin(studyReal),
            target: formatHoursToHMin(studyPlan),
            pct: m.studyPct,
            isMet: m.studyPct >= 100,
            actionLabel: 'Ver Asignaturas',
            actionFn: "app.closeModal('modalKpi1Blocks'); app.openSubjectStudyStatsModal();"
          });
        }
        if (enabled.academic) {
          allPillars.push({
            id: 'att',
            name: 'Asistencia Clases',
            iconSvg: '<svg class="w-4 h-4 text-theme-main" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11"/></svg>',
            current: `${attPct}%`,
            target: `Min ${attTarget}%`,
            pct: m.attPct,
            isMet: m.attPct >= attTarget,
            actionLabel: 'Auditar Asistencia',
            actionFn: "app.closeModal('modalKpi1Blocks'); app.openKpi3AttendanceModal();"
          });
        }
        if (enabled.nutri) {
          allPillars.push({
            id: 'nutri',
            name: 'Nutrición / Dieta',
            iconSvg: '<svg class="w-4 h-4 text-theme-main" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a9 9 0 0 1 9 9v1H3v-1a9 9 0 0 1 9-9z"/><path d="M3 16h18a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4z"/></svg>',
            current: `${nutriSuccess} d`,
            target: `${nutriGoal} d`,
            pct: m.nutriPct,
            isMet: m.nutriPct >= 100,
            actionLabel: 'Ver Dieta',
            actionFn: "app.switchTab(1); app.closeModal('modalKpi1Blocks');"
          });
        }
        if (enabled.budget) {
          allPillars.push({
            id: 'fin',
            name: 'Tope Financiero',
            iconSvg: '<svg class="w-4 h-4 text-theme-main" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>',
            current: `${spent.toFixed(2)} €`,
            target: `Tope ${budgetLimit.toFixed(2)} €`,
            pct: m.finPct,
            isMet: m.finPct >= 100,
            actionLabel: 'Ver Finanzas',
            actionFn: "app.closeModal('modalKpi1Blocks'); app.openKpi4BudgetModal();"
          });
        }

        activeHabits.forEach(h => {
          const stats = m.customHabitsStats?.[h.id] || {};
          const p = m.customHabitsPct?.[h.id] || 0;
          let currentStr = '-';
          let targetStr = '-';
          if (h.type === 'max_limit') {
            currentStr = `${stats.sum || 0} ${h.unit || ''}`;
            targetStr = `Máx ${stats.target || h.targetWeekly || 7} ${h.unit || ''}`;
          } else if (h.type === 'min_accum') {
            currentStr = `${stats.sum || 0} ${h.unit || ''}`;
            targetStr = `Min ${stats.target || h.targetWeekly || 10} ${h.unit || ''}`;
          } else if (h.type === 'binary_check') {
            currentStr = `${stats.count || 0} d`;
            targetStr = `Min ${stats.targetDays || h.targetWeeklyDays || 7} d`;
          } else if (h.type === 'target_range') {
            currentStr = `${stats.validDays || 0} d`;
            targetStr = `${h.targetCenter}±${h.targetMargin} (${stats.targetDays || 6}d)`;
          }

          allPillars.push({
            id: h.id,
            name: h.name,
            iconSvg: `<span class="w-6 h-6 rounded flex items-center justify-center text-theme-main shrink-0">${renderItemIcon(h.iconId || h.icon || h.emoji || 'star', 'w-4 h-4 text-theme-main')}</span>`,
            current: currentStr,
            target: targetStr,
            pct: p,
            isMet: stats.isMet !== undefined ? stats.isMet : (p >= 100),
            actionLabel: 'Ver Hábito',
            actionFn: "app.switchTab(1); app.closeModal('modalKpi1Blocks');"
          });
        });

        const pillars = allPillars;
        const blocksMet = pillars.filter(p => p.isMet).length;
        const summaryEl = document.getElementById('modalKpi1BlocksSummary');
        if (summaryEl) summaryEl.textContent = `${blocksMet} / ${pillars.length}`;
        const scoreEl = document.getElementById('modalKpi1ScoreSummary');
        if (scoreEl) scoreEl.textContent = `${m.score} / 100`;
        const streakEl = document.getElementById('modalKpi1StreakText') || document.getElementById('modalKpi1StreakSummary');
        if (streakEl) streakEl.textContent = `${streaks.score || 0} sem`;

        const list = document.getElementById('modalKpi1PillarsList');
        if (!list) return;

        list.innerHTML = pillars.map(p => {
          const color = getScoreColor(p.pct);
          const barWidth = Math.min(100, Math.max(0, p.pct));
          const badgeStatus = p.isMet
            ? '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"><svg class="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg><span>Cumplido</span></span>'
            : (p.pct >= 50
              ? '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30"><span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span><span>En progreso</span></span>'
              : '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/30"><span class="w-1.5 h-1.5 rounded-full bg-rose-500"></span><span>Pendiente</span></span>');

          return `
            <div class="p-3 rounded-xl subpanel-bg border border-stone-200/80 dark:border-slate-800/80 space-y-2 hover:border-stone-400 dark:hover:border-slate-700 transition shadow-xs">
              <div class="flex items-center justify-between gap-2">
                <div class="flex items-center gap-2">
                  <div class="w-7 h-7 rounded-lg bg-theme-soft border border-theme flex items-center justify-center shrink-0">${p.iconSvg}</div>
                  <div>
                    <span class="font-bold text-stone-900 dark:text-white text-xs">${p.name}</span>
                    <span class="text-[10px] text-stone-500 dark:text-slate-400 block">${p.current} / <strong class="text-stone-700 dark:text-slate-300 font-mono">${p.target}</strong></span>
                  </div>
                </div>
                <div class="flex items-center gap-2">
                  ${badgeStatus}
                  <button type="button" onclick="${p.actionFn}" class="px-2 py-1 rounded-lg subpanel-bg border hover:border-blue-500 text-stone-700 dark:text-slate-200 hover:text-blue-500 font-bold text-[10px] transition shrink-0">
                    ${p.actionLabel}
                  </button>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <div class="flex-1 h-2 rounded-full bg-stone-300 dark:bg-slate-950 overflow-hidden border border-stone-300 dark:border-slate-800">
                  <div style="width:${barWidth}%; background-color:${color};" class="h-full rounded-full transition-all duration-300"></div>
                </div>
                <span class="font-mono font-bold text-[10px] text-stone-600 dark:text-slate-400 shrink-0 w-10 text-right">${Math.round(p.pct)}%</span>
              </div>
            </div>
          `;
        }).join('');
      }

      function renderKpi3AttendanceModal() {
        const w = getActiveWeek();
        if (!w) return;
        const m = calculateWeekMetrics(w);

        let pCount = 0, hCount = 0, aCount = 0, pendCount = 0;
        w.days.forEach(d => {
          (d.attendance || []).forEach(c => {
            if (c.status === 'present') pCount++;
            else if (c.status === 'holiday') hCount++;
            else if (c.status === 'absent') aCount++;
            else pendCount++;
          });
        });
        const totalSessions = pCount + hCount + aCount + pendCount || 1;
        const globalPct = Math.round(m.attPct);

        const pctEl = document.getElementById('modalKpi3GlobalPct');
        if (pctEl) pctEl.textContent = `${globalPct}%`;

        const badgeEl = document.getElementById('modalKpi3TargetBadge');
        if (badgeEl) {
          if (globalPct >= 85) {
            badgeEl.className = 'text-[10px] px-2 py-0.5 rounded font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-1';
            badgeEl.innerHTML = '<svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> En objetivo (≥ 85%)';
          } else {
            badgeEl.className = 'text-[10px] px-2 py-0.5 rounded font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/30 flex items-center gap-1';
            badgeEl.innerHTML = '<svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> Bajo mínimo (< 85%)';
          }
        }

        const countsEl = document.getElementById('modalKpi3CountsDetailed');
        if (countsEl) {
          countsEl.innerHTML = `
            <span class="text-emerald-500 font-bold flex items-center gap-1" title="Asistidas"><svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> ${pCount}</span>
            <span class="text-amber-500 font-bold flex items-center gap-1" title="Festivos"><svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg> ${hCount}</span>
            <span class="text-rose-500 font-bold flex items-center gap-1" title="Faltas"><svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> ${aCount}</span>
            <span class="text-slate-400 flex items-center gap-1" title="Pendientes"><svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg> ${pendCount}</span>
          `;
        }

        const barEl = document.getElementById('modalKpi3GlobalBar');
        if (barEl) {
          barEl.innerHTML = `
            <div style="width:${(pCount/totalSessions)*100}%" class="bg-emerald-500 h-full"></div>
            <div style="width:${(hCount/totalSessions)*100}%" class="bg-amber-500 h-full"></div>
            <div style="width:${(aCount/totalSessions)*100}%" class="bg-rose-500 h-full"></div>
            <div style="width:${(pendCount/totalSessions)*100}%" class="bg-slate-700 h-full"></div>
          `;
        }

        const subjectsList = document.getElementById('modalKpi3SubjectsList');
        if (!subjectsList) return;

        const subjectsSet = new Set();
        if (state.scheduleTemplate) {
          state.scheduleTemplate.forEach(day => {
            (day || []).forEach(c => { if (c && c.subject) subjectsSet.add(c.subject); });
          });
        }
        if (state.subjectRules) {
          Object.keys(state.subjectRules).forEach(s => { if (s) subjectsSet.add(s); });
        }
        w.days.forEach(d => {
          (d.attendance || []).forEach(c => { if (c && c.subject) subjectsSet.add(c.subject); });
        });

        const subjects = Array.from(subjectsSet).filter(s => s && s !== 'Estudio General');

        if (subjects.length === 0) {
          subjectsList.innerHTML = `
            <div class="p-4 rounded-xl subpanel-bg border text-center text-stone-400 text-xs">
              No hay asignaturas registradas en el horario lectivo. Puedes añadir asignaturas desde el botón inferior.
            </div>
          `;
          return;
        }

        subjectsList.innerHTML = subjects.map(sub => {
          const cushionInfo = calculateSubjectCushion(sub);
          const safeSub = escapeHtml(sub);

          let weekPresent = 0, weekAbsent = 0, weekHoliday = 0;
          w.days.forEach(d => {
            (d.attendance || []).forEach(c => {
              if (c.subject === sub) {
                if (c.status === 'present') weekPresent++;
                else if (c.status === 'absent') weekAbsent++;
                else if (c.status === 'holiday') weekHoliday++;
              }
            });
          });

          const c = cushionInfo.cushion;
          let badgeClass = '';
          let badgeText = '';
          if (c > 2) {
            badgeClass = 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30';
            badgeText = `${c} faltas de margen`;
          } else if (c > 0) {
            badgeClass = 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30';
            badgeText = `¡Solo ${c} falta${c > 1 ? 's' : ''}!`;
          } else {
            badgeClass = 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30';
            badgeText = `Sin margen (${c} restantes)`;
          }

          const ruleDesc = cushionInfo.rule.ruleType === 'fixed'
            ? `Máx. ${cushionInfo.rule.fixedMaxFails} faltas fijas`
            : `Mínimo ${cushionInfo.rule.minPercent}% asistencia`;

          return `
            <div class="p-3 rounded-xl subpanel-bg border border-stone-200/80 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-2 shadow-xs hover:border-orange-500/50 transition">
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2">
                  <span class="font-bold text-stone-900 dark:text-white text-xs truncate">${safeSub}</span>
                  <span class="px-2 py-0.5 rounded-full text-[10px] font-bold border ${badgeClass}">${badgeText}</span>
                </div>
                <div class="flex flex-wrap items-center gap-3 text-[10px] text-stone-500 dark:text-slate-400 mt-1 font-mono">
                  <span>Cuatrimestre: <strong>${cushionInfo.absentTotal} / ${cushionInfo.maxAllowed}</strong> faltas</span>
                  <span>Esta semana: <strong class="text-emerald-500">${weekPresent} pres</strong>, <strong class="text-rose-500">${weekAbsent} faltas</strong></span>
                  <span class="text-stone-400 italic font-sans">(${ruleDesc})</span>
                </div>
              </div>
            </div>
          `;
        }).join('');
      }

      function renderKpi4BudgetModal() {
        const w = getActiveWeek();
        if (!w) return;
        const m = calculateWeekMetrics(w);
        const todayDayIndex = (new Date().getDay() + 6) % 7;

        const budgetLimit = Number(w.budgetLimit) || 60;
        const spent = m.spent;
        const avail = Math.max(0, budgetLimit - spent);
        const spendPct = budgetLimit > 0 ? (spent / budgetLimit) * 100 : 0;

        const remainingDays = Math.max(1, 7 - todayDayIndex);
        const dailyPacing = (avail / remainingDays).toFixed(1);

        const projected = (spent / (todayDayIndex + 1)) * 7;

        const limitEl = document.getElementById('modalKpi4BudgetLimit');
        if (limitEl) limitEl.textContent = `${budgetLimit.toFixed(2)} €`;

        const spentEl = document.getElementById('modalKpi4Spent');
        if (spentEl) spentEl.textContent = `${spent.toFixed(2)} €`;

        const availEl = document.getElementById('modalKpi4Avail');
        if (availEl) {
          availEl.textContent = `${avail.toFixed(2)} €`;
          availEl.className = avail > 0 ? 'text-theme-main font-mono text-base font-extrabold' : 'text-theme-accent font-mono text-base font-extrabold';
        }

        const pacingEl = document.getElementById('modalKpi4Pacing');
        if (pacingEl) pacingEl.textContent = `~${dailyPacing}€/d`;

        const spentPctEl = document.getElementById('modalKpi4SpentPct');
        if (spentPctEl) spentPctEl.textContent = `Consumo: ${spendPct.toFixed(1)}%`;

        const projEl = document.getElementById('modalKpi4Projected');
        if (projEl) {
          projEl.textContent = `Proyección fin de semana: ~${projected.toFixed(0)}€ ${projected > budgetLimit ? '(Alerta Exceso)' : '(Dentro de límite)'}`;
          projEl.className = projected > budgetLimit ? 'text-theme-accent font-semibold' : 'text-theme-main font-semibold';
        }

        const thermoBar = document.getElementById('modalKpi4ThermoBar');
        if (thermoBar) {
          thermoBar.style.width = `${Math.min(100, spendPct)}%`;
          if (spendPct > 100) thermoBar.className = 'h-full bg-rose-500 transition-all duration-300';
          else if (spendPct >= 80) thermoBar.className = 'h-full bg-amber-500 transition-all duration-300';
          else thermoBar.className = 'h-full bg-emerald-500 transition-all duration-300';
        }

        const catMap = {};
        (w.expenses || []).forEach(e => {
          const cat = e.category || 'Otros';
          const amt = Number(e.amount) || 0;
          catMap[cat] = (catMap[cat] || 0) + amt;
        });

        const catList = document.getElementById('modalKpi4CategoriesList');
        if (!catList) return;

        // Agrupación mensual de gastos históricos de todas las semanas
        const monthNames = [
          'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
          'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
        ];
        const monthlyGroups = {};

        Object.values(state.weeks || {}).forEach(wk => {
          const wkDateRange = getWeekDateRange(wk.weekNum);
          (wk.expenses || []).forEach(e => {
            let itemDate = null;
            if (e.date) {
              itemDate = new Date(e.date + 'T00:00:00');
            } else if (wkDateRange && wkDateRange.start) {
              const dOffset = Number(e.dayIndex) || 0;
              itemDate = new Date(wkDateRange.start.getTime() + dOffset * 86400000);
            }
            const monthKey = itemDate && !isNaN(itemDate.getTime())
              ? `${itemDate.getFullYear()}-${String(itemDate.getMonth() + 1).padStart(2, '0')}`
              : 'Actual';
            const monthLabel = itemDate && !isNaN(itemDate.getTime())
              ? `${monthNames[itemDate.getMonth()]} ${itemDate.getFullYear()}`
              : 'Semana Actual';

            if (!monthlyGroups[monthKey]) {
              monthlyGroups[monthKey] = { label: monthLabel, total: 0, categories: {} };
            }

            const amt = Number(e.amount) || 0;
            const cat = e.category || 'Otros';
            monthlyGroups[monthKey].total += amt;
            monthlyGroups[monthKey].categories[cat] = (monthlyGroups[monthKey].categories[cat] || 0) + amt;
          });
        });

        const sortedMonths = Object.keys(monthlyGroups).sort().reverse();

        if (sortedMonths.length === 0) {
          catList.innerHTML = `
            <div class="p-4 rounded-xl subpanel-bg border text-center text-stone-400 text-xs">
              No hay movimientos de gastos registrados en el historial.
            </div>
          `;
          return;
        }

        catList.innerHTML = sortedMonths.map(mKey => {
          const grp = monthlyGroups[mKey];
          const sortedCats = Object.entries(grp.categories).sort((a, b) => b[1] - a[1]);
          return `
            <div class="p-3 rounded-xl subpanel-bg border border-stone-200/80 dark:border-slate-800/80 space-y-2 shadow-xs">
              <div class="flex items-center justify-between border-b pb-1.5 border-stone-200/60 dark:border-slate-800/80">
                <div class="flex items-center gap-1.5">
                  <svg class="w-3.5 h-3.5 text-theme-main" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                  <span class="font-bold text-stone-900 dark:text-white text-xs">${grp.label}</span>
                </div>
                <div class="flex items-center gap-1">
                  <span class="text-[10px] text-stone-500 dark:text-slate-400">Total Mes:</span>
                  <strong class="font-mono font-black text-theme-accent text-xs">${grp.total.toFixed(2)} €</strong>
                </div>
              </div>
              <div class="space-y-1.5 pt-0.5">
                ${sortedCats.map(([cat, amt]) => {
                  const pct = grp.total > 0 ? (amt / grp.total) * 100 : 0;
                  const emoji = cat.split(' ')[0] || '📦';
                  const cleanName = cat.replace(/^[^\s]+\s*/, '');
                  return `
                    <div class="space-y-0.5">
                      <div class="flex items-center justify-between text-[11px]">
                        <span class="text-stone-700 dark:text-slate-300 truncate flex items-center gap-1">
                          <span class="emoji-sticker text-[10px]">${emoji}</span>
                          <span>${escapeHtml(cleanName || cat)}</span>
                        </span>
                        <span class="font-mono font-bold text-stone-800 dark:text-slate-200">${amt.toFixed(2)} € <span class="text-[9px] text-stone-400 font-normal">(${pct.toFixed(0)}%)</span></span>
                      </div>
                      <div class="h-1.5 w-full rounded-full bg-stone-300 dark:bg-slate-950 overflow-hidden border border-stone-300 dark:border-slate-800">
                        <div style="width:${pct}%" class="h-full bg-theme-main rounded-full"></div>
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>
          `;
        }).join('');
      }

      function updateBulkToolbar() {
        const bar = document.getElementById('bulkActionsToolbar');
        const badge = document.getElementById('bulkSelectedCountBadge');
        const btnToggle = document.getElementById('btnToggleSelectModeText');
        
        if (badge) badge.textContent = selectedListItemIds.size;
        if (btnToggle) {
          btnToggle.textContent = (selectionModeActive || selectedListItemIds.size > 0) ? `Selección (${selectedListItemIds.size})` : 'Seleccionar';
        }
        if (bar) {
          if (selectedListItemIds.size > 0 || selectionModeActive) {
            bar.classList.remove('hidden');
          } else {
            bar.classList.add('hidden');
          }
        }
      }

      // RENDER PESTAÑA 3: FINANZAS PRO
      function renderTab3() {
        const w = getActiveWeek();
        const s = state.financeSettings;

        document.getElementById('finModeManualBtn').className = s.mode === 'manual' ? 'px-2.5 py-1 rounded-lg font-bold bg-theme-main text-white shadow-xs' : 'px-2.5 py-1 rounded-lg font-bold text-slate-400 hover:text-white transition';
        document.getElementById('finModeAutoBtn').className = s.mode === 'auto' ? 'px-2.5 py-1 rounded-lg font-bold bg-theme-main text-white shadow-xs' : 'px-2.5 py-1 rounded-lg font-bold text-slate-400 hover:text-white transition';

        document.getElementById('tab3ManualBudgetInput').value = s.manualBudget;
        document.getElementById('tab3MonthlyIncome').value = s.monthlyIncome;
        document.getElementById('tab3MonthlySavings').value = s.monthlySavingsGoal;
        document.getElementById('tab3AntThreshold').value = s.antThreshold;

        // Saldo, Meta Mensual de Ahorro y Evolución de Fondo (Hucha)
        const piggyBal = Number(state.piggyBank.balance) || 0;
        document.getElementById('tab3PiggyBalanceDisplay').textContent = `${piggyBal.toFixed(2)} €`;

        const savingsGoal = Number(s.monthlySavingsGoal) || 100;
        const now = new Date();
        const curYear = now.getFullYear();
        const curMonth = now.getMonth();
        const monthDeposits = (state.piggyBank.history || []).filter(h => {
          const d = new Date(h.date);
          return d.getFullYear() === curYear && d.getMonth() === curMonth && h.amount > 0;
        }).reduce((sum, h) => sum + h.amount, 0);

        const goalPct = savingsGoal > 0 ? Math.min(100, Math.round((monthDeposits / savingsGoal) * 100)) : 0;
        const goalPctEl = document.getElementById('tab3PiggyGoalPct');
        const progBarEl = document.getElementById('tab3PiggyProgressBar');
        const monthSavingsEl = document.getElementById('tab3PiggyMonthSavings');
        const goalTargetEl = document.getElementById('tab3PiggyGoalTarget');
        const histCountEl = document.getElementById('tab3PiggyHistoryCount');
        const sparkContainer = document.getElementById('tab3PiggySparkline');

        if (goalPctEl) goalPctEl.textContent = `${goalPct}%`;
        if (progBarEl) progBarEl.style.width = `${goalPct}%`;
        if (monthSavingsEl) monthSavingsEl.textContent = `${monthDeposits.toFixed(2)} € acumulados`;
        if (goalTargetEl) goalTargetEl.textContent = `Meta: ${savingsGoal.toFixed(2)} €`;

        const historyCount = (state.piggyBank.history || []).length;
        if (histCountEl) histCountEl.textContent = `${historyCount} movimientos`;

        if (sparkContainer) {
          if (historyCount === 0) {
            sparkContainer.innerHTML = `<span class="text-[10px] text-slate-500 italic">Sin transacciones registradas</span>`;
          } else {
            const recentHist = state.piggyBank.history.slice(-12);
            let running = piggyBal - recentHist.reduce((acc, h) => acc + h.amount, 0);
            const points = [];
            recentHist.forEach(h => {
              running += h.amount;
              points.push(running);
            });
            if (points.length === 1) points.unshift(points[0]);
            const minP = Math.min(...points);
            const maxP = Math.max(...points);
            const range = maxP - minP || 1;
            const svgW = 260;
            const svgH = 36;
            const pad = 4;
            const coords = points.map((val, idx) => {
              const x = pad + (idx / (points.length - 1)) * (svgW - pad * 2);
              const y = svgH - pad - ((val - minP) / range) * (svgH - pad * 2);
              return `${x.toFixed(1)},${y.toFixed(1)}`;
            });
            const pathD = `M ${coords.join(' L ')}`;
            const fillD = `M ${coords[0].split(',')[0]},${svgH} L ${coords.join(' L ')} L ${coords[coords.length - 1].split(',')[0]},${svgH} Z`;

            sparkContainer.innerHTML = `
              <svg class="w-full h-full overflow-visible" viewBox="0 0 ${svgW} ${svgH}" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="piggyGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="var(--theme-700)" stop-opacity="0.35"/>
                    <stop offset="100%" stop-color="var(--theme-700)" stop-opacity="0.0"/>
                  </linearGradient>
                </defs>
                <path d="${fillD}" fill="url(#piggyGrad)"></path>
                <path d="${pathD}" fill="none" stroke="var(--theme-700)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
              </svg>
            `;
          }
        }

        // Gastos Fijos Mensuales (Líneas Editoriales Hairline)
        const fixedContainer = document.getElementById('tab3FixedItemsList');
        if (state.monthlyFixedItems.length === 0) {
          fixedContainer.innerHTML = `<span class="text-stone-400 dark:text-slate-500 text-xs py-3 block text-center italic">Sin recibos fijos mensuales.</span>`;
        } else {
          fixedContainer.innerHTML = state.monthlyFixedItems.map((item, idx) => `
            <div class="hairline-row flex items-center justify-between text-xs py-2 px-1 cursor-pointer" oncontextmenu="app.toggleFixedPaid('${item.id}'); return false;">
              <div class="flex items-center gap-2.5 min-w-0">
                <span class="catalog-idx w-5">${String(idx + 1).padStart(2, '0')}</span>
                <button onclick="app.toggleFixedPaid('${item.id}')" class="w-4 h-4 rounded flex items-center justify-center transition-all ${item.paid ? 'bg-theme-main text-white' : 'border border-stone-300 dark:border-slate-700 hover:border-theme-main text-transparent'}" title="${item.paid ? 'Marcado como pagado' : 'Pendiente de pago'}">
                  <svg class="w-3 h-3 stroke-current" viewBox="0 0 24 24" fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                </button>
                <span class="font-bold text-slate-100 dark:text-white truncate ${item.paid ? 'line-through opacity-60' : ''}">${item.name}</span>
              </div>
              <div class="flex items-center gap-3 shrink-0">
                <span class="font-mono font-extrabold text-cyan-500 dark:text-cyan-400">${Number(item.amount).toFixed(2)} €</span>
                <div class="hairline-actions flex items-center gap-1">
                  <button onclick="app.deleteFixedItem('${item.id}')" class="p-1 rounded text-stone-400 hover:text-rose-400 transition" title="Eliminar recibo">✕</button>
                </div>
              </div>
            </div>
          `).join('');
        }

        const fixedTotal = state.monthlyFixedItems.reduce((acc, it) => acc + (Number(it.amount) || 0), 0);
        document.getElementById('tab3FixedTotalDisplay').textContent = `${fixedTotal.toFixed(2)} €`;

        // Gastos Semanales (Líneas Editoriales Hairline)
        const totalSpend = (w.expenses || []).reduce((acc, it) => acc + (Number(it.amount) || 0), 0);
        document.getElementById('tab3WeekTotalSpend').textContent = `Total Gastado: ${totalSpend.toFixed(2)} € de ${Number(w.budgetLimit).toFixed(2)} €`;

        const expContainer = document.getElementById('tab3ExpensesTableContainer');
        if (w.expenses.length === 0) {
          expContainer.innerHTML = `<span class="text-stone-400 dark:text-slate-500 text-center block py-4 text-xs italic">No hay gastos en esta semana.</span>`;
        } else {
          expContainer.innerHTML = [...w.expenses].reverse().map(e => {
            const emoji = (e.category || '📦').split(' ')[0] || '📦';
            return `
              <div data-expense-id="${e.id}" oncontextmenu="app.openExpenseActionsMenu(event, '${e.id}'); return false;" class="hairline-row flex items-center justify-between text-xs py-2 px-1 cursor-pointer">
                <div class="flex items-center gap-2 truncate">
                  <span class="px-1.5 py-0.5 rounded font-mono font-bold text-[10px] bg-stone-200 dark:bg-slate-800 text-stone-700 dark:text-cyan-300 border border-stone-300 dark:border-slate-700 shrink-0">${DAYS[e.dayIndex] || 'LUN'}</span>
                  <span class="emoji-sticker text-[11px] shrink-0">${emoji}</span>
                  <span class="font-bold text-slate-100 dark:text-white truncate">${e.concept}</span>
                  <span class="text-[10px] text-stone-400 dark:text-slate-400 truncate hidden sm:inline">${(e.category || '').replace(/^[^\s]+\s*/, '')}</span>
                </div>
                <div class="flex items-center gap-2.5 shrink-0">
                  <span class="font-mono font-extrabold text-emerald-500 dark:text-emerald-400">${Number(e.amount).toFixed(2)} €</span>
                  <div class="hairline-actions flex items-center gap-1">
                    <button onclick="app.openEditExpenseModal('${e.id}')" class="p-1 rounded text-stone-400 hover:text-cyan-400 transition" title="Editar gasto">
                      <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    <button onclick="app.deleteExpense('${e.id}')" class="p-1 rounded text-stone-400 hover:text-rose-400 transition" title="Eliminar gasto">✕</button>
                    <button type="button" onclick="app.openExpenseActionsMenu(event, '${e.id}')" oncontextmenu="app.openExpenseActionsMenu(event, '${e.id}'); return false;" class="w-6 h-6 rounded-lg subpanel-bg border border-stone-300/60 dark:border-slate-700/60 hover:border-theme-main text-stone-600 dark:text-slate-300 hover:text-stone-900 dark:hover:text-white flex items-center justify-center font-bold text-xs transition shadow-xs" title="Más opciones">•••</button>
                  </div>
                </div>
              </div>
            `;
          }).join('');
        }

        // Formulario inline categorías y sugerencias frecuentes en Pestaña 3
        const inlineCat = document.getElementById('tab3InlineCategory');
        inlineCat.innerHTML = (state.financeSettings.customCategories || []).map(c => `<option value="${c.emoji} ${c.name}">${c.emoji} ${c.name}</option>`).join('');

        app.renderTab3ConceptChips(document.getElementById('tab3InlineConcept')?.value || '');

        // Gráfica de Distribución de Gastos Diarios por Categoría (Lunes a Domingo)
        renderDailyExpenseChart(w, totalSpend);

        // Analítica Gastos Hormiga por Categoría y Concepto
        const antTh = Number(s.antThreshold) || 5.0;
        const antExpenses = w.expenses.filter(e => Number(e.amount) <= antTh);
        const antSum = antExpenses.reduce((a, b) => a + Number(b.amount), 0);
        document.getElementById('tab3AntPercentageBadge').textContent = `${antSum.toFixed(2)} € (${totalSpend > 0 ? ((antSum/totalSpend)*100).toFixed(1) : 0}% del gasto)`;

        document.getElementById('tab3AntSummaryCards').innerHTML = `
          <div class="p-3 rounded-xl subpanel-bg border">
            <span class="text-stone-500 dark:text-slate-400 text-[11px]">Micro-pagos Hormiga:</span>
            <div class="text-xl font-extrabold font-mono text-stone-900 dark:text-white">${antExpenses.length} <span class="text-xs text-stone-500 dark:text-slate-400 font-normal">de ${w.expenses.length} compras</span></div>
            <div class="text-[10px] text-theme-main font-semibold">${((antExpenses.length / (w.expenses.length || 1)) * 100).toFixed(0)}% del volumen total</div>
          </div>
          <div class="p-3 rounded-xl subpanel-bg border">
            <span class="text-stone-500 dark:text-slate-400 text-[11px]">Impacto Económico:</span>
            <div class="text-xl font-extrabold text-theme-accent font-mono">${antSum.toFixed(2)} €</div>
            <div class="text-[10px] text-stone-500 dark:text-slate-400">${((antSum / (w.budgetLimit || 1)) * 100).toFixed(1)}% del tope semanal</div>
          </div>
          <div class="col-span-2 sm:col-span-1 p-3 rounded-xl subpanel-bg border">
            <span class="text-stone-500 dark:text-slate-400 text-[11px]">Ticket Promedio Hormiga:</span>
            <div class="text-xl font-extrabold text-theme-main font-mono">${antExpenses.length > 0 ? (antSum / antExpenses.length).toFixed(2) : '0.00'} €</div>
            <div class="text-[10px] text-stone-500 dark:text-slate-400">Media por micro-compra</div>
          </div>
        `;

        // 1. Fuga de Dinero por Categoría
        const catMap = {};
        antExpenses.forEach(e => {
          const cat = e.category || 'Otros';
          if (!catMap[cat]) catMap[cat] = { count: 0, sum: 0 };
          catMap[cat].count++;
          catMap[cat].sum += Number(e.amount);
        });

        const sortedCats = Object.entries(catMap).sort((a, b) => b[1].sum - a[1].sum);
        document.getElementById('tab3AntCategoryBreakdown').innerHTML = sortedCats.length === 0 ? `<span class="text-slate-400 text-xs">Sin micro-gastos registrados.</span>` : sortedCats.map(([cat, info]) => {
          const pct = antSum > 0 ? (info.sum / antSum) * 100 : 0;
          return `
            <div class="p-2 rounded-xl subpanel-bg border space-y-1">
              <div class="flex justify-between items-center text-xs">
                <span class="font-bold text-stone-900 dark:text-white">${cat}</span>
                <span class="font-mono font-extrabold text-theme-accent">${info.sum.toFixed(2)} € (${pct.toFixed(0)}%)</span>
              </div>
              <div class="h-2 w-full bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                <div style="width: ${pct}%" class="h-full bg-theme-accent rounded-full"></div>
              </div>
            </div>
          `;
        }).join('');

        // 2. Ranking de Conceptos con Insignia de Categoría (Líneas Editoriales Hairline con botón ↗)
        const conceptRanking = {};
        antExpenses.forEach(e => {
          const key = e.concept.trim().toLowerCase();
          if (!conceptRanking[key]) conceptRanking[key] = { label: e.concept, category: e.category, count: 0, sum: 0 };
          conceptRanking[key].count++;
          conceptRanking[key].sum += Number(e.amount);
        });

        const sortedRanking = Object.values(conceptRanking).sort((a, b) => b.sum - a.sum);
        document.getElementById('tab3AntRanking').innerHTML = sortedRanking.length === 0 ? `<span class="text-stone-400 dark:text-slate-500 text-xs py-2 block italic">No hay micro-gastos registrados.</span>` : sortedRanking.map((item, idx) => {
          const emoji = (item.category || '📦').split(' ')[0] || '📦';
          return `
            <div class="hairline-row flex items-center justify-between text-xs py-2 px-1 cursor-pointer" oncontextmenu="app.toggleFixedPaid('${item.id}'); return false;">
              <div class="flex items-center gap-2.5 truncate">
                <span class="catalog-idx w-5">${String(idx + 1).padStart(2, '0')}</span>
                <span class="emoji-sticker text-[11px] shrink-0">${emoji}</span>
                <span class="font-bold text-slate-100 dark:text-white truncate">${item.label}</span>
                <span class="px-1.5 py-0.2 rounded font-mono text-[9px] bg-stone-200 dark:bg-slate-800 text-cyan-700 dark:text-cyan-300 font-bold border border-stone-300 dark:border-slate-700 shrink-0">x${item.count}</span>
              </div>
              <div class="flex items-center gap-3 shrink-0">
                <span class="font-mono font-bold text-rose-500 dark:text-rose-400">${item.sum.toFixed(2)} €</span>
                <button type="button" onclick="app.fillTab3Concept('${item.label.replace(/'/g, "\\'")}')" class="w-6 h-6 rounded-full subpanel-bg border border-stone-300 dark:border-slate-700 hover:border-cyan-400 text-stone-400 hover:text-cyan-400 flex items-center justify-center font-bold text-xs transition" title="Registrar otro gasto de este concepto">↗</button>
              </div>
            </div>
          `;
        }).join('');

        // Metas de Ahorro Individuales
        renderSavingsGoals();
      }

      function renderSavingsGoals() {
        const container = document.getElementById('tab3SavingsGoalsGrid');
        if (!container) return;
        const goals = state.savingsGoals || [];

        if (goals.length === 0) {
          container.innerHTML = `
            <div class="col-span-full py-8 text-center border-2 border-dashed border-stone-200 dark:border-slate-800 rounded-2xl">
              <div class="vector-seal bg-theme-main text-white w-10 h-10 mx-auto mb-2.5 shadow-sm">
                <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle></svg>
              </div>
              <p class="font-serif font-bold text-sm text-stone-800 dark:text-slate-200">No tienes metas de ahorro activas</p>
              <p class="text-xs text-stone-500 dark:text-slate-400 max-w-sm mx-auto mt-1 mb-4">Crea una meta para tu próximo viaje, compra tecnológica, fondo de emergencia o capricho personal.</p>
              <button type="button" onclick="app.openAddSavingsGoalModal()" class="px-3.5 py-1.5 rounded-xl bg-theme-main text-white font-semibold text-xs shadow-md border border-theme inline-flex items-center gap-1.5 active:translate-y-0.5 transition">
                <span>+</span> Crear Primera Meta
              </button>
            </div>
          `;
          return;
        }

        container.innerHTML = goals.map(g => {
          const target = Number(g.target) || 0;
          const saved = Number(g.saved) || 0;
          const pct = target > 0 ? Math.min(100, Math.round((saved / target) * 100)) : 0;
          const isCompleted = target > 0 && saved >= target;
          const remaining = Math.max(0, target - saved);

          const goalIconSvg = isCompleted
            ? `<div class="vector-seal bg-theme-accent text-white w-6 h-6 shadow-xs shrink-0"><svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg></div>`
            : `<div class="vector-seal bg-theme-main text-white w-6 h-6 shadow-xs shrink-0"><svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle></svg></div>`;

          return `
            <div class="p-3.5 rounded-2xl subpanel-bg border border-stone-200 dark:border-slate-800 flex flex-col justify-between gap-3 shadow-xs relative overflow-hidden transition hover:border-theme/60">
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                  <div class="flex items-center gap-2">
                    ${goalIconSvg}
                    <h3 class="font-bold text-sm text-stone-900 dark:text-white truncate" title="${g.title}">${g.title}</h3>
                  </div>
                  <span class="text-[10px] text-stone-500 dark:text-slate-400 font-mono mt-0.5 block">
                    ${isCompleted ? '¡Meta conseguida!' : `Faltan ${remaining.toFixed(2)} €`}
                  </span>
                </div>
                <button type="button" onclick="app.deleteSavingsGoal('${g.id}')" class="p-1 rounded text-stone-400 hover:text-rose-500 transition text-xs" title="Eliminar meta">✕</button>
              </div>

              <div class="space-y-1.5">
                <div class="flex items-baseline justify-between text-xs font-mono">
                  <span class="font-extrabold text-theme-main text-sm">${saved.toFixed(2)} €</span>
                  <span class="text-stone-500 dark:text-slate-400 font-semibold text-[11px]">/ ${target.toFixed(2)} € (${pct}%)</span>
                </div>
                <div class="w-full h-2 rounded-full bg-stone-200 dark:bg-slate-800 overflow-hidden border border-stone-300 dark:border-slate-700">
                  <div class="h-full bg-theme-main transition-all duration-300 rounded-full" style="width: ${pct}%"></div>
                </div>
              </div>

              <div class="flex items-center gap-2 pt-1 border-t border-stone-200/60 dark:border-slate-800/80">
                <button type="button" onclick="app.openContributeSavingsGoalModal('${g.id}')" class="flex-1 py-1.5 rounded-xl bg-theme-main hover:opacity-95 text-white font-semibold text-xs flex items-center justify-center gap-1 shadow-xs border border-theme active:translate-y-0.5 transition">
                  <span>±</span> Aportar / Retirar
                </button>
              </div>
            </div>
          `;
        }).join('');
      }

      // COLORES PARA CATEGORÍAS DE FINANZAS (UNIFICADOS A LA PALETA BICOLOR ACTIVA CON MÁXIMO CONTRASTE)
      function getCategoryColor(cat) {
        const palKey = ACCENT_PALETTES[state?.themePalette || 'blue_red'] ? state.themePalette : 'blue_red';
        const pal = ACCENT_PALETTES[palKey] || ACCENT_PALETTES.blue_red;
        const isDark = (typeof state !== 'undefined' && state?.theme) ? (state.theme === 'dark') : document.documentElement.classList.contains('dark');
        const colors = isDark ? pal.dark : pal.light;

        // Alternancia de contraste alto: primario profundo, acento vivo, primario suave/medio, acento oscuro, neutro
        const palette = [
          colors.theme700,
          colors.accent,
          colors.theme500,
          colors.accentHover,
          isDark ? '#38BDF8' : '#0369A1',
          colors.theme900
        ];
        if (!cat) return palette[0];
        let hash = 0;
        for (let i = 0; i < cat.length; i++) {
          hash = cat.charCodeAt(i) + ((hash << 5) - hash);
        }
        return palette[Math.abs(hash) % palette.length];
      }

      // RENDER GRÁFICA DE GASTOS DIARIOS POR CATEGORÍA
      function renderDailyExpenseChart(w, totalSpend) {
        if (!w) w = getActiveWeek();
        if (totalSpend === undefined) {
          totalSpend = (w.expenses || []).reduce((acc, it) => acc + (Number(it.amount) || 0), 0);
        }
        const dateRange = getWeekDateRange(w.weekNum);
        const todayIdx = (new Date().getDay() + 6) % 7;
        
        // Datos por día (0 = LUN ... 6 = DOM)
        const daysData = [0, 1, 2, 3, 4, 5, 6].map(dIdx => {
          const dayExpenses = (w.expenses || []).filter(e => Number(e.dayIndex) === dIdx);
          const dayTotal = dayExpenses.reduce((sum, e) => sum + Number(e.amount), 0);
          
          const catMap = {};
          dayExpenses.forEach(e => {
            const cat = (e.category || '📦 Otros').trim();
            if (!catMap[cat]) catMap[cat] = { cat, sum: 0, count: 0, items: [] };
            catMap[cat].sum += Number(e.amount);
            catMap[cat].count++;
            catMap[cat].items.push(e);
          });
          const catSegments = Object.values(catMap).sort((a, b) => b.sum - a.sum);

          return {
            dIdx,
            name: DAYS[dIdx],
            fullName: DAY_FULL[dIdx],
            dateNum: dateRange.daysDates ? dateRange.daysDates[dIdx] : null,
            dayTotal,
            expenses: dayExpenses,
            catSegments
          };
        });

        // Insignias Pico, Media y Tope Semanal adaptadas a la paleta activa
        const peakDay = [...daysData].sort((a, b) => b.dayTotal - a.dayTotal)[0];
        const peakEl = document.getElementById('tab3DailyPeakBadge');
        if (peakEl) {
          peakEl.textContent = peakDay && peakDay.dayTotal > 0 ? `Pico: ${peakDay.name} (${peakDay.dayTotal.toFixed(2)}€)` : `Pico: 0.00€`;
          peakEl.className = 'px-2.5 py-1 rounded-xl bg-theme-accent-soft border border-theme-accent text-theme-accent font-mono font-bold text-[11px]';
        }
        const avgEl = document.getElementById('tab3DailyAvgBadge');
        if (avgEl) {
          avgEl.textContent = `Media: ${(totalSpend / 7).toFixed(2)}€/d`;
          avgEl.className = 'px-2.5 py-1 rounded-xl bg-theme-soft border border-theme text-theme-main font-mono font-bold text-[11px]';
        }
        const budgetEl = document.getElementById('tab3DailyBudgetBadge');
        if (budgetEl) {
          const wTop = w.weeklyLimit || 60;
          const pct = Math.round((totalSpend / wTop) * 100);
          budgetEl.textContent = `Tope: ${totalSpend.toFixed(2)} / ${wTop}€ (${pct}%)`;
          if (pct >= 100) {
            budgetEl.className = 'px-2.5 py-1 rounded-xl bg-theme-accent-soft border border-theme-accent font-mono font-bold text-theme-accent text-[11px]';
          } else if (pct >= 80) {
            budgetEl.className = 'px-2.5 py-1 rounded-xl bg-theme-accent-soft border border-theme-accent font-mono font-bold text-theme-accent text-[11px]';
          } else {
            budgetEl.className = 'px-2.5 py-1 rounded-xl bg-theme-soft border border-theme font-mono font-bold text-theme-main text-[11px]';
          }
        }

        // Leyenda de Categorías de toda la semana
        const weekCatMap = {};
        (w.expenses || []).forEach(e => {
          const cat = (e.category || '📦 Otros').trim();
          if (!weekCatMap[cat]) weekCatMap[cat] = { cat, sum: 0, count: 0 };
          weekCatMap[cat].sum += Number(e.amount);
          weekCatMap[cat].count++;
        });
        const sortedWeekCats = Object.values(weekCatMap).sort((a, b) => b.sum - a.sum);
        const legendContainer = document.getElementById('tab3DailyCategoryLegend');
        if (legendContainer) {
          if (sortedWeekCats.length === 0) {
            legendContainer.innerHTML = `<span class="text-stone-400 dark:text-slate-500 text-xs italic">No hay gastos registrados en esta semana todavía.</span>`;
          } else {
            legendContainer.innerHTML = sortedWeekCats.map(c => {
              const color = getCategoryColor(c.cat);
              const pct = totalSpend > 0 ? (c.sum / totalSpend) * 100 : 0;
              return `
                <div class="flex items-center gap-1.5 px-2.5 py-1 rounded-xl subpanel-bg border border-stone-200/80 dark:border-slate-800/80 shadow-sm text-xs">
                  <span class="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm" style="background-color: ${color}"></span>
                  <span class="font-bold text-stone-800 dark:text-slate-100">${c.cat}</span>
                  <span class="font-mono font-extrabold text-theme-accent ml-1">${c.sum.toFixed(2)} €</span>
                  <span class="text-[10px] text-stone-500 dark:text-slate-400">(${pct.toFixed(0)}%)</span>
                </div>
              `;
            }).join('');
          }
        }

        // Gráfico SVG de Barras Apiladas con Acabado Fintech
        const maxSpend = Math.max(...daysData.map(d => d.dayTotal), 10);
        let selectedIdx = state.ui.selectedExpenseChartDayIndex;
        if (selectedIdx === undefined || selectedIdx === null || selectedIdx < 0 || selectedIdx > 6) {
          selectedIdx = todayIdx;
          state.ui.selectedExpenseChartDayIndex = selectedIdx;
        }

        const svgW = 700;
        const svgH = 225;
        const chartTop = 36;
        const baseline = 175;
        const chartH = baseline - chartTop; // 139

        let svgHtml = `<svg viewBox="0 0 ${svgW} ${svgH}" class="w-full h-auto select-none" xmlns="http://www.w3.org/2000/svg">`;
        svgHtml += `<defs>`;
        // Clip paths individuales con esquinas redondeadas pill rx="8"
        daysData.forEach((d, i) => {
          const totalBarH = Math.max(10, (d.dayTotal / maxSpend) * chartH);
          const barW = 50;
          const xCenter = 62 + i * 94;
          const xBar = xCenter - (barW / 2);
          const barY = baseline - totalBarH;
          svgHtml += `
            <clipPath id="chart-bar-clip-${i}">
              <rect x="${xBar}" y="${barY}" width="${barW}" height="${totalBarH}" rx="8" />
            </clipPath>
          `;
        });
        svgHtml += `</defs>`;

        // Líneas guía horizontales elegantes
        [0.25, 0.5, 0.75, 1.0].forEach(ratio => {
          const y = baseline - (ratio * chartH);
          const val = (ratio * maxSpend).toFixed(0);
          svgHtml += `
            <line x1="28" y1="${y}" x2="${svgW - 15}" y2="${y}" stroke="currentColor" stroke-width="0.8" stroke-dasharray="3 3" opacity="0.12" />
            <text x="25" y="${y + 3}" text-anchor="end" font-size="9" font-family="monospace" fill="currentColor" opacity="0.45">${val}€</text>
          `;
        });
        svgHtml += `<line x1="28" y1="${baseline}" x2="${svgW - 15}" y2="${baseline}" stroke="currentColor" stroke-width="1.2" opacity="0.25" />`;

        // Columnas por día
        const barW = 50;
        daysData.forEach((d, i) => {
          const xCenter = 62 + i * 94;
          const xBar = xCenter - (barW / 2);
          const isSelected = (i === selectedIdx);
          const isToday = (i === todayIdx);

          // Fondo de selección activa
          if (isSelected) {
            svgHtml += `
              <rect x="${xCenter - 43}" y="10" width="86" height="206" rx="14" fill="var(--theme-100)" stroke="var(--theme-700)" stroke-width="1.6" />
            `;
          }

          // Pista trasera de la columna (Track Background estilo Fintech)
          svgHtml += `
            <rect x="${xBar}" y="${chartTop}" width="${barW}" height="${chartH}" rx="10" fill="currentColor" opacity="0.05" />
          `;

          // Borde distintivo para HOY
          if (isToday && !isSelected) {
            svgHtml += `
              <rect x="${xBar - 3}" y="${chartTop - 3}" width="${barW + 6}" height="${chartH + 6}" rx="12" fill="none" stroke="var(--theme-accent)" stroke-width="1.2" stroke-dasharray="3 2" opacity="0.75" />
            `;
          }

          // Etiqueta superior de importe total del día
          const totalFill = d.dayTotal > 0 ? (isSelected ? 'var(--theme-700)' : 'currentColor') : 'currentColor';
          const totalOpacity = d.dayTotal > 0 ? (isSelected ? '1' : '0.85') : '0.35';
          svgHtml += `
            <text x="${xCenter}" y="26" text-anchor="middle" font-size="11" font-weight="bold" font-family="monospace" fill="${totalFill}" opacity="${totalOpacity}">
              ${d.dayTotal > 0 ? d.dayTotal.toFixed(2) + '€' : '0€'}
            </text>
          `;

          // Barra apilada con esquinas pill redondeadas o indicador sutil de día sin gastos
          if (d.dayTotal === 0) {
            svgHtml += `
              <circle cx="${xCenter}" cy="${baseline - 10}" r="3.5" fill="currentColor" opacity="0.2" />
            `;
          } else {
            const totalBarH = Math.max(10, (d.dayTotal / maxSpend) * chartH);
            let currentY = baseline;
            const barStroke = state.theme === 'dark' ? '#0F172A' : '#FBF9F5';
            svgHtml += `<g clip-path="url(#chart-bar-clip-${i})">`;
            d.catSegments.forEach((seg) => {
              const segH = Math.max(2, (seg.sum / d.dayTotal) * totalBarH);
              const segY = currentY - segH;
              currentY = segY;
              const color = getCategoryColor(seg.cat);
              svgHtml += `
                <rect x="${xBar}" y="${segY}" width="${barW}" height="${segH}" fill="${color}" stroke="${barStroke}" stroke-width="1.5" opacity="${isSelected ? '1' : '0.94'}" class="transition-all hover:opacity-100 cursor-pointer">
                  <title>${d.fullName}: ${seg.cat} - ${seg.sum.toFixed(2)}€ (${((seg.sum/d.dayTotal)*100).toFixed(0)}%)</title>
                </rect>
              `;
            });
            svgHtml += `</g>`;
          }

          // Etiquetas de día en la base
          const dayNameColor = isSelected ? 'var(--theme-700)' : (isToday ? 'var(--theme-accent)' : 'currentColor');
          const dayNameWeight = (isSelected || isToday) ? 'bold' : 'normal';
          const dayNameOpacity = (isSelected || isToday) ? '1' : '0.65';
          const dateStr = d.dateNum ? ` ${d.dateNum}` : '';
          svgHtml += `
            <text x="${xCenter}" y="196" text-anchor="middle" font-size="11" font-weight="${dayNameWeight}" fill="${dayNameColor}" opacity="${dayNameOpacity}">
              ${d.name}${dateStr}
            </text>
          `;

          if (isToday) {
            svgHtml += `
              <g>
                <circle cx="${xCenter}" cy="208" r="3" fill="var(--theme-accent)" />
                <circle cx="${xCenter}" cy="208" r="5" fill="none" stroke="var(--theme-accent)" stroke-width="0.8" opacity="0.6" />
              </g>
            `;
          }

          // Zona interactiva de clic para la columna completa
          svgHtml += `
            <rect x="${xCenter - 43}" y="10" width="86" height="206" rx="14" fill="transparent" class="cursor-pointer" onclick="app.selectExpenseChartDay(${i})">
              <title>Clic para inspeccionar el desglose de ${d.fullName}</title>
            </rect>
          `;
        });

        svgHtml += `</svg>`;

        const chartContainer = document.getElementById('tab3DailyChartSvgContainer');
        if (chartContainer) {
          chartContainer.innerHTML = svgHtml;
        }

        // Render Inspector / Detalle del Día
        const detailContainer = document.getElementById('tab3DailyDayDetailBox');
        if (detailContainer) {
          const selectedDay = daysData[selectedIdx] || daysData[0];
          const isSelectedToday = (selectedDay.dIdx === todayIdx);
          const dateDisplay = selectedDay.dateNum ? `(${selectedDay.dateNum})` : '';

          let detailHtml = `
            <div class="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
              <div class="flex items-center gap-2">
                <span class="text-sm font-extrabold flex items-center gap-1.5">
                  <svg class="w-4 h-4 text-theme-main" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                  <span>${selectedDay.fullName} ${dateDisplay}</span>
                </span>
                ${isSelectedToday ? '<span class="px-2 py-0.5 rounded-full bg-theme-accent-soft border border-theme-accent text-theme-accent font-bold text-[10px]">HOY</span>' : ''}
              </div>
              <div class="flex items-center gap-2">
                <span class="text-xs text-slate-400">Total Día:</span>
                <span class="font-mono font-extrabold text-sm ${selectedDay.dayTotal > 0 ? 'text-theme-accent' : 'text-theme-main'}">${selectedDay.dayTotal.toFixed(2)} €</span>
              </div>
            </div>
          `;

          if (selectedDay.expenses.length === 0) {
            detailHtml += `
              <div class="py-3 text-center text-slate-400 font-medium text-xs flex items-center justify-center gap-2">
                <span>✨</span> Sin gastos registrados este día. ¡Día de ahorro perfecto! (0.00 €)
              </div>
            `;
          } else {
            detailHtml += `
              <div class="space-y-1.5 pt-1">
                <span class="font-bold text-[11px] block text-slate-300">Gasto por Categorías en ${selectedDay.fullName}:</span>
                <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                  ${selectedDay.catSegments.map(seg => {
                    const color = getCategoryColor(seg.cat);
                    const pct = (seg.sum / selectedDay.dayTotal) * 100;
                    return `
                      <div class="p-2 rounded-xl subpanel-bg border space-y-1 shadow-sm">
                        <div class="flex items-center justify-between text-[11px]">
                          <div class="flex items-center gap-1.5 truncate">
                            <span class="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm" style="background-color: ${color}"></span>
                            <span class="font-bold truncate text-slate-200">${seg.cat}</span>
                          </div>
                          <span class="text-[10px] text-slate-400 font-mono">${pct.toFixed(0)}%</span>
                        </div>
                        <div class="text-xs font-mono font-extrabold" style="color: ${color}">${seg.sum.toFixed(2)} €</div>
                      </div>
                    `;
                  }).join('')}
                </div>
              </div>

              <!-- Listado de compras individuales de este día -->
              <div class="pt-2 border-t space-y-1.5">
                <span class="font-bold text-[11px] block text-slate-300">Compras registradas (${selectedDay.expenses.length}):</span>
                <div class="space-y-1 max-h-44 overflow-y-auto pr-1">
                  ${selectedDay.expenses.map(e => {
                    const color = getCategoryColor(e.category);
                    return `
                      <div class="p-2 rounded-xl subpanel-bg border flex items-center justify-between text-xs hover:border-cyan-500/50 transition">
                        <div class="flex items-center gap-2 truncate">
                          <span class="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm" style="background-color: ${color}"></span>
                          <span class="font-bold truncate">${e.concept}</span>
                          <span class="text-[10px] text-slate-400 truncate">(${e.category || ''})</span>
                        </div>
                        <div class="flex items-center gap-2 shrink-0">
                          <span class="font-mono font-extrabold text-cyan-400">${Number(e.amount).toFixed(2)} €</span>
                          <button onclick="app.openEditExpenseModal('${e.id}')" class="text-slate-400 hover:text-cyan-400 p-1 transition" title="Editar gasto">
                            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                          </button>
                          <button onclick="app.deleteExpense('${e.id}')" class="text-slate-400 hover:text-rose-400 font-bold px-1" title="Eliminar gasto">✕</button>
                        </div>
                      </div>
                    `;
                  }).join('')}
                </div>
              </div>
            `;
          }

          detailContainer.innerHTML = detailHtml;
        }
      }

      // RENDER PESTAÑA 4: ESTADÍSTICAS Y LAB
      function renderTab4() {
        const isWeek = state.ui.labScope === 'week';
        document.getElementById('labScopeWeekBtn').className = isWeek ? 'px-3 py-1 rounded-lg bg-theme-main text-white font-bold shadow-xs' : 'px-3 py-1 rounded-lg text-slate-400 hover:text-white transition';
        document.getElementById('labScopeHistBtn').className = !isWeek ? 'px-3 py-1 rounded-lg bg-theme-main text-white font-bold shadow-xs' : 'px-3 py-1 rounded-lg text-slate-400 hover:text-white transition';

        // Siluetas Anatómicas Detalladas
        document.getElementById('anatomySvgContainer').innerHTML = renderSvgAnatomy();

        // Estadísticas y Registro de Estudio por Asignatura
        renderTab4StudySubjects(isWeek);

        // Rendimiento y Analítica de Hábitos Personalizados
        renderTab4CustomHabits(isWeek);

        // Conteo Sistemas Running
        const weeksToScan = isWeek ? [getActiveWeek()] : Object.values(state.weeks);
        let seriesCount = 0, rodajeCount = 0, tiradaCount = 0, totalKm = 0;
        weeksToScan.forEach(w => {
          if (!w) return;
          w.days.forEach(d => {
            if (d.run && d.run.sessions > 0) {
              const checkRun = (sess) => {
                if (!sess) return;
                const type = (sess.type || '').toLowerCase();
                if (type.includes('series') || type.includes('cross')) seriesCount++;
                else if (type.includes('rodaje') || type.includes('recuperación')) rodajeCount++;
                else if (type.includes('tirada')) tiradaCount++;
                else if (type.includes('otro')) {
                  const sys = sess.customSystem || 'series';
                  if (sys === 'series') seriesCount++;
                  else if (sys === 'rodaje') rodajeCount++;
                  else if (sys === 'tirada') tiradaCount++;
                }
              };
              checkRun(d.run.s1);
              if (d.run.sessions >= 2) checkRun(d.run.s2);
              totalKm += Number(d.run.km) || 0;
            }

            // Cardio dentro de sesión de gimnasio
            if (d.gym && d.gym.sessions > 0) {
              const checkGymCardio = (sess) => {
                if (!sess || !sess.cardio || !sess.cardio.enabled) return;
                const sys = sess.cardio.type || 'rodaje';
                if (sys === 'series') seriesCount++;
                else if (sys === 'rodaje') rodajeCount++;
                else if (sys === 'tirada') tiradaCount++;
                if (sess.cardio.km) {
                  totalKm += Number(sess.cardio.km) || 0;
                }
              };
              checkGymCardio(d.gym.s1);
              if (d.gym.sessions >= 2) checkGymCardio(d.gym.s2);
            }
          });
        });

        // Radar Chart Tri-Sistema
        document.getElementById('runningRadarSvgContainer').innerHTML = renderTriSystemRadar(seriesCount, rodajeCount, tiradaCount, totalKm);

        // Diagnóstico Fisiológico en vivo
        const diagBox = document.getElementById('runningDiagnosisBox');
        if (totalKm === 0) {
          diagBox.innerHTML = `<span class="text-slate-400">Sin sesiones de carrera en este periodo.</span>`;
        } else {
          let diagText = 'Balance aeróbico óptimo con base sólida.';
          let diagColor = 'text-theme-main';
          if (seriesCount > rodajeCount && seriesCount > 0) {
            diagText = 'Alta carga anaeróbica (VO2 Max). Se aconseja meter más rodaje suave para regenerar.';
            diagColor = 'text-theme-accent';
          } else if (tiradaCount > 0 && totalKm >= 20) {
            diagText = 'Excelente fondo muscular. Gran adaptación a esfuerzos prolongados.';
            diagColor = 'text-theme-main';
          }
          diagBox.innerHTML = `
            <div class="font-bold ${diagColor} flex items-center gap-1.5">
              <svg class="w-3.5 h-3.5 ${diagColor} shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                ${seriesCount > rodajeCount && seriesCount > 0 ? '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>' : '<polyline points="20 6 9 17 4 12"/>'}
              </svg>
              <span>${diagText}</span>
            </div>
            <div class="text-[10px] text-stone-500 dark:text-slate-400 font-mono">${seriesCount} ses. series • ${rodajeCount} rodajes • ${tiradaCount} tiradas largas</div>
          `;
        }

        // Pista de atletismo
        const curWk = getActiveWeek();
        const curMetrics = calculateWeekMetrics(curWk);
        const curKm = curMetrics.runKmReal;
        const goalKm = curWk.goals.runKm || 15;
        document.getElementById('trackDistanceBadge').textContent = `${curKm.toFixed(1)} / ${goalKm.toFixed(1)} km`;
        document.getElementById('runningTrackSvgContainer').innerHTML = renderSvgTrack(curKm, goalKm);

        // Gráfico de Evolución
        const metric = state.ui.evolMetric || 'score';
        const baseMetrics = ['score', 'study', 'km', 'spend'];
        baseMetrics.forEach(m => {
          const btn = document.getElementById(`evolMetric${m.charAt(0).toUpperCase() + m.slice(1)}`);
          if (btn) {
            btn.className = m === metric ? 'px-2.5 py-1 rounded-lg font-bold bg-theme-main text-white shadow-xs' : 'px-2.5 py-1 rounded-lg text-slate-400 font-bold hover:text-white transition';
          }
        });

        // Botones dinámicos de hábitos en el selector de evolución
        const habitsEvolBox = document.getElementById('tab4HabitsEvolButtons');
        if (habitsEvolBox) {
          const activeHabits = (state.customHabits || []).filter(h => h.active !== false);
          habitsEvolBox.innerHTML = activeHabits.map(h => {
            const isSel = metric === `habit_${h.id}`;
            return `<button onclick="app.setEvolMetric('habit_${h.id}')" class="px-2 py-1 rounded-lg font-bold text-xs transition flex items-center gap-1.5 ${isSel ? 'bg-theme-main text-white shadow-xs' : 'text-stone-500 dark:text-slate-400 hover:text-stone-900 dark:hover:text-white'}"><span>${renderItemIcon(h.iconId || h.icon || h.emoji || 'star', 'w-3 h-3')}</span><span class="truncate max-w-[80px]">${escapeHtml(h.name)}</span></button>`;
          }).join('');
        }

        document.getElementById('evolutionChartContainer').innerHTML = renderEvolutionLineChart(metric);

        // Heatmap
        const weeks = Object.values(state.weeks).sort((a, b) => a.weekNum - b.weekNum);
        document.getElementById('consistencyHeatmapGrid').innerHTML = `
          <div class="grid grid-cols-${Math.min(12, Math.max(4, weeks.length))} gap-1.5 min-w-[320px]">
            ${weeks.map(wk => {
              const m = calculateWeekMetrics(wk);
              const color = getScoreColor(m.score);
              return `
                <div class="p-2 rounded-xl subpanel-bg border text-center space-y-1">
                  <span class="text-[10px] font-bold text-slate-400">S${wk.weekNum}</span>
                  <div style="background-color: ${color}" class="w-full h-5 rounded-md flex items-center justify-center font-mono font-black text-[10px] text-white shadow-2xs">${m.score}</div>
                </div>
              `;
            }).join('')}
          </div>
        `;

        // Historial Editable (Líneas Editoriales Hairline con botón ↗)
        document.getElementById('historyWeeksList').innerHTML = weeks.map(wk => {
          const m = calculateWeekMetrics(wk);
          return `
            <div class="hairline-row flex items-center justify-between text-xs py-2.5 px-1">
              <div class="flex items-center gap-3">
                <span class="catalog-idx font-mono font-bold text-xs text-theme-accent">S${String(wk.weekNum).padStart(2, '0')}</span>
                <div>
                  <span class="font-extrabold text-slate-100 dark:text-white">Semana #${wk.weekNum}</span>
                  <span class="text-[10px] text-stone-400 dark:text-slate-400 ml-2 font-mono">Score: <strong class="text-theme-main">${m.score}/100</strong> • Gasto: ${m.spent.toFixed(1)}€</span>
                </div>
              </div>
              <button onclick="app.loadWeekForEditing(${wk.weekNum})" class="px-2.5 py-1 rounded-xl subpanel-bg border hover:border-theme font-semibold text-theme-main flex items-center gap-1.5 transition text-xs">
                <span>Editar</span>
                <span class="text-xs">↗</span>
              </button>
            </div>
          `;
        }).join('');
      }

      
      function updateHeaderDailyProgress() {
        const w = getActiveWeek();
        if (!w) return;
        const todayIdx = (new Date().getDay() + 6) % 7;
        const day = (w.days && w.days[todayIdx]) || {};
        const enabled = getWeekEnabledModules(w);
        const activeHabits = (state.customHabits || []).filter(h => h.active !== false);
        const habitsData = w.customHabitsData || {};
        
        let totalTasks = 0;
        let doneTasks = 0;

        // 1. Pilares base de hoy (si están habilitados)
        if (enabled.gym) {
          totalTasks += 1;
          if (day.gym && day.gym.sessions > 0) doneTasks += 1;
        }
        if (enabled.run) {
          totalTasks += 1;
          if (day.run && day.run.km > 0) doneTasks += 1;
        }
        if (enabled.study) {
          const sPlan = Number((w.studyHoursPlan && w.studyHoursPlan[todayIdx]) || 0);
          const sReal = Number((w.studyRealHours && w.studyRealHours[todayIdx]) || 0);
          if (sPlan > 0) {
            totalTasks += 1;
            if (sReal >= sPlan) doneTasks += 1;
          }
        }
        if (enabled.nutri) {
          const nEval = evalNutritionStatus(day.nutritionKcal, w.goals?.nutri?.kcal, w.goals?.nutri?.phase);
          if (nEval) {
            totalTasks += 1;
            if (nEval.status === 'ok') doneTasks += 1;
          }
        }

        // 2. Hábitos personalizados de hoy
        activeHabits.forEach(h => {
          if (h.isReminderOnly) return; // Hábitos configurados como solo recordatorio no computan
          const activeDays = Array.isArray(h.activeDays) ? h.activeDays : [0, 1, 2, 3, 4, 5, 6];
          if (h.type === 'binary_check' && !activeDays.includes(todayIdx)) return;
          const val = (habitsData[h.id] || [])[todayIdx];
          const slots = Number(h.slotsCount) || 1;
          if (h.type === 'binary_check' && slots > 1) {
            totalTasks += slots;
            if (Array.isArray(val)) {
              doneTasks += val.filter(Boolean).length;
            } else if (val) {
              doneTasks += slots;
            }
          } else if (h.type === 'binary_check') {
            totalTasks += 1;
            if (val === true || val === 1 || val === 'true') doneTasks += 1;
          } else if (h.type === 'max_limit') {
            totalTasks += 1;
            if (val !== null && val !== undefined && Number(val) <= Number(h.targetDaily)) doneTasks += 1;
          } else if (h.type === 'min_accum') {
            totalTasks += 1;
            if (val !== null && val !== undefined && Number(val) >= (Number(h.targetDaily) || 1)) doneTasks += 1;
          } else if (h.type === 'target_range') {
            totalTasks += 1;
            const c = Number(h.targetCenter) || 0, mg = Number(h.targetMargin) || 0;
            if (val !== null && val !== undefined && Number(val) >= (c - mg) && Number(val) <= (c + mg)) doneTasks += 1;
          }
        });

        const pct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;
        const textEl = document.getElementById('headerDailyProgressText');
        const barEl = document.getElementById('headerDailyProgressBar');
        const pillEl = document.getElementById('headerDailyProgressPill');
        if (pillEl) pillEl.classList.toggle('hidden', totalTasks === 0);
        if (textEl) textEl.textContent = 'Hoy: ' + doneTasks + '/' + totalTasks + ' (' + pct + '%)';
        if (barEl) barEl.style.width = pct + '%';
      }

      function renderApp() {
        if (window.WorkspacesManager) {
          try {
            window.WorkspacesManager.ensureWorkspaces();
            window.WorkspacesManager.renderNavBar();
            window.WorkspacesManager.mountActiveWorkspace();
          } catch (e) { console.error('Error in WorkspacesManager:', e); }
        }
        try { renderHeaderAndKPIs(); } catch (e) { console.error('Error in renderHeaderAndKPIs:', e); }
        try { renderDockExpenseUI(); } catch (e) { console.error('Error in renderDockExpenseUI:', e); }
        try { renderPomodoroUI(); } catch (e) { console.error('Error in renderPomodoroUI:', e); }
        if (state.activeTab === 1) {
          try { renderDailyHabits(); } catch (e) { console.error('Error in renderDailyHabits:', e); }
          try { renderQuickExpensesUI(); } catch (e) { console.error('Error in renderQuickExpensesUI:', e); }
          try { renderListsTree(); } catch (e) { console.error('Error in renderListsTree:', e); }
        } else if (state.activeTab === 2) {
          try { renderTab2(); } catch (e) { console.error('Error in renderTab2:', e); }
        } else if (state.activeTab === 3) {
          try { renderTab3(); } catch (e) { console.error('Error in renderTab3:', e); }
        } else if (state.activeTab === 4) {
          try { renderTab4(); } catch (e) { console.error('Error in renderTab4:', e); }
        }

        // Renderizado reactivo de soporte para widgets anatómicos o de biometría en cualquier ventana
        const anatContainer = document.getElementById('anatomySvgContainer');
        if (anatContainer && (!anatContainer.innerHTML || anatContainer.children.length === 0)) {
          try { anatContainer.innerHTML = renderSvgAnatomy(); } catch (e) {}
        }
        const radarContainer = document.getElementById('runningRadarSvgContainer');
        if (radarContainer && (!radarContainer.innerHTML || radarContainer.children.length === 0)) {
          try {
            const isWk = state.ui?.labScope === 'week';
            const weeksScan = isWk ? [getActiveWeek()] : Object.values(state.weeks);
            let sCount = 0, rCount = 0, tCount = 0, kmTotal = 0;
            weeksScan.forEach(wk => {
              if (!wk) return;
              wk.days.forEach(d => {
                if (d.run && d.run.km > 0) {
                  kmTotal += d.run.km;
                  if (d.run.type === 'series') sCount++;
                  else if (d.run.type === 'rodaje') rCount++;
                  else if (d.run.type === 'tirada') tCount++;
                }
              });
            });
            radarContainer.innerHTML = renderTriSystemRadar(sCount, rCount, tCount, kmTotal);
          } catch (e) {}
        }
      }

      if (typeof window !== 'undefined') {
        window.renderApp = renderApp;
        window.renderDailyHabits = renderDailyHabits;
        window.renderTab2 = renderTab2;
        window.renderTab3 = renderTab3;
        window.renderTab4 = renderTab4;
      }

      // NOTIFICACIONES TOAST PLANAS Y DIRECTAS (CERO RECURSIÓN)
      function renderSystemToast(message, type = 'info', duration = 3000) {
        const container = document.getElementById('toastContainer');
        if (!container) {
          console.log('[Toast ' + type + ']:', message);
          return;
        }
        const icons = {
          info: '<svg class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
          success: '<svg class="w-4 h-4 shrink-0 text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
          warning: '<svg class="w-4 h-4 shrink-0 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
          error: '<svg class="w-4 h-4 shrink-0 text-rose-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>'
        };
        const borderColors = {
          info: 'border-theme bg-theme-soft text-theme-main shadow-xl border',
          success: 'border-theme bg-theme-soft text-theme-main shadow-xl border',
          warning: 'border-theme-accent bg-theme-accent-soft text-theme-accent shadow-xl border',
          error: 'border-theme-accent bg-theme-accent-soft text-theme-accent shadow-xl border',
          emerald: 'border-theme bg-theme-soft text-theme-main shadow-xl border',
          indigo: 'border-theme bg-theme-soft text-theme-main shadow-xl border'
        };
        const icon = icons[type] || icons.info;
        const styleClass = borderColors[type] || borderColors.info;

        const toast = document.createElement('div');
        toast.className = `p-3 rounded-2xl border shadow-2xl backdrop-blur-md flex items-center gap-2.5 text-xs font-semibold transition-all duration-300 pointer-events-auto cursor-pointer transform translate-y-2 opacity-0 ${styleClass}`;
        toast.innerHTML = `<span class="shrink-0 flex items-center">${icon}</span><span class="flex-1 leading-snug">${message}</span>`;
        toast.onclick = () => {
          toast.classList.add('opacity-0', 'translate-y-2');
          setTimeout(() => toast.remove(), 250);
        };

        container.appendChild(toast);
        requestAnimationFrame(() => {
          toast.classList.remove('opacity-0', 'translate-y-2');
        });

        setTimeout(() => {
          if (toast.parentNode) {
            toast.classList.add('opacity-0', '-translate-y-2');
            setTimeout(() => toast.remove(), 250);
          }
        }, duration);
      }
      window.renderSystemToast = renderSystemToast;
      window.showToast = renderSystemToast;

      // APP ACCIONES Y MÉTODOS PÚBLICOS
      const app = {
        enterWidgetMode() {
          // Deprecated
        },

        exitWidgetMode() {
          const c = document.getElementById('miniWidgetContainer');
          if (c) c.remove();
          document.body.classList.remove('mode-mini-widget');
        },

        dismissBanner(bannerId) {
          if (!this.dismissedBannersInMemory) this.dismissedBannersInMemory = new Set();
          this.dismissedBannersInMemory.add(bannerId);
          if (state.ui && state.ui.dismissedBanners) {
            delete state.ui.dismissedBanners[bannerId];
          }
          try {
            sessionStorage.removeItem('dismissedBanner_' + bannerId);
          } catch (e) {}
          const el = document.getElementById(bannerId);
          if (el) el.classList.add('hidden');
          this.showToast('Aviso cerrado. Volverá a mostrarse al recargar si hay tareas pendientes.', 'info', 1600);
        },

        isBannerDismissed(bannerId) {
          return !!(this.dismissedBannersInMemory && this.dismissedBannersInMemory.has(bannerId));
        },

        showToast(message, type = 'info', duration = 3000) {
          renderSystemToast(message, type, duration);
        },

        showConfirm({ title = '¿Estás seguro?', message = '', confirmText = 'Aceptar', cancelText = 'Cancelar', isDanger = false } = {}) {
          return new Promise((resolve) => {
            customConfirmResolve = resolve;
            const modal = document.getElementById('modalCustomConfirm');
            if (!modal) return resolve(false);

            document.getElementById('customConfirmTitle').textContent = title;
            document.getElementById('customConfirmMessage').textContent = message;

            const okBtn = document.getElementById('customConfirmOkBtn');
            const cancelBtn = document.getElementById('customConfirmCancelBtn');
            const iconBox = document.getElementById('customConfirmIconBox');

            okBtn.textContent = confirmText;
            cancelBtn.textContent = cancelText;

            if (isDanger) {
              okBtn.className = 'px-5 py-2 rounded-xl bg-theme-accent hover:bg-theme-accent font-bold text-white shadow-md border border-theme-accent/60 active:translate-y-0.5 transition';
              iconBox.className = 'w-10 h-10 rounded-xl bg-rose-950/80 border border-rose-600/60 text-rose-400 flex items-center justify-center shrink-0';
              iconBox.innerHTML = '<svg class="w-5 h-5 text-rose-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>';
            } else {
              okBtn.className = 'px-5 py-2 rounded-xl bg-theme-main hover:opacity-90 font-bold text-white shadow-md border border-theme/60 active:translate-y-0.5 transition';
              iconBox.className = 'w-10 h-10 rounded-xl bg-blue-950/80 border border-blue-600/60 text-blue-400 flex items-center justify-center shrink-0';
              iconBox.innerHTML = '<svg class="w-5 h-5 text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>';
            }

            const cleanup = () => {
              okBtn.onclick = null;
              cancelBtn.onclick = null;
              modal.onclick = null;
              modal.classList.add('hidden');
              customConfirmResolve = null;
            };

            okBtn.onclick = () => { cleanup(); resolve(true); };
            cancelBtn.onclick = () => { cleanup(); resolve(false); };
            modal.onclick = (e) => { if (e.target === modal) { cleanup(); resolve(false); } };

            modal.classList.remove('hidden');
          });
        },

        showPrompt({ title = 'Introducir dato', message = '', defaultValue = '', placeholder = '', confirmText = 'Aceptar', cancelText = 'Cancelar' } = {}) {
          return new Promise((resolve) => {
            customPromptResolve = resolve;
            const modal = document.getElementById('modalCustomPrompt');
            if (!modal) return resolve(null);

            document.getElementById('customPromptTitle').textContent = title;
            document.getElementById('customPromptMessage').textContent = message;
            const input = document.getElementById('customPromptInput');
            input.value = defaultValue || '';
            input.placeholder = placeholder || '';

            const okBtn = document.getElementById('customPromptOkBtn');
            const cancelBtn = document.getElementById('customPromptCancelBtn');

            okBtn.textContent = confirmText;
            cancelBtn.textContent = cancelText;

            const cleanup = () => {
              okBtn.onclick = null;
              cancelBtn.onclick = null;
              input.onkeydown = null;
              modal.onclick = null;
              modal.classList.add('hidden');
              customPromptResolve = null;
            };

            const doConfirm = () => {
              const val = input.value;
              cleanup();
              resolve(val);
            };

            const doCancel = () => {
              cleanup();
              resolve(null);
            };

            okBtn.onclick = doConfirm;
            cancelBtn.onclick = doCancel;
            modal.onclick = (e) => { if (e.target === modal) doCancel(); };
            input.onkeydown = (e) => {
              if (e.key === 'Enter') { e.preventDefault(); doConfirm(); }
              else if (e.key === 'Escape') { e.preventDefault(); doCancel(); }
            };

            modal.classList.remove('hidden');
            setTimeout(() => { input.focus(); input.select(); }, 50);
          });
        },

        setMilestoneIdx(i) {
          state.ui.milestoneIdx = i;
          renderMilestoneWidget();
          saveState();
        },
        prevMilestone() {
          const all = getAllUpcomingMilestones();
          const urgent = all.filter(m => m.diffDays <= 3);
          const list = urgent.length > 0 ? urgent : all;
          if (list.length > 0) {
            state.ui.milestoneIdx = ((state.ui.milestoneIdx || 0) - 1 + list.length) % list.length;
            renderMilestoneWidget();
            saveState();
          }
        },
        nextMilestone() {
          const all = getAllUpcomingMilestones();
          const urgent = all.filter(m => m.diffDays <= 3);
          const list = urgent.length > 0 ? urgent : all;
          if (list.length > 0) {
            state.ui.milestoneIdx = ((state.ui.milestoneIdx || 0) + 1) % list.length;
            renderMilestoneWidget();
            saveState();
          }
        },
        completeMilestoneDirect(cat, id) {
          const found = findNodeAndParentInTree(state.lists[cat] || [], id);
          if (!found) return;
          if (found.node.status !== undefined) found.node.status = 'done';
          found.node.done = true;
          setChildrenStatusCascade(found.node, true);
          updateParentsStatusCascade(state.lists[cat] || [], id);

          this.showToast(`¡Hito completado: "${found.node.title}"! 🎉`, 'success');
          renderListsTree();
          renderHeaderAndKPIs();
          saveState();
        },
        highlightListItem(id) {
          if (!id) return;
          const cat = state.ui.listTab || 'entregas';
          // 1. Desplegar recursivamente todos los ancestros si el elemento está dentro de carpetas plegadas
          function unfoldAncestors(nodes, targetId) {
            for (const n of nodes) {
              if (n.id === targetId) return true;
              if (Array.isArray(n.children) && n.children.length > 0) {
                if (unfoldAncestors(n.children, targetId)) {
                  n.collapsed = false;
                  return true;
                }
              }
            }
            return false;
          }
          if (unfoldAncestors(state.lists[cat] || [], id)) {
            renderListsTree();
          }

          // 2. Localizar el elemento en el DOM y hacer scroll + destello
          setTimeout(() => {
            const el = document.getElementById(`list-item-${id}`);
            if (el) {
              el.scrollIntoView({ behavior: 'smooth', block: 'center' });
              el.classList.add('ring-4', 'ring-theme-accent', 'scale-[1.02]');
              setTimeout(() => {
                el.classList.remove('scale-[1.02]');
              }, 400);
              setTimeout(() => {
                el.classList.remove('ring-4', 'ring-theme-accent');
              }, 2200);
            }
          }, 80);
        },
        jumpToMilestone(cat, id) {
          this.switchTab(1);
          this.switchListTab(cat);
          setTimeout(() => {
            this.highlightListItem(id);
          }, 180);
        },
        switchTab(tabNum) {
          if (state && state.activeTab === 2) this.autoSaveGoalSetting();
          state.activeTab = tabNum;
          if (window.WorkspacesManager) {
            const workspaces = window.WorkspacesManager.getWorkspaces();
            if (workspaces[tabNum - 1]) {
              window.WorkspacesManager.switchWorkspace(workspaces[tabNum - 1].id);
              return;
            }
          }
          this.applyUiPreferences();
          this.applyGridLayout('tab' + tabNum);
          if (state.ui && state.ui.isBoardEditMode) {
            const titleEl = document.getElementById('boardEditTitle');
            if (titleEl) titleEl.textContent = 'Modo Edición: Cuadrícula 12×H (Pestaña ' + tabNum + ')';
            this.renderBoardEditHandles('tab' + tabNum);
          }
          for (let i = 1; i <= 4; i++) {
            const sec = document.getElementById(`tab${i}`);
            const btn = document.getElementById(`tabNav${i}`);
            const mobileBtn = document.getElementById(`mobileTabNav${i}`);
            if (i === tabNum) {
              if (sec) sec.classList.remove('hidden');
              if (btn) btn.className = 'px-3 py-1.5 rounded-lg bg-theme-main text-white font-bold whitespace-nowrap shadow-md';
              if (mobileBtn) mobileBtn.className = 'flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition text-theme-main font-bold';
            } else {
              if (sec) sec.classList.add('hidden');
              if (btn) btn.className = 'px-3 py-1.5 rounded-lg text-stone-600 dark:text-slate-400 hover:text-stone-950 dark:hover:text-white font-bold whitespace-nowrap';
              if (mobileBtn) mobileBtn.className = 'flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition text-stone-500 dark:text-slate-400 font-bold';
            }
          }
          // En móviles (<640px), al cambiar de pestaña colapsar KPIs para enfocar directamente el contenido
          if (window.innerWidth < 640 && tabNum !== 1) {
            const kpiBox = document.getElementById('mobileKpisCollapsibleContainer');
            const arr = document.getElementById('toggleMobileKpisArrow');
            if (kpiBox && !kpiBox.classList.contains('hidden')) {
              kpiBox.classList.add('hidden');
              if (arr) arr.textContent = '▼';
            }
          }
          renderApp();
          if (typeof saveUiOnly === 'function') saveUiOnly();
          else saveState(true);
        },


        switchWorkspace(workspaceId) {
          if (window.WorkspacesManager) {
            window.WorkspacesManager.switchWorkspace(workspaceId);
          }
        },

        toggleSidebar(forceOpen = null) {
          const sidebar = document.getElementById('workspaceSidebar');
          const pullTab = document.getElementById('sidebarPullTab');
          if (!sidebar) return;
          const isCurrentlyOpen = !sidebar.classList.contains('hidden') && !sidebar.classList.contains('collapsed') && !sidebar.classList.contains('sidebar-collapsed');
          const shouldOpen = forceOpen !== null ? forceOpen : !isCurrentlyOpen;

          if (shouldOpen) {
            sidebar.classList.remove('hidden', 'collapsed', 'sidebar-collapsed');
            sidebar.classList.add('sidebar-open');
            document.body.classList.add('sidebar-view-open');
            if (pullTab) pullTab.style.display = 'none';
          } else {
            sidebar.classList.remove('sidebar-open');
            sidebar.classList.add('hidden', 'sidebar-collapsed');
            document.body.classList.remove('sidebar-view-open');
            if (pullTab) pullTab.style.display = 'flex';
          }

          if (state && state.globalSidebar) {
            state.globalSidebar.isOpen = shouldOpen;
          }
          if (typeof saveUiOnly === 'function') saveUiOnly();
          else if (typeof saveState === 'function') saveState();
        },
        toggleMobileKpis() {
          const kpiBox = document.getElementById('mobileKpisCollapsibleContainer');
          const arr = document.getElementById('toggleMobileKpisArrow');
          const txt = document.getElementById('toggleMobileKpisStatusText');
          if (kpiBox) {
            const isHidden = kpiBox.classList.contains('hidden');
            if (isHidden) {
              kpiBox.classList.remove('hidden');
              if (arr) arr.textContent = '▲';
              if (txt) txt.textContent = 'Ocultar';
            } else {
              kpiBox.classList.add('hidden');
              if (arr) arr.textContent = '▼';
              if (txt) txt.textContent = 'Mostrar';
            }
          }
        },

        toggleKpisAccordion() {
          const body = document.getElementById('kpisCollapsibleBody');
          const statusText = document.getElementById('kpisSlimStatusText');
          const arrow = document.getElementById('kpisSlimArrow');
          const wrap = document.getElementById('topKpisWrapper');
          if (!body) return;
          const isHidden = body.classList.toggle('hidden');
          if (statusText) statusText.textContent = isHidden ? 'Mostrar' : 'Plegar';
          if (arrow) arrow.textContent = isHidden ? '▼' : '▲';
          if (!state.uiPreferences) state.uiPreferences = {};
          state.uiPreferences.kpisCollapsed = isHidden;

          // Si topKpisWrapper está en el grid activo, actualizar su rowSpan en cascada
          const ws = window.WorkspacesManager ? window.WorkspacesManager.getActiveWorkspace() : null;
          if (ws && ws.grid && ws.grid['topKpisWrapper']) {
            const cfg = ws.grid['topKpisWrapper'];
            const measureFn = (window.GridEngine && window.GridEngine.measureNaturalRows) ? window.GridEngine.measureNaturalRows.bind(window.GridEngine) : (app.measureNaturalRows ? app.measureNaturalRows.bind(app) : null);
            const newRows = measureFn && wrap ? measureFn(wrap) : (isHidden ? 2 : 5);
            cfg.rowSpan = Math.max(2, newRows);
            cfg.minRows = cfg.rowSpan;
            cfg.manualRows = null;
            if (wrap) {
              wrap.style.gridRow = cfg.row + ' / span ' + cfg.rowSpan;
            }
            if (window.GridEngine) {
              window.GridEngine.resolveGridCollisions(null, 'topKpisWrapper');
              window.GridEngine.compactGrid();
              window.GridEngine.applyGridLayout();
            }
          }

          if (typeof app.saveUiOnly === 'function') {
            app.saveUiOnly();
          } else if (typeof saveState === 'function') {
            saveState();
          }
          if (typeof this.triggerReflow === 'function') this.triggerReflow();
        },

        toggleTheme() {
          state.theme = state.theme === 'dark' ? 'light' : 'dark';
          const html = document.documentElement;
          if (state.theme === 'dark') {
            html.classList.add('dark');
          } else {
            html.classList.remove('dark');
          }
          const metaTheme = document.querySelector('meta[name="theme-color"]');
          if (metaTheme) metaTheme.content = state.theme === 'dark' ? '#080d1a' : '#f5f0e8';
          applyAccentPalette(state.themePalette || 'blue_red');
          this.renderPaletteOptions();
          renderApp();
          saveState();
        },

        togglePalettePicker(e) {
          if (e) e.stopPropagation();
          const popover = document.getElementById('palettePickerPopover');
          const btn = document.getElementById('palettePickerBtn');
          if (!popover) return;
          const isHidden = popover.classList.contains('hidden');
          if (isHidden) {
            this.renderPaletteOptions();
            popover.style.visibility = 'hidden';
            popover.classList.remove('hidden');

            const popWidth = popover.offsetWidth || 256;
            const popHeight = popover.offsetHeight || 280;

            let top = 60, left = 100;
            if (btn) {
              const rect = btn.getBoundingClientRect();
              left = rect.right - popWidth;
              top = rect.bottom + 8;
              if (top + popHeight > window.innerHeight - 10) {
                top = rect.top - popHeight - 8;
              }
            }

            if (left + popWidth > window.innerWidth - 10) left = window.innerWidth - popWidth - 10;
            if (left < 10) left = 10;
            if (top + popHeight > window.innerHeight - 10) top = window.innerHeight - popHeight - 10;
            if (top < 10) top = 10;

            popover.style.top = `${Math.round(top)}px`;
            popover.style.left = `${Math.round(left)}px`;
            popover.style.visibility = 'visible';
          } else {
            popover.classList.add('hidden');
          }
        },

        closePalettePicker() {
          const popover = document.getElementById('palettePickerPopover');
          if (popover) popover.classList.add('hidden');
        },

        renderPaletteOptions() {
          const grid = document.getElementById('paletteOptionsGrid');
          if (!grid) return;
          const current = state?.themePalette || 'blue_red';
          const isDark = (typeof state !== 'undefined' && state?.theme) ? (state.theme === 'dark') : document.documentElement.classList.contains('dark');

          const highList = Object.values(ACCENT_PALETTES).filter(p => p.category === 'high_contrast');
          const softList = Object.values(ACCENT_PALETTES).filter(p => p.category === 'soft_contrast');

          const renderBtn = (pal) => {
            const isActive = pal.id === current;
            const dot1Color = isDark ? pal.dark.theme700 : pal.light.theme700;
            const dot2Color = isDark ? pal.dark.accent : pal.light.accent;
            return `
              <button type="button" onclick="app.setAccentPalette('${pal.id}')" class="w-full flex items-center justify-between p-1.5 rounded-xl transition cursor-pointer ${isActive ? 'bg-stone-200 dark:bg-slate-800 border border-theme font-bold' : 'subpanel-hover text-stone-700 dark:text-slate-300'}">
                <div class="flex items-center gap-2">
                  <div class="flex items-center -space-x-1 shrink-0">
                    <span class="w-3.5 h-3.5 rounded-full shadow-xs border border-black/15 dark:border-white/15" style="background-color: ${dot1Color}" title="Base"></span>
                    <span class="w-3.5 h-3.5 rounded-full shadow-xs border border-black/15 dark:border-white/15" style="background-color: ${dot2Color}" title="Acento"></span>
                  </div>
                  <span class="text-xs truncate font-medium text-left">${pal.name}</span>
                </div>
                ${isActive ? '<span class="text-xs text-theme-main font-bold">✓</span>' : ''}
              </button>
            `;
          };

          grid.innerHTML = `
            <div class="space-y-1">
              <div class="text-[10px] font-bold uppercase tracking-wider text-stone-400 dark:text-slate-500 px-1 pt-0.5">Alto Contraste</div>
              ${highList.map(renderBtn).join('')}
              <div class="text-[10px] font-bold uppercase tracking-wider text-stone-400 dark:text-slate-500 px-1 pt-2 border-t border-stone-200 dark:border-slate-800">Contraste Suave / Editorial</div>
              ${softList.map(renderBtn).join('')}
            </div>
          `;
        },

        setAccentPalette(key) {
          if (!ACCENT_PALETTES[key]) return;
          state.themePalette = key;
          applyAccentPalette(key);
          this.renderPaletteOptions();
          this.closePalettePicker();
          renderApp();
          saveState();
          this.showToast(`Paleta aplicada: ${ACCENT_PALETTES[key].name}`, 'success');
        },

        toggleWeekTable() {
          if (state.uiPreferences && state.uiPreferences.showWeekMatrix === false) {
            state.uiPreferences.showWeekMatrix = true;
            state.ui.weekTableCollapsed = false;
          } else {
            state.ui.weekTableCollapsed = !state.ui.weekTableCollapsed;
          }
          renderDailyHabits();
          this.applyUiPreferences();
          saveState();
        },
        setDailyViewMode(mode) {
          state.ui.dailyViewMode = mode;
          state.ui.weekTableCollapsed = (mode === 'today');
          renderDailyHabits();
          saveState();
        },

        navWeek(dir) {
          const totalWeeks = Object.keys(state.weeks).length;
          const target = state.viewingWeek + dir;
          if (target >= 1 && target <= totalWeeks) {
            state.viewingWeek = target;
            // Si navegamos a una semana pasada, activar candado por seguridad
            if (state.viewingWeek !== state.currentWeek) {
              state.isReadOnlyLocked = true;
            } else {
              state.isReadOnlyLocked = false;
            }
            renderApp();
            saveState();
          }
        },

        toggleReadOnlyLock() {
          const isPastWeek = state.viewingWeek !== state.currentWeek;
          if (!isPastWeek) {
            this.showToast('Esta es la semana activa en curso (siempre editable).', 'info');
            return;
          }
          state.isReadOnlyLocked = !state.isReadOnlyLocked;
          renderApp();
          saveState();
          if (state.isReadOnlyLocked) {
            this.showToast('Semana protegida en modo solo lectura.', 'amber');
          } else {
            this.showToast('Modo edición histórica habilitado.', 'emerald');
          }
        },

        // Gimnasio: botón variable (0 -> 1 -> 2 -> 0) y soporte +2 sesiones
        cycleGymSessionCount(dayIdx) {
          if (state.viewingWeek !== state.currentWeek && state.isReadOnlyLocked) return;
          pushUndo('Cambiar sesiones de gimnasio');
          playTickSound();
          const day = getActiveWeek().days[dayIdx];
          const cur = day.gym.sessions || 0;
          if (cur >= 2) {
            day.gym.sessions = 0;
          } else {
            day.gym.sessions = cur + 1;
            if (!day.gym[`s${day.gym.sessions}`]) {
              day.gym[`s${day.gym.sessions}`] = { type: 'Pierna', custom: '' };
            }
          }
          renderDailyHabits();
          renderHeaderAndKPIs();
          saveState();
        },

        addExtraGymSession(dayIdx) {
          if (state.viewingWeek !== state.currentWeek && state.isReadOnlyLocked) return;
          pushUndo('Añadir sesión extra de gimnasio');
          playTickSound();
          const day = getActiveWeek().days[dayIdx];
          const next = (day.gym.sessions || 0) + 1;
          day.gym.sessions = next;
          if (!day.gym[`s${next}`]) {
            day.gym[`s${next}`] = { type: 'Pierna', custom: '' };
          }
          renderDailyHabits();
          renderHeaderAndKPIs();
          saveState();
        },

        handleGymTypeSelection(dayIdx, sIdx, val) {
          if (state.viewingWeek !== state.currentWeek && state.isReadOnlyLocked) return;
          pushUndo('Cambiar rutina de gimnasio');
          const gymObj = getActiveWeek().days[dayIdx].gym;
          if (!gymObj[`s${sIdx}`]) gymObj[`s${sIdx}`] = { type: val, custom: '' };
          const session = gymObj[`s${sIdx}`];
          session.type = val;

          if (val === 'Personalizado...' || val === '✏️ Otro...' || val.startsWith('Personalizado')) {
            app.openCustomMuscleModal(dayIdx, sIdx, 'gym');
          } else {
            session.custom = '';
            session.muscles = [];
            if (session.cardio) {
              session.cardio.enabled = false;
              session.cardio.km = 0;
            }
            renderDailyHabits();
            saveState();
          }
        },

        // Running: botón variable (0 -> 1 -> 2 -> 0) + soporte +2 sesiones
        cycleRunSessionCount(dayIdx) {
          if (state.viewingWeek !== state.currentWeek && state.isReadOnlyLocked) return;
          pushUndo('Cambiar sesiones de running');
          playTickSound();
          const runObj = getActiveWeek().days[dayIdx].run;
          const cur = runObj.sessions || 0;
          if (cur >= 2) {
            runObj.sessions = 0;
            runObj.km = 0.0;
            if (runObj.s1) runObj.s1.km = 0.0;
            if (runObj.s2) runObj.s2.km = 0.0;
          } else {
            runObj.sessions = cur + 1;
            if (!runObj[`s${runObj.sessions}`]) {
              runObj[`s${runObj.sessions}`] = { type: 'Rodaje', km: 0.0, custom: '' };
            }
          }
          renderDailyHabits();
          renderHeaderAndKPIs();
          saveState();
        },

        addExtraRunSession(dayIdx) {
          if (state.viewingWeek !== state.currentWeek && state.isReadOnlyLocked) return;
          pushUndo('Añadir sesión extra de running');
          playTickSound();
          const runObj = getActiveWeek().days[dayIdx].run;
          const next = (runObj.sessions || 0) + 1;
          runObj.sessions = next;
          if (!runObj[`s${next}`]) {
            runObj[`s${next}`] = { type: 'Rodaje', km: 0.0, custom: '' };
          }
          renderDailyHabits();
          renderHeaderAndKPIs();
          saveState();
        },

        setRunSessionKm(dayIdx, sessionNum, val) {
          if (state.viewingWeek !== state.currentWeek && state.isReadOnlyLocked) return;
          pushUndo('Modificar Km de running');
          const day = getActiveWeek().days[dayIdx];
          const kmVal = parseFloat(val) || 0;
          if (!day.run[`s${sessionNum}`]) day.run[`s${sessionNum}`] = { type: 'Rodaje', km: 0, custom: '' };
          day.run[`s${sessionNum}`].km = kmVal;

          let totalKm = 0;
          for (let i = 1; i <= day.run.sessions; i++) {
            totalKm += Number(day.run[`s${i}`]?.km) || 0;
          }
          day.run.km = parseFloat(totalKm.toFixed(2));
          renderDailyHabits();
          renderHeaderAndKPIs();
          saveState();
        },

        setRunType(dayIdx, sessionNum, val) {
          if (state.viewingWeek !== state.currentWeek && state.isReadOnlyLocked) return;
          pushUndo('Modificar tipo de running');
          const day = getActiveWeek().days[dayIdx];
          if (!day.run[`s${sessionNum}`]) day.run[`s${sessionNum}`] = { type: val, km: 0, custom: '' };
          day.run[`s${sessionNum}`].type = val;
          if (val === 'Personalizado...' || val === '✏️ Otro...' || val.startsWith('Personalizado')) {
            app.openCustomRunModal(dayIdx, sessionNum);
          } else {
            day.run[`s${sessionNum}`].custom = '';
            day.run[`s${sessionNum}`].customSystem = '';
            renderDailyHabits();
            saveState();
          }
        },

        setRunKm(dayIdx, val) {
          if (state.viewingWeek !== state.currentWeek && state.isReadOnlyLocked) return;
          pushUndo('Modificar Km de running');
          const kmVal = parseFloat(val) || 0;
          const day = getActiveWeek().days[dayIdx];
          day.run.km = kmVal;
          if (!day.run.s1) day.run.s1 = { type: 'Rodaje', km: kmVal, custom: '' };
          else day.run.s1.km = kmVal;
          renderDailyHabits();
          renderHeaderAndKPIs();
          saveState();
        },

        setRunType(dayIdx, sIdx, val) {
          if (state.viewingWeek !== state.currentWeek && state.isReadOnlyLocked) return;
          pushUndo('Cambiar tipo de running');
          const session = getActiveWeek().days[dayIdx].run[`s${sIdx}`];
          session.type = val;
          if (val === 'Personalizado...' || val === '✏️ Otro...' || val.startsWith('Personalizado')) {
            app.openCustomRunModal(dayIdx, sIdx);
          } else {
            session.custom = '';
            session.customSystem = '';
            renderDailyHabits();
            renderHeaderAndKPIs();
            saveState();
          }
        },

        openCustomRunModal(dayIdx, sIdx) {
          activeCustomRunContext = { dayIdx, sIdx };
          const session = getActiveWeek().days[dayIdx].run[`s${sIdx}`] || {};
          document.getElementById('customRunName').value = session.custom || '';
          const sys = session.customSystem || 'series';
          const r = document.querySelector(`input[name="customRunSystem"][value="${sys}"]`);
          if (r) r.checked = true;
          document.getElementById('modalCustomRun').classList.remove('hidden');
          setTimeout(() => document.getElementById('customRunName').focus(), 50);
        },

        saveCustomRun() {
          const name = document.getElementById('customRunName').value.trim();
          if (!name) return this.showToast('Introduce un nombre para la actividad.', 'error');
          pushUndo('Guardar actividad de running');
          const sys = document.querySelector('input[name="customRunSystem"]:checked')?.value || 'series';
          if (activeCustomRunContext) {
            const { dayIdx, sIdx } = activeCustomRunContext;
            const session = getActiveWeek().days[dayIdx].run[`s${sIdx}`];
            session.custom = name;
            session.customSystem = sys;
          }
          app.closeModal('modalCustomRun');
          renderDailyHabits();
          renderHeaderAndKPIs();
          if (state.activeTab === 4) renderTab4();
          saveState();
        },

        // Modal de asignación muscular y cardio en gimnasio
        openCustomMuscleModal(dayIdx, sessionIdx, type) {
          activeCustomModalContext = { dayIdx, sessionIdx, type };
          const session = getActiveWeek().days[dayIdx][type][`s${sessionIdx}`];
          const curCustom = session.custom || '';
          document.getElementById('customWorkoutName').value = curCustom;

          const assigned = (Array.isArray(session.muscles) && session.muscles.length > 0)
            ? session.muscles
            : (curCustom ? (state.customWorkoutMuscles[curCustom.toLowerCase()] || []) : []);
          document.getElementById('muscleCheckboxesGrid').innerHTML = ALL_MUSCLE_GROUPS.map(m => `
            <label class="flex items-center gap-1.5 p-1.5 rounded subpanel-bg border cursor-pointer">
              <input type="checkbox" value="${m.id}" ${assigned.includes(m.id) ? 'checked' : ''} class="accent-theme-main muscle-chk" />
              <span>${m.label}</span>
            </label>
          `).join('');

          // Cargar datos de cardio si los tiene
          const cardio = session.cardio || { enabled: false, type: 'rodaje', km: 0 };
          const hasCardio = !!cardio.enabled;
          document.getElementById('customWorkoutHasCardio').checked = hasCardio;
          document.getElementById('customGymCardioDetails').classList.toggle('hidden', !hasCardio);
          const cardioRadio = document.querySelector(`input[name="customGymCardioType"][value="${cardio.type || 'rodaje'}"]`);
          if (cardioRadio) cardioRadio.checked = true;
          document.getElementById('customGymCardioKm').value = cardio.km || '';

          document.getElementById('customMuscleModal').classList.remove('hidden');
        },

        saveCustomWorkoutMuscles() {
          const name = document.getElementById('customWorkoutName').value.trim();
          if (!name) return this.showToast('Introduce un nombre para el entreno.', 'error');
          pushUndo('Guardar entreno personalizado');

          const checked = Array.from(document.querySelectorAll('.muscle-chk:checked')).map(el => el.value);
          state.customWorkoutMuscles[name.toLowerCase()] = checked;

          const hasCardio = document.getElementById('customWorkoutHasCardio').checked;
          const cardioType = document.querySelector('input[name="customGymCardioType"]:checked')?.value || 'rodaje';
          const cardioKm = parseFloat(document.getElementById('customGymCardioKm').value) || 0;

          if (activeCustomModalContext) {
            const { dayIdx, sessionIdx, type } = activeCustomModalContext;
            const session = getActiveWeek().days[dayIdx][type][`s${sessionIdx}`];
            session.custom = name;
            session.muscles = checked;
            session.cardio = {
              enabled: hasCardio,
              type: cardioType,
              km: cardioKm
            };
          }

          app.closeModal('customMuscleModal');
          renderApp();
          if (document.getElementById('anatomySvgContainer')) {
            document.getElementById('anatomySvgContainer').innerHTML = renderSvgAnatomy();
          }
          if (state.ui.selectedMuscle) {
            app.inspectMuscle(state.ui.selectedMuscle);
          }
          saveState();
        },

        // Resaltado simétrico/bilateral de grupos musculares al pasar el ratón (hover)
        hoverMuscle(mId) {
          const container = document.getElementById('anatomySvgContainer');
          if (!container) return;
          container.querySelectorAll('.muscle-hover').forEach(el => el.classList.remove('muscle-hover'));
          if (mId) {
            container.querySelectorAll(`[data-muscle="${mId}"]`).forEach(el => el.classList.add('muscle-hover'));
          }
        },

        // Inspector Muscular Interactivo con deselección al re-clickear
        inspectMuscle(mId) {
          if (state.ui.selectedMuscle === mId) {
            state.ui.selectedMuscle = null;
            app.closeModal('modalMuscleInspector');
            document.getElementById('anatomySvgContainer').innerHTML = renderSvgAnatomy();
            return;
          }
          state.ui.selectedMuscle = mId;
          const muscleObj = ALL_MUSCLE_GROUPS.find(m => m.id === mId);
          if (!muscleObj) return;

          const { hits, logs } = getMuscleStimulusHits();
          const count = hits[mId] || 0;

          document.getElementById('inspectorMuscleName').textContent = `${muscleObj.icon} ${muscleObj.label}`;
          document.getElementById('inspectorMuscleCount').textContent = `${count.toFixed(1)} estímulos`;
          document.getElementById('inspectorMuscleDesc').textContent = muscleObj.desc;

          let badgeClass = 'bg-stone-200 dark:bg-slate-800 text-stone-600 dark:text-slate-300';
          let badgeText = 'Sin estímulo';
          if (count >= 3) { badgeClass = 'bg-theme-accent-soft text-theme-accent border border-theme-accent'; badgeText = 'Alta Carga'; }
          else if (count >= 2) { badgeClass = 'bg-theme-soft text-theme-main border border-theme'; badgeText = 'Óptimo'; }
          else if (count >= 1) { badgeClass = 'bg-theme-soft text-theme-main border border-theme'; badgeText = 'Estimulado'; }

          const badgeEl = document.getElementById('inspectorMuscleLevelBadge');
          badgeEl.className = `px-2 py-0.5 rounded-full text-[10px] font-bold font-mono ${badgeClass}`;
          badgeEl.textContent = badgeText;

          const logItems = logs[mId] || [];
          document.getElementById('inspectorWorkoutsList').innerHTML = logItems.length === 0 ? `<div class="text-slate-400 text-[11px]">— Sin actividad registrada esta semana —</div>` : logItems.map(l => `
            <div class="p-1 rounded subpanel-bg border text-[11px] flex items-center justify-between">
              <span>${l}</span>
            </div>
          `).join('');

          document.getElementById('inspectorSuggestedExercises').textContent = muscleObj.desc;
          document.getElementById('modalMuscleInspector').classList.remove('hidden');

          // Refrescar mapa para resaltar bilateralmente
          document.getElementById('anatomySvgContainer').innerHTML = renderSvgAnatomy();
        },

        adjustMuscleStimulus(delta) {
          const mId = state.ui.selectedMuscle;
          if (!mId) return;
          pushUndo('Ajustar estímulo muscular');
          state.manualMuscleStimulus[mId] = (state.manualMuscleStimulus[mId] || 0) + delta;
          app.inspectMuscle(mId);
          renderApp();
          saveState();
        },

        // Estudio
        setDailyStudyReal(dayIdx, val) {
          if (state.viewingWeek !== state.currentWeek && state.isReadOnlyLocked) return;
          pushUndo('Modificar horas de estudio');
          const w = getActiveWeek();
          w.studyRealHours[dayIdx] = Math.max(0, parseFloat(val) || 0);

          // Invariante de coherencia: las horas por asignatura no pueden exceder el total semanal de horas de estudio
          if (w.studyBySubject) {
            const totalReal = w.studyRealHours.reduce((acc, h) => acc + (Number(h) || 0), 0);
            const totalSubs = Object.values(w.studyBySubject).reduce((acc, h) => acc + (Number(h) || 0), 0);
            if (totalSubs > totalReal && totalReal > 0) {
              const ratio = totalReal / totalSubs;
              Object.keys(w.studyBySubject).forEach(k => {
                w.studyBySubject[k] = parseFloat((Number(w.studyBySubject[k]) * ratio).toFixed(1));
              });
            } else if (totalReal === 0) {
              Object.keys(w.studyBySubject).forEach(k => {
                w.studyBySubject[k] = 0;
              });
            }
          }

          renderApp();
          saveState();
        },
        addStudyToDay(dayIdx, hrs, optionalSubject) {
          if (state.viewingWeek !== state.currentWeek && state.isReadOnlyLocked) return;
          pushUndo('Añadir horas de estudio');
          playTickSound();
          const w = getActiveWeek();
          const cur = Number(w.studyRealHours[dayIdx]) || 0;
          w.studyRealHours[dayIdx] = parseFloat((cur + hrs).toFixed(1));
          if (!w.studyBySubject) w.studyBySubject = {};
          const sub = optionalSubject || state.pomo?.selectedSubject || 'Estudio General';
          w.studyBySubject[sub] = parseFloat(((Number(w.studyBySubject[sub]) || 0) + hrs).toFixed(1));
          renderApp();
          saveState();
        },

        setSubjectStudyHours(sub, val) {
          if (state.viewingWeek !== state.currentWeek && state.isReadOnlyLocked) {
            this.showToast('Semana bloqueada en modo solo lectura.', 'amber');
            return;
          }
          const w = getActiveWeek();
          if (!w) return;
          if (!w.studyBySubject) w.studyBySubject = {};

          const oldVal = Number(w.studyBySubject[sub]) || 0;
          const num = Math.max(0, parseFloat(Number(val).toFixed(1)) || 0);
          const diff = num - oldVal;

          pushUndo(`Ajustar horas de ${sub}`);
          w.studyBySubject[sub] = num;

          // Sincronizar con el día de hoy para mantener la coherencia en el cómputo semanal y KPIs
          const todayIdx = (new Date().getDay() + 6) % 7;
          const curDayReal = Number(w.studyRealHours[todayIdx]) || 0;
          w.studyRealHours[todayIdx] = Math.max(0, parseFloat((curDayReal + diff).toFixed(1)));

          renderHeaderAndKPIs();
          renderDailyHabits();
          renderPomodoroUI();
          if (state.activeTab === 4) renderTab4();
          renderSubjectStudyStatsModal();
          saveState();
          this.showToast(`Horas de "${sub}": ${num.toFixed(1)}h`, 'blue');
        },

        adjustSubjectStudyHours(sub, delta) {
          const w = getActiveWeek();
          if (!w) return;
          const cur = (w.studyBySubject && Number(w.studyBySubject[sub])) || 0;
          const target = Math.max(0, parseFloat((cur + delta).toFixed(1)));
          this.setSubjectStudyHours(sub, target);
        },

        async promptSetSubjectStudyHours(sub) {
          const w = getActiveWeek();
          const cur = (w && w.studyBySubject && Number(w.studyBySubject[sub])) || 0;
          const val = await this.showPrompt({
            title: `Ajustar Horas: ${sub}`,
            message: `Introduce las horas totales dedicadas a esta materia en la semana actual:`,
            defaultValue: cur.toFixed(1),
            placeholder: 'Ej: 3.5'
          });
          if (val !== null && val !== undefined) {
            const cleanVal = String(val).replace(',', '.').trim();
            const num = parseFloat(cleanVal);
            if (!isNaN(num) && num >= 0) {
              app.setSubjectStudyHours(sub, num);
            }
          }
        },

        openSubjectStudyStatsModal() {
          renderSubjectStudyStatsModal();
          this.openModal('modalSubjectStudyStats');
        },

        openKpi1BlocksModal() {
          renderKpi1BlocksModal();
          this.openModal('modalKpi1Blocks');
        },

        openKpi3AttendanceModal() {
          renderKpi3AttendanceModal();
          this.openModal('modalKpi3Attendance');
        },

        openKpi4BudgetModal() {
          renderKpi4BudgetModal();
          this.openModal('modalKpi4Budget');
        },

        // Asistencia y Nutrición
        cycleAttendance(dayIdx, classIdx) {
          if (state.viewingWeek !== state.currentWeek && state.isReadOnlyLocked) return;
          pushUndo('Cambiar asistencia a clase');
          playTickSound();
          const item = getActiveWeek().days[dayIdx].attendance[classIdx];
          const cycle = ['pending', 'present', 'absent', 'holiday'];
          item.status = cycle[(cycle.indexOf(item.status) + 1) % cycle.length];
          renderDailyHabits();
          renderHeaderAndKPIs();
          saveState();
        },
        cycleNutrition(dayIdx) {
          if (state.viewingWeek !== state.currentWeek && state.isReadOnlyLocked) return;
          pushUndo('Cambiar estado de nutrición');
          playTickSound();
          const item = getActiveWeek().days[dayIdx];
          const cycle = ['pending', 'success', 'fail'];
          item.nutrition = cycle[(cycle.indexOf(item.nutrition) + 1) % cycle.length];
          renderDailyHabits();
          renderHeaderAndKPIs();
          saveState();
        },
        setDayKcal(dayIdx, val) {
          if (state.viewingWeek !== state.currentWeek && state.isReadOnlyLocked) return;
          pushUndo('Modificar calorías');
          const w = getActiveWeek();
          const day = w.days[dayIdx];
          const rawNum = (val !== '' && val != null) ? parseInt(val, 10) : null;
          day.nutritionKcal = (rawNum === null || isNaN(rawNum)) ? null : rawNum;

          if (day.nutritionKcal !== null) {
            const ev = evalNutritionStatus(day.nutritionKcal, w.goals.nutri?.kcal, w.goals.nutri?.phase, w.goals.nutri?.margin);
            day.nutrition = ev.status === 'pending' ? 'pending' : (ev.score >= 0.8 ? 'success' : 'fail');
            day.nutritionScore = ev.score;
          } else {
            day.nutrition = 'pending';
            day.nutritionScore = 0;
          }

          renderDailyHabits();
          renderHeaderAndKPIs();
          saveState();
        },

        // Gasto Rápido
        submitQuickExpense() {
          const amt = parseFloat(document.getElementById('quickAmount').value);
          const concept = document.getElementById('quickConcept').value.trim();
          const cat = document.getElementById('quickCategory').value;
          const dayIdx = parseInt(document.getElementById('quickDaySelect').value, 10);

          if (isNaN(amt) || amt <= 0 || !concept) return this.showToast('Introduce un importe válido y concepto.', 'error');

          pushUndo('Añadir gasto rápido');
          const newExp = {
            id: 'exp_' + Date.now(),
            dayIndex: dayIdx,
            amount: amt,
            concept: concept,
            category: cat,
            timestamp: new Date().toISOString()
          };

          getActiveWeek().expenses.push(newExp);
          if (!state.dictionary.frequentConcepts) state.dictionary.frequentConcepts = [];
          if (!state.dictionary.frequentConcepts.some(x => x.toLowerCase() === concept.toLowerCase())) {
            state.dictionary.frequentConcepts.push(concept);
          }

          document.getElementById('quickAmount').value = '';
          document.getElementById('quickConcept').value = '';
          playTone(600, 0.08, 'sine', 0.15);
          renderApp();
          saveState();
        },

        fillQuickConcept(c) {
          document.getElementById('quickConcept').value = c;
          document.getElementById('quickAmount').focus();
        },

        removeFrequentConcept(c) {
          state.dictionary.frequentConcepts = state.dictionary.frequentConcepts.filter(x => x !== c);
          renderQuickExpensesUI();
          saveState();
        },

        fillTab3Concept(c) {
          const conceptInp = document.getElementById('tab3InlineConcept');
          if (conceptInp) conceptInp.value = c;
          app.renderTab3ConceptChips(c);
          const learnedCat = findLearnedCategoryForConcept(c);
          if (learnedCat) {
            applyLearnedCategoryToSelect(document.getElementById('tab3InlineCategory'), learnedCat);
          }
          const amtInp = document.getElementById('tab3InlineAmount');
          if (amtInp) amtInp.focus();
        },

        onTab3ConceptInput(val) {
          app.renderTab3ConceptChips(val);
          if (val && val.trim().length >= 2) {
            const learnedCat = findLearnedCategoryForConcept(val);
            if (learnedCat) {
              applyLearnedCategoryToSelect(document.getElementById('tab3InlineCategory'), learnedCat);
            }
          }
        },

        renderTab3ConceptChips(filterQuery = '') {
          const tab3Chips = document.getElementById('tab3FrequentConceptChips');
          if (!tab3Chips) return;
          const filtered = getMatchingExpenseConcepts(filterQuery);
          const q = (filterQuery || '').trim();
          if (filtered.length === 0) {
            tab3Chips.innerHTML = q ? `<span class="text-[10px] text-stone-400 dark:text-slate-500 italic py-0.5">Sin coincidencias previas (se creará "${escapeHtml(filterQuery)}")</span>` : '';
          } else {
            tab3Chips.innerHTML = filtered.slice(0, 10).map(item => {
              const c = item.concept;
              const catLabel = item.category ? `<span class="opacity-60 text-[9px] ml-1">(${escapeHtml(item.category.replace(/^[^\s]+\s*/, ''))})</span>` : '';
              return `
                <button type="button" onclick="app.fillTab3Concept('${escapeHtml(c)}')" class="inline-flex items-center px-2 py-0.5 rounded-lg subpanel-bg border hover:border-cyan-400 text-[11px] font-medium text-cyan-300 transition active:scale-95">
                  <span>${escapeHtml(c)}</span>${catLabel}
                </button>
              `;
            }).join('');
          }
        },

        openEditExpenseModal(id) {
          const w = getActiveWeek();
          const exp = w.expenses.find(e => e.id === id);
          if (!exp) return;
          document.getElementById('editExpenseId').value = exp.id;
          document.getElementById('editExpenseConcept').value = exp.concept || '';
          document.getElementById('editExpenseAmount').value = exp.amount || '';

          const catSelect = document.getElementById('editExpenseCategory');
          catSelect.innerHTML = (state.financeSettings.customCategories || []).map(c => `
            <option value="${c.emoji} ${c.name}" ${(exp.category === `${c.emoji} ${c.name}` || exp.category === c.name) ? 'selected' : ''}>${c.emoji} ${c.name}</option>
          `).join('');

          const daySelect = document.getElementById('editExpenseDay');
          daySelect.innerHTML = DAYS.map((d, i) => `
            <option value="${i}" ${i === Number(exp.dayIndex) ? 'selected' : ''}>${d}</option>
          `).join('');

          document.getElementById('modalEditExpense').classList.remove('hidden');
        },

        saveEditedExpense() {
          const id = document.getElementById('editExpenseId').value;
          const concept = document.getElementById('editExpenseConcept').value.trim();
          const amt = parseNumericExpression(document.getElementById('editExpenseAmount')?.value);
          const cat = document.getElementById('editExpenseCategory').value;
          const dayIdx = parseInt(document.getElementById('editExpenseDay').value, 10);

          if (!concept || isNaN(amt) || amt <= 0) return this.showToast('Introduce un importe válido y concepto.', 'error');

          pushUndo('Editar gasto');
          const w = getActiveWeek();
          const exp = w.expenses.find(e => e.id === id);
          if (exp) {
            exp.concept = concept;
            exp.amount = amt;
            exp.category = cat;
            exp.dayIndex = dayIdx;
            if (!state.dictionary.frequentConcepts.includes(concept)) state.dictionary.frequentConcepts.push(concept);
          }
          app.closeModal('modalEditExpense');
          renderApp();
          saveState();
        },

        deleteExpense(id) {
          const w = getActiveWeek();
          const idx = w.expenses.findIndex(e => e.id === id);
          if (idx !== -1) {
            pushUndo('Eliminar gasto');
            lastDeletedItem = { type: 'expense', item: w.expenses[idx] };
            w.expenses.splice(idx, 1);
            showUndoToast('Gasto eliminado.');
            renderApp();
            saveState();
          }
        },

        // Métodos del Panel Lateral Derecho del Dock (100% VH - Flujo Natural)
        activeDockTool: null,

        openDockSidebar(mode) {
          const sidebar = document.getElementById('dockRightSidebar');
          const titleEl = document.getElementById('dockRightSidebarTitle');
          const iconEl = document.getElementById('dockRightSidebarIcon');
          const pomoWin = document.getElementById('dockPomoWindow');
          const expWin = document.getElementById('dockExpenseWindow');
          const customBox = document.getElementById('dockRightSidebarCustomContent');
          if (!sidebar) return;

          this.activeDockTool = mode;
          sidebar.classList.remove('hidden');
          document.body.classList.add('dock-sidebar-open');

          // Desactivar pastillas previas
          document.querySelectorAll('#floatingDock button, #floatingDock [data-dock-pill-id]').forEach(btn => {
            btn.classList.remove('dock-pill-active');
          });

          // Ocultar todos los paneles internos por defecto y aparcar widgets de forma segura
          if (pomoWin) pomoWin.classList.add('hidden');
          if (expWin) expWin.classList.add('hidden');
          if (customBox) {
            customBox.classList.add('hidden');
            Array.from(customBox.children).forEach(child => {
              if (child && child.id && window.WidgetsRegistry) {
                window.WidgetsRegistry.parkWidget(child.id);
              }
            });
            customBox.innerHTML = '';
          }

          if (mode === 'pomo') {
            if (pomoWin) pomoWin.classList.remove('hidden');
            if (titleEl) titleEl.textContent = 'Enfoque Pomodoro';
            if (iconEl) iconEl.innerHTML = `<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
            const pill = document.getElementById('dockPomoPill');
            if (pill) pill.classList.add('dock-pill-active');
          } else if (mode === 'expense') {
            if (expWin) expWin.classList.remove('hidden');
            if (titleEl) titleEl.textContent = 'Registro de Gasto Rápido';
            if (iconEl) iconEl.innerHTML = `<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>`;
            const pill = document.getElementById('dockExpensePill');
            if (pill) pill.classList.add('dock-pill-active');
            renderDockExpenseUI();
            setTimeout(() => {
              const inp = document.getElementById('dockExpenseAmount');
              if (inp) inp.focus();
            }, 60);
          } else {
            // Widget dinámico
            if (customBox) {
              customBox.classList.remove('hidden');
              const def = (window.WidgetsRegistry) ? window.WidgetsRegistry.getWidgetDef(mode) : { name: mode, iconSvg: '' };
              if (titleEl) titleEl.textContent = def.name || mode;
              if (iconEl) iconEl.innerHTML = def.iconSvg || `<svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>`;
              
              if (window.WidgetsRegistry) {
                const mountedEl = window.WidgetsRegistry.mountWidget(mode, customBox);
                if (mountedEl) {
                  mountedEl.setAttribute('data-cols', '3');
                  mountedEl.classList.add('card-mode-compact');
                  mountedEl.style.gridColumn = '';
                  mountedEl.style.gridRow = '';
                  mountedEl.style.width = '100%';
                }
              }
            }
            const pill = document.querySelector(`[data-dock-pill-id="${mode}"]`);
            if (pill) pill.classList.add('dock-pill-active');
          }

          if (window.GridEngine && typeof window.GridEngine.applyGridLayout === 'function') {
            setTimeout(() => {
              window.GridEngine.applyGridLayout();
            }, 50);
          }
        },

        closeDockSidebar() {
          const sidebar = document.getElementById('dockRightSidebar');
          if (sidebar) sidebar.classList.add('hidden');
          this.activeDockTool = null;
          document.body.classList.remove('dock-sidebar-open');
          document.querySelectorAll('#floatingDock button, #floatingDock [data-dock-pill-id]').forEach(btn => {
            btn.classList.remove('dock-pill-active');
          });
          const customBox = document.getElementById('dockRightSidebarCustomContent');
          if (customBox) {
            Array.from(customBox.children).forEach(child => {
              if (child && child.id && window.WidgetsRegistry) {
                window.WidgetsRegistry.parkWidget(child.id);
              }
            });
            customBox.innerHTML = '';
          }
          if (window.GridEngine && typeof window.GridEngine.applyGridLayout === 'function') {
            setTimeout(() => {
              window.GridEngine.applyGridLayout();
            }, 50);
          }
        },

        toggleDockPomo(forceOpen = null) {
          const sidebar = document.getElementById('dockRightSidebar');
          const isVisible = sidebar && !sidebar.classList.contains('hidden');
          if (forceOpen === false || (forceOpen === null && isVisible && this.activeDockTool === 'pomo')) {
            this.closeDockSidebar();
          } else if (forceOpen === true || (forceOpen === null && (!isVisible || this.activeDockTool !== 'pomo'))) {
            this.openDockSidebar('pomo');
          }
        },

        toggleDockExpense(forceOpen = null) {
          const sidebar = document.getElementById('dockRightSidebar');
          const isVisible = sidebar && !sidebar.classList.contains('hidden');
          if (forceOpen === false || (forceOpen === null && isVisible && this.activeDockTool === 'expense')) {
            this.closeDockSidebar();
          } else if (forceOpen === true || (forceOpen === null && (!isVisible || this.activeDockTool !== 'expense'))) {
            this.openDockSidebar('expense');
          }
        },

        submitDockExpense() {
          const amtInp = document.getElementById('dockExpenseAmount');
          const conceptInp = document.getElementById('dockExpenseConcept');
          const catSelect = document.getElementById('dockExpenseCategory');
          const daySelect = document.getElementById('dockExpenseDay');

          const amt = parseNumericExpression(amtInp ? amtInp.value : '');
          const concept = conceptInp ? conceptInp.value.trim() : '';
          const cat = catSelect ? catSelect.value : 'Otros';
          const dayIdx = parseInt(daySelect ? daySelect.value : 0, 10);

          if (isNaN(amt) || amt <= 0 || !concept) return this.showToast('Introduce un importe válido (o cálculo como 15.6-2.3) y concepto.', 'error');

          pushUndo('Añadir gasto');
          const newExp = {
            id: 'exp_' + Date.now(),
            dayIndex: dayIdx,
            amount: amt,
            concept: concept,
            category: cat,
            timestamp: new Date().toISOString()
          };

          getActiveWeek().expenses.push(newExp);
          if (!state.dictionary.frequentConcepts) state.dictionary.frequentConcepts = [];
          if (!state.dictionary.frequentConcepts.some(x => x.toLowerCase() === concept.toLowerCase())) {
            state.dictionary.frequentConcepts.push(concept);
          }

          if (amtInp) amtInp.value = '';
          if (conceptInp) conceptInp.value = '';
          playTone(600, 0.08, 'sine', 0.15);
          app.toggleDockExpense(false);
          renderApp();
          saveState();
        },

        onDockConceptInput(val) {
          renderDockExpenseUI(val);
          if (val && val.trim().length >= 2) {
            const learnedCat = findLearnedCategoryForConcept(val);
            if (learnedCat) {
              applyLearnedCategoryToSelect(document.getElementById('dockExpenseCategory'), learnedCat);
            }
          }
        },

        fillDockExpenseConcept(c) {
          const conceptInp = document.getElementById('dockExpenseConcept');
          const amtInp = document.getElementById('dockExpenseAmount');
          if (conceptInp) conceptInp.value = c;
          renderDockExpenseUI(c);
          const learnedCat = findLearnedCategoryForConcept(c);
          if (learnedCat) {
            applyLearnedCategoryToSelect(document.getElementById('dockExpenseCategory'), learnedCat);
          }
          if (amtInp) amtInp.focus();
        },

        // Pomodoro Timer
        togglePomo() {
          const p = state.pomo;
          p.isRunning = !p.isRunning;
          if (p.isRunning) {
            p.lastTick = Date.now();
            p.targetEndTime = Date.now() + (p.timeLeft * 1000);
            requestPomoWakeLock();
            if (pomoTimerInterval) clearInterval(pomoTimerInterval);
            pomoTimerInterval = setInterval(() => {
              syncPomoTime();
            }, 1000);
          } else {
            p.lastTick = null;
            p.targetEndTime = null;
            if (pomoTimerInterval) {
              clearInterval(pomoTimerInterval);
              pomoTimerInterval = null;
            }
            releasePomoWakeLock();
          }
          renderPomodoroUI();
          saveState();
        },

        commitStudyToToday() {
          const p = state.pomo;
          const hrs = parseFloat((p.effectiveSeconds / 3600).toFixed(2));
          if (hrs <= 0) return this.showToast('No hay tiempo efectivo acumulado para volcar.', 'warning');
          const todayIdx = (new Date().getDay() + 6) % 7;
          const sub = p.selectedSubject || 'Estudio General';
          app.addStudyToDay(todayIdx, hrs, sub);
          p.effectiveSeconds = 0;
          renderPomodoroUI();
          this.showToast(`¡Se han volcado ${hrs}h a "${sub}" y al total de hoy! 📖`, 'success');
        },

        setPomoPreset(val) {
          const p = state.pomo;
          p.preset = val;
          if (val === '25-5') {
            p.studyMin = 25;
            p.restMin = 5;
            p.phase = 'work';
            p.timeLeft = p.studyMin * 60;
          } else if (val === '50-10') {
            p.studyMin = 50;
            p.restMin = 10;
            p.phase = 'work';
            p.timeLeft = p.studyMin * 60;
          } else if (val === 'free') {
            p.studyMin = p.studyMin || 25;
            p.restMin = p.restMin || 5;
            if (!p.isRunning) {
              p.timeLeft = (p.phase === 'work' ? p.studyMin : p.restMin) * 60;
            }
          }
          renderPomodoroUI();
          saveState();
        },

        updateFreeStudyMin(val) {
          const p = state.pomo;
          const mins = parseInt(val, 10);
          if (!isNaN(mins) && mins > 0) {
            p.studyMin = mins;
            p.preset = 'free';
            if (!p.isRunning && p.phase === 'work') {
              p.timeLeft = mins * 60;
            }
            renderPomodoroUI();
            saveState();
          }
        },

        updateFreeRestMin(val) {
          const p = state.pomo;
          const mins = parseInt(val, 10);
          if (!isNaN(mins) && mins > 0) {
            p.restMin = mins;
            p.preset = 'free';
            if (!p.isRunning && p.phase === 'rest') {
              p.timeLeft = mins * 60;
            }
            renderPomodoroUI();
            saveState();
          }
        },

        changePomoSubject(val) { state.pomo.selectedSubject = val; renderPomodoroUI(); saveState(); },
        toggleZen(show) {
          const modal = document.getElementById('zenModal');
          if (!modal) return;
          const willShow = (show !== undefined) ? show : modal.classList.contains('hidden');
          if (willShow) {
            modal.classList.remove('hidden');
            document.body.classList.add('overflow-hidden');
            const vol = state.pomo.volume !== undefined ? state.pomo.volume : 80;
            const slider = document.getElementById('zenVolumeSlider');
            if (slider) slider.value = vol;
            const label = document.getElementById('zenVolumeLabel');
            if (label) label.textContent = `${vol}%`;
            const sel = document.getElementById('zenPomoSoundSelect');
            if (sel) sel.value = state.pomo.sound || 'bowl';
            const permBtn = document.getElementById('zenNotificationPermBtn');
            if (permBtn && 'Notification' in window) {
              if (Notification.permission === 'granted') {
                permBtn.textContent = '✓ Activadas';
                permBtn.classList.add('bg-theme-main', 'text-white');
              } else if (Notification.permission === 'denied') {
                permBtn.textContent = 'Bloqueadas';
              }
            }
          } else {
            modal.classList.add('hidden');
            document.body.classList.remove('overflow-hidden');
          }
        },
        toggleZenSettingsDrawer() {
          const drawer = document.getElementById('zenSettingsDrawer');
          const txt = document.getElementById('zenSettingsToggleText');
          if (!drawer) return;
          const isHidden = drawer.classList.contains('hidden');
          if (isHidden) {
            drawer.classList.remove('hidden');
            if (txt) txt.textContent = 'Cerrar';
            const vol = state.pomo.volume !== undefined ? state.pomo.volume : 80;
            const slider = document.getElementById('zenVolumeSlider');
            if (slider) slider.value = vol;
            const label = document.getElementById('zenVolumeLabel');
            if (label) label.textContent = `${vol}%`;
            const sel = document.getElementById('zenPomoSoundSelect');
            if (sel) sel.value = state.pomo.sound || 'bowl';
          } else {
            drawer.classList.add('hidden');
            if (txt) txt.textContent = 'Ajustes';
          }
        },
        toggleDockPomoSettings() {
          const drawer = document.getElementById('dockPomoSettingsDrawer');
          if (!drawer) return;
          const isHidden = drawer.classList.contains('hidden');
          if (isHidden) {
            drawer.classList.remove('hidden');
            const vol = state.pomo.volume !== undefined ? state.pomo.volume : 80;
            const slider = document.getElementById('dockVolumeSlider');
            if (slider) slider.value = vol;
            const label = document.getElementById('dockVolumeLabel');
            if (label) label.textContent = `${vol}%`;
            const sel = document.getElementById('dockPomoSoundSelect');
            if (sel) sel.value = state.pomo.sound || 'bowl';
          } else {
            drawer.classList.add('hidden');
          }
        },
        changePomoVolume(vol) {
          const v = parseInt(vol, 10);
          if (isNaN(v)) return;
          state.pomo.volume = v;
          const zLabel = document.getElementById('zenVolumeLabel');
          if (zLabel) zLabel.textContent = `${v}%`;
          const dLabel = document.getElementById('dockVolumeLabel');
          if (dLabel) dLabel.textContent = `${v}%`;
          const zSlider = document.getElementById('zenVolumeSlider');
          if (zSlider && zSlider.value != v) zSlider.value = v;
          const dSlider = document.getElementById('dockVolumeSlider');
          if (dSlider && dSlider.value != v) dSlider.value = v;
          saveState();
        },
        requestNotificationPermission() {
          if (!('Notification' in window)) {
            return this.showToast('Tu navegador no soporta notificaciones de escritorio.', 'warning');
          }
          Notification.requestPermission().then(permission => {
            const btn = document.getElementById('zenNotificationPermBtn');
            if (permission === 'granted') {
              if (btn) {
                btn.textContent = '✓ Activadas';
                btn.classList.add('bg-theme-main', 'text-white');
              }
              this.showToast('¡Notificaciones de escritorio activadas!', 'success');
            } else {
              if (btn) btn.textContent = 'Bloqueadas';
              this.showToast('Permiso de notificaciones no concedido.', 'warning');
            }
          });
        },
        adjustClock(mins) {
          const p = state.pomo;
          p.timeLeft = Math.max(0, p.timeLeft + mins * 60);
          if (p.isRunning) {
            p.targetEndTime = Date.now() + (p.timeLeft * 1000);
            saveState();
          }
          renderPomodoroUI();
        },
        adjustEffective(mins) {
          const p = state.pomo;
          p.effectiveSeconds = Math.max(0, p.effectiveSeconds + mins * 60);
          renderPomodoroUI();
        },
        updateFreePomoTimes() {
          const p = state.pomo;
          p.preset = 'free';
          const sInput = document.getElementById('zenFreeStudyMin') || document.getElementById('dockFreeStudyMin');
          const rInput = document.getElementById('zenFreeRestMin') || document.getElementById('dockFreeRestMin');
          p.studyMin = parseInt(sInput?.value, 10) || p.studyMin || 25;
          p.restMin = parseInt(rInput?.value, 10) || p.restMin || 5;
          if (!p.isRunning) {
            p.timeLeft = (p.phase === 'work' ? p.studyMin : p.restMin) * 60;
          }
          renderPomodoroUI();
          saveState();
        },
        setQuickPomoMinutes(mins) {
          const p = state.pomo;
          p.studyMin = mins;
          p.preset = 'free';
          if (!p.isRunning && p.phase === 'work') {
            p.timeLeft = mins * 60;
          }
          renderPomodoroUI();
          saveState();
        },
        changePomoSound(snd) {
          state.pomo.sound = snd;
          const sZen = document.getElementById('zenPomoSoundSelect');
          if (sZen && sZen.value !== snd) sZen.value = snd;
          const sDock = document.getElementById('dockPomoSoundSelect');
          if (sDock && sDock.value !== snd) sDock.value = snd;
          saveState();
        },
        testPomoSound() {
          const snd = state?.pomo?.sound || 'bowl';
          triggerPomoAlert(state?.pomo?.phase || 'work', snd);
        },

        // Métodos del Mini-Calendario de Notas con Fecha
        navMiniCalendar(dir) {
          if (dir === 0) {
            const t = new Date();
            miniCalendarState.year = t.getFullYear();
            miniCalendarState.month = t.getMonth();
            miniCalendarState.selectedDateStr = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
          } else {
            let m = miniCalendarState.month + dir;
            let y = miniCalendarState.year;
            if (m < 0) { m = 11; y--; }
            else if (m > 11) { m = 0; y++; }
            miniCalendarState.month = m;
            miniCalendarState.year = y;
          }
          renderNotesMiniCalendar();
        },
        toggleMiniCalendarCollapse() {
          miniCalendarState.isCollapsed = !miniCalendarState.isCollapsed;
          renderNotesMiniCalendar();
        },
        selectCalendarDate(dateStr) {
          miniCalendarState.selectedDateStr = (miniCalendarState.selectedDateStr === dateStr) ? null : dateStr;
          renderNotesMiniCalendar();
        },
        focusCalendarDate(dateStr) {
          if (!dateStr) return;
          this.switchTab(1);
          miniCalendarState.isCollapsed = false;
          const parts = dateStr.split('-');
          if (parts.length === 3) {
            miniCalendarState.year = parseInt(parts[0], 10);
            miniCalendarState.month = parseInt(parts[1], 10) - 1;
            miniCalendarState.selectedDateStr = dateStr;
          }
          renderNotesMiniCalendar();
          setTimeout(() => {
            const calPanel = document.getElementById('notesMiniCalendarPanel');
            if (calPanel) calPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }, 150);
        },

        // Listas
        switchListTab(tab) { state.ui.listTab = tab; renderListsTree(); saveState(); },
        openOverdueMilestonesModal() {
          const allMilestones = getAllUpcomingMilestones();
          const overdue = allMilestones.filter(m => m.diffDays < 0);
          if (overdue.length === 0) {
            this.showToast('No hay entregas pendientes atrasadas.', 'info');
            return;
          }

          const badgeEl = document.getElementById('modalOverdueCountBadge');
          if (badgeEl) badgeEl.textContent = overdue.length;

          // Agrupar por el paquete raíz más grande (root package)
          const groupsMap = {};
          overdue.forEach(item => {
            const listArr = state.lists[item.cat] || [];
            const pathArr = getNodePath(listArr, item.id) || [item.title];
            // Si tiene ruta: pathArr[0] es el paquete raíz principal
            let rootTitle = '';
            let subPath = '';
            let isFolder = false;

            if (pathArr.length > 1) {
              rootTitle = pathArr[0];
              // Subruta entre el paquete raíz y el título de la nota
              const intermediate = pathArr.slice(1, -1);
              subPath = intermediate.length > 0 ? intermediate.join(' › ') : '';
              isFolder = true;
            } else {
              rootTitle = `${item.categoryLabel} (Principal)`;
              subPath = '';
              isFolder = false;
            }

            const groupKey = `${item.cat}_${rootTitle}`;
            if (!groupsMap[groupKey]) {
              groupsMap[groupKey] = {
                key: groupKey,
                label: rootTitle,
                cat: item.cat,
                isFolder: isFolder,
                items: []
              };
            }
            groupsMap[groupKey].items.push({
              ...item,
              subPath: subPath
            });
          });

          const container = document.getElementById('modalOverdueGroupsList');
          if (container) {
            container.innerHTML = Object.values(groupsMap).map(g => `
              <div class="p-3.5 rounded-xl subpanel-bg border border-stone-300/80 dark:border-slate-800 space-y-2 shadow-xs">
                <div class="flex items-center justify-between border-b border-stone-200/70 dark:border-slate-800/80 pb-2">
                  <div class="flex items-center gap-2 font-bold text-xs text-stone-800 dark:text-slate-100">
                    <svg class="w-4 h-4 text-theme-main shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      ${g.isFolder ? '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>' : '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>'}
                    </svg>
                    <span class="tracking-wide">${escapeHtml(g.label)}</span>
                  </div>
                  <span class="text-[10px] font-mono font-bold text-theme-accent bg-theme-accent-soft px-2 py-0.5 rounded border border-theme-accent/30">${g.items.length} pendiente${g.items.length > 1 ? 's' : ''}</span>
                </div>
                <div class="space-y-1.5 pt-1">
                  ${g.items.map(it => `
                    <div class="p-2.5 rounded-lg panel-bg border border-stone-200/60 dark:border-slate-800/80 hover:border-theme-main flex items-center justify-between gap-2.5 transition group cursor-pointer" onclick="app.closeModal('modalOverdueMilestones'); app.jumpToMilestone('${it.cat}', '${it.id}')" title="Clic para abrir y localizar en la lista">
                      <div class="flex items-center gap-2.5 min-w-0 flex-1">
                        <span class="w-2 h-2 rounded-full bg-theme-accent shrink-0 animate-pulse"></span>
                        <div class="truncate min-w-0">
                          ${it.subPath ? `<div class="text-[10px] font-semibold text-theme-main/90 dark:text-theme-main truncate mb-0.5">${escapeHtml(it.subPath)}</div>` : ''}
                          <div class="flex items-baseline gap-1.5 flex-wrap">
                            <span class="font-bold text-stone-900 dark:text-white group-hover:text-theme-main transition text-xs truncate">${escapeHtml(it.title)}</span>
                            <span class="text-[10px] text-stone-400 dark:text-slate-500 font-mono">Límite: ${it.date || ''}${it.time ? ' ' + it.time : ''}</span>
                          </div>
                        </div>
                      </div>
                      <div class="flex items-center gap-2 shrink-0">
                        <span class="px-2 py-0.5 rounded-full font-mono text-[10px] font-bold bg-theme-accent-soft text-theme-accent border border-theme-accent/40">${it.isPastTimeToday ? (it.time || 'hora pasada') : Math.abs(Math.round(it.diffDays)) + 'd atraso'}</span>
                        <button type="button" onclick="event.stopPropagation(); app.completeMilestoneDirect('${it.cat}', '${it.id}'); app.openOverdueMilestonesModal();" class="px-2.5 py-1 rounded-md bg-stone-200 dark:bg-slate-800 hover:bg-theme-main hover:text-white text-stone-700 dark:text-slate-200 text-[10px] font-bold transition flex items-center gap-1" title="Marcar como completada">
                          <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
                          <span>Hecha</span>
                        </button>
                      </div>
                    </div>
                  `).join('')}
                </div>
              </div>
            `).join('');
          }

          this.openModal('modalOverdueMilestones');
        },
        filterListOverdueNotes() {
          this.openOverdueMilestonesModal();
        },
        clearActiveListFilter() {
          state.ui.activeListFilter = null;
          renderListsTree();
          saveState();
        },
        scrollToDeliveries() {
          this.clearActiveListFilter();
          app.switchTab(1);
          app.switchListTab('entregas');
          const el = document.getElementById('interactiveListsPanel');
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.classList.add('cyan-glow');
            setTimeout(() => el.classList.remove('cyan-glow'), 2000);
          }
        },
        setListSort(sort) { state.ui.listSort = sort; renderListsTree(); saveState(); },
        toggleListItemStatus(cat, id) {
          const targetCat = cat || state.ui.listTab || 'entregas';
          let found = findNodeAndParentInTree(state.lists[targetCat] || [], id);
          let actualCat = targetCat;
          if (!found) {
            for (const c of ['entregas', 'notas', 'compras', 'objetivos']) {
              found = findNodeAndParentInTree(state.lists[c] || [], id);
              if (found) { actualCat = c; break; }
            }
          }
          if (!found || !found.node) return;
          pushUndo('Cambiar estado de tarea');
          const node = found.node;
          const newDone = !(node.status === 'done' || node.done);
          node.status = newDone ? 'done' : 'pending';
          node.done = newDone;
          setChildrenStatusCascade(node, newDone);
          updateParentsStatusCascade(state.lists[actualCat] || [], id);
          renderListsTree();
          renderMilestoneWidget();
          renderHeaderAndKPIs();
          saveState();
        },
        deleteListItem(cat, id) {
          if (!id) return;
          const targetCat = cat || state.ui.listTab || 'entregas';
          let found = findNodeAndParentInTree(state.lists[targetCat] || [], id);
          let actualCat = targetCat;
          if (!found) {
            for (const c of ['entregas', 'notas', 'compras', 'objetivos']) {
              found = findNodeAndParentInTree(state.lists[c] || [], id);
              if (found) { actualCat = c; break; }
            }
          }
          if (found) {
            pushUndo('Eliminar elemento');
            lastDeletedItem = { type: 'list', cat: actualCat, item: found.node };
            found.array.splice(found.index, 1);
            showUndoToast('Elemento eliminado.');
            renderListsTree();
            renderMilestoneWidget();
            saveState();
          }
        },
        addNewListItem() {
          const cat = state.ui.listTab || 'entregas';
          const titleInput = document.getElementById('newListItemInput');
          const title = titleInput.value.trim();
          if (!title) return;
          const date = document.getElementById('newListItemDate').value;
          const time = (document.getElementById('newListItemTime')?.value || '').trim();
          const note = (document.getElementById('newListItemNote')?.value || '').trim();
          const isPinned = !!document.getElementById('newListItemPinned')?.checked;
          const isContainer = !!document.getElementById('newListItemIsContainer')?.checked;

          pushUndo('Añadir elemento');
          state.lists[cat].push({
            id: 'it_' + Date.now(),
            title,
            note: note || '',
            date: date || null,
            time: time || null,
            pinned: isPinned,
            isContainer: isContainer,
            status: 'pending',
            children: []
          });

          titleInput.value = '';
          if (document.getElementById('newListItemTime')) document.getElementById('newListItemTime').value = '';
          if (document.getElementById('newListItemNote')) document.getElementById('newListItemNote').value = '';
          if (document.getElementById('newListItemPinned')) document.getElementById('newListItemPinned').checked = false;
          if (document.getElementById('newListItemIsContainer')) document.getElementById('newListItemIsContainer').checked = false;
          renderListsTree();
          saveState();
        },

        togglePinListItem(cat, id) {
          const it = state.lists[cat].find(x => x.id === id);
          if (it) {
            pushUndo('Fijar/desfijar elemento');
            it.pinned = !it.pinned;
          }
          renderListsTree();
          saveState();
        },

        openEditListItemModal(cat, id) {
          const found = findNodeAndParentInTree(state.lists[cat] || [], id);
          if (!found) return;
          const it = found.node;
          document.getElementById('editListItemCategory').value = cat;
          document.getElementById('editListItemId').value = it.id;
          document.getElementById('editListItemTitle').value = it.title || '';
          document.getElementById('editListItemNote').value = it.note || '';
          document.getElementById('editListItemDate').value = it.date || '';
          if (document.getElementById('editListItemTime')) document.getElementById('editListItemTime').value = it.time || '';

          const pinBox = document.getElementById('editListItemPinned')?.closest('label');
          const contBox = document.getElementById('editListItemIsContainer')?.closest('label');
          if (found.parent) {
            if (pinBox) pinBox.classList.add('hidden');
            if (contBox) contBox.classList.add('hidden');
          } else {
            if (pinBox) pinBox.classList.remove('hidden');
            if (contBox) contBox.classList.remove('hidden');
            document.getElementById('editListItemPinned').checked = !!it.pinned;
            document.getElementById('editListItemIsContainer').checked = !!it.isContainer;
          }

          document.getElementById('modalEditListItem').classList.remove('hidden');
        },

        saveEditedListItem() {
          const cat = document.getElementById('editListItemCategory').value;
          const id = document.getElementById('editListItemId').value;
          const title = document.getElementById('editListItemTitle').value.trim();
          if (!title) return this.showToast('El título no puede estar vacío.', 'error');

          const found = findNodeAndParentInTree(state.lists[cat] || [], id);
          if (found) {
            pushUndo('Editar elemento');
            found.node.title = title;
            found.node.note = document.getElementById('editListItemNote').value.trim();
            found.node.date = document.getElementById('editListItemDate').value || null;
            found.node.time = (document.getElementById('editListItemTime')?.value || '').trim() || null;
            if (!found.parent) {
              found.node.pinned = document.getElementById('editListItemPinned').checked;
              found.node.isContainer = document.getElementById('editListItemIsContainer').checked;
            }
          }
          app.closeModal('modalEditListItem');
          renderListsTree();
          saveState();
        },

        openAddSubtaskModal(cat, itemId) {
          activeSubtaskPromptContext = { cat, itemId };
          const titleEl = document.getElementById('modalSubtaskTitle');
          const breadcrumbBox = document.getElementById('modalSubtaskBreadcrumbBox');
          const breadcrumbEl = document.getElementById('modalSubtaskParentBreadcrumb');

          const path = getNodePath(state.lists[cat] || [], itemId);
          if (breadcrumbBox && breadcrumbEl) {
            if (path && path.length > 0) {
              breadcrumbBox.classList.remove('hidden');
              breadcrumbEl.innerHTML = path.map(p => `<span class="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-200 font-bold truncate max-w-[120px]">${p}</span>`).join('<span class="text-slate-500 font-black">➔</span>') + '<span class="text-cyan-400 font-black">➔ [Nueva Subnota]</span>';
            } else {
              breadcrumbBox.classList.add('hidden');
            }
          }

          if (titleEl) {
            titleEl.innerHTML = `<span>📝</span> Añadir Subnota`;
          }
          document.getElementById('modalSubtaskInput').value = '';
          document.getElementById('modalSubtaskDate').value = '';
          if (document.getElementById('modalSubtaskTime')) document.getElementById('modalSubtaskTime').value = '';
          document.getElementById('modalSubtaskPrompt').classList.remove('hidden');
          setTimeout(() => document.getElementById('modalSubtaskInput').focus(), 50);
        },

        promptAddSubtask(cat, containerId) {
          app.openAddSubtaskModal(cat, containerId);
        },

        confirmAddSubtask() {
          if (!activeSubtaskPromptContext) return;
          const { cat, itemId } = activeSubtaskPromptContext;
          const title = document.getElementById('modalSubtaskInput').value.trim();
          if (!title) return;
          const dateStr = document.getElementById('modalSubtaskDate').value || null;
          const timeStr = (document.getElementById('modalSubtaskTime')?.value || '').trim() || null;

          const found = findNodeAndParentInTree(state.lists[cat] || [], itemId);
          if (found) {
            pushUndo('Añadir subnota');
            if (!Array.isArray(found.node.children)) found.node.children = [];
            found.node.children.push({
              id: 'sub_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
              title: title,
              date: dateStr,
              time: timeStr,
              done: false,
              children: []
            });
            found.node.collapsed = false;
            renderListsTree();
            saveState();
          }
          app.closeModal('modalSubtaskPrompt');
        },

        switchToSubtaskSeries() {
          if (!activeSubtaskPromptContext) return;
          const { cat, itemId } = activeSubtaskPromptContext;
          this.closeModal('modalSubtaskPrompt');
          this.openSubtaskSeriesModal(cat, itemId);
        },

        openSubtaskSeriesModal(cat, itemId) {
          activeSubtaskSeriesContext = { cat, itemId };
          const breadcrumbBox = document.getElementById('seriesModalBreadcrumbBox');
          const breadcrumbEl = document.getElementById('seriesModalParentBreadcrumb');

          const path = getNodePath(state.lists[cat] || [], itemId);
          if (breadcrumbBox && breadcrumbEl) {
            if (path && path.length > 0) {
              breadcrumbBox.classList.remove('hidden');
              breadcrumbEl.innerHTML = path.map(p => `<span class="px-2 py-0.5 rounded-lg bg-stone-200 dark:bg-slate-800 border border-stone-300 dark:border-slate-700 text-stone-800 dark:text-slate-200 font-bold truncate max-w-[140px]">${p}</span>`).join('<span class="text-stone-400 dark:text-slate-500 font-black">➔</span>') + '<span class="text-emerald-600 dark:text-emerald-400 font-black">➔ [Serie Secuencial]</span>';
            } else {
              breadcrumbBox.classList.add('hidden');
            }
          }

          // Resetear fechas manuales y asignar fecha inicial por defecto
          manualSeriesDates = {};
          const dateInput = document.getElementById('seriesStartDate');
          if (dateInput && !dateInput.value) {
            const today = new Date();
            const yyyy = today.getFullYear();
            const mm = String(today.getMonth() + 1).padStart(2, '0');
            const dd = String(today.getDate()).padStart(2, '0');
            dateInput.value = `${yyyy}-${mm}-${dd}`;
          }

          this.updateSubtaskSeriesPreview();
          document.getElementById('modalSubtaskSeriesPrompt').classList.remove('hidden');
          setTimeout(() => {
            const patternInput = document.getElementById('seriesPatternInput');
            if (patternInput) {
              patternInput.focus();
              patternInput.select();
            }
          }, 50);
        },

        setSeriesPatternPreset(preset) {
          const input = document.getElementById('seriesPatternInput');
          if (input) {
            input.value = preset;
            this.updateSubtaskSeriesPreview();
          }
        },

        toggleSeriesDatesSection() {
          const enabled = document.getElementById('seriesEnableDates')?.checked;
          const controls = document.getElementById('seriesDatesControls');
          if (controls) {
            if (enabled) {
              controls.classList.remove('hidden');
            } else {
              controls.classList.add('hidden');
            }
          }
          this.updateSubtaskSeriesPreview();
        },

        handleSeriesIntervalChange() {
          const type = document.getElementById('seriesIntervalType')?.value;
          const stepBox = document.getElementById('seriesIntervalStepBox');
          const stepLabel = document.getElementById('seriesIntervalStepLabel');
          const stepInput = document.getElementById('seriesIntervalStep');

          if (stepBox && stepLabel && stepInput) {
            if (type === 'days') {
              stepBox.classList.remove('hidden');
              stepLabel.textContent = 'Paso (cada N días):';
              if (!stepInput.value || Number(stepInput.value) <= 0) stepInput.value = '2';
            } else if (type === 'hours') {
              stepBox.classList.remove('hidden');
              stepLabel.textContent = 'Paso (cada N horas):';
              if (!stepInput.value || Number(stepInput.value) <= 0) stepInput.value = '12';
            } else {
              stepBox.classList.add('hidden');
            }
          }
          this.updateSubtaskSeriesPreview();
        },

        calculateSeriesItems() {
          const patternRaw = (document.getElementById('seriesPatternInput')?.value || '').trim();
          const pattern = patternRaw || 'Subnota {n}';
          const enableDates = !!document.getElementById('seriesEnableDates')?.checked;
          const startDateStr = document.getElementById('seriesStartDate')?.value || '';
          const startTimeStr = (document.getElementById('seriesStartTime')?.value || '').trim();
          const intervalType = document.getElementById('seriesIntervalType')?.value || 'weekly';
          const intervalStep = Math.max(1, parseInt(document.getElementById('seriesIntervalStep')?.value, 10) || 1);
          const adjustWeekend = !!document.getElementById('seriesAdjustWeekend')?.checked;

          let rawItems = [];
          if (pattern.includes(',')) {
            // Lista separada por comas (ej. "Paso A, Paso B, Paso C")
            rawItems = pattern.split(',').map(s => s.trim()).filter(Boolean);
          } else {
            let start = parseInt(document.getElementById('seriesStartNum')?.value, 10);
            let end = parseInt(document.getElementById('seriesEndNum')?.value, 10);
            if (isNaN(start)) start = 1;
            if (isNaN(end)) end = 6;
            if (start > end) {
              const tmp = start; start = end; end = tmp;
            }
            // Límite de seguridad
            const count = Math.min(50, end - start + 1);
            for (let i = 0; i < count; i++) {
              const num = start + i;
              const title = pattern.includes('{n}') ? pattern.replace(/\{n\}/g, num) : `${pattern} ${num}`;
              rawItems.push(title);
            }
          }

          if (rawItems.length === 0) rawItems = ['Subnota 1'];

          if (!enableDates) {
            return rawItems.map((title, idx) => {
              const m = manualSeriesDates[idx] || {};
              return {
                title,
                date: m.date || null,
                time: m.time || null
              };
            });
          }

          let baseDate = null;
          if (enableDates && startDateStr) {
            const timePart = startTimeStr || '23:59';
            const [y, m, d] = startDateStr.split('-').map(Number);
            const [hh, mm] = timePart.split(':').map(Number);
            baseDate = new Date(y, m - 1, d, isNaN(hh) ? 23 : hh, isNaN(mm) ? 59 : mm);
          }

          const items = rawItems.map((title, idx) => {
            if (!baseDate || isNaN(baseDate.getTime())) {
              return { title, date: null, time: null };
            }

            const itemDate = new Date(baseDate.getTime());
            if (intervalType === 'weekly') {
              itemDate.setDate(itemDate.getDate() + (idx * 7));
            } else if (intervalType === 'biweekly') {
              itemDate.setDate(itemDate.getDate() + (idx * 14));
            } else if (intervalType === 'days') {
              itemDate.setDate(itemDate.getDate() + (idx * intervalStep));
            } else if (intervalType === 'hours') {
              itemDate.setTime(itemDate.getTime() + (idx * intervalStep * 3600000));
            }

            if (adjustWeekend) {
              const dayOfWeek = itemDate.getDay(); // 0 is Sunday, 6 is Saturday
              if (dayOfWeek === 6) { // Sábado -> mover a viernes
                itemDate.setDate(itemDate.getDate() - 1);
              } else if (dayOfWeek === 0) { // Domingo -> mover a viernes
                itemDate.setDate(itemDate.getDate() - 2);
              }
            }

            const yyyy = itemDate.getFullYear();
            const mm = String(itemDate.getMonth() + 1).padStart(2, '0');
            const dd = String(itemDate.getDate()).padStart(2, '0');
            const dateStr = `${yyyy}-${mm}-${dd}`;
            
            const hours = String(itemDate.getHours()).padStart(2, '0');
            const mins = String(itemDate.getMinutes()).padStart(2, '0');
            const timeStr = `${hours}:${mins}`;

            return {
              title,
              date: dateStr,
              time: startTimeStr ? timeStr : null
            };
          });

          return items;
        },

        updateSubtaskSeriesPreview() {
          const items = this.calculateSeriesItems();
          const countBadge = document.getElementById('seriesPreviewCountBadge');
          const generateBtnText = document.getElementById('seriesGenerateBtnText');
          const previewList = document.getElementById('seriesPreviewList');
          const enableDates = !!document.getElementById('seriesEnableDates')?.checked;

          if (countBadge) countBadge.textContent = `${items.length} ${items.length === 1 ? 'elemento' : 'elementos'}`;
          if (generateBtnText) generateBtnText.textContent = `Generar ${items.length} ${items.length === 1 ? 'Subnota' : 'Subnotas'}`;

          if (previewList) {
            if (items.length === 0) {
              previewList.innerHTML = `<div class="p-3 text-center text-stone-400 dark:text-slate-500 italic">No hay subnotas configuradas.</div>`;
              return;
            }
            if (enableDates) {
              previewList.innerHTML = items.map(item => `
                <div class="flex items-center justify-between p-1.5 rounded-lg bg-stone-100/90 dark:bg-slate-900 border border-stone-200 dark:border-slate-800">
                  <div class="flex items-center gap-1.5 truncate mr-2">
                    <span class="text-emerald-500 font-bold shrink-0">•</span>
                    <span class="font-semibold text-stone-800 dark:text-slate-200 truncate">${item.title}</span>
                  </div>
                  ${item.date ? `<span class="text-[10px] font-mono font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-500/20 shrink-0">📅 ${item.date}${item.time ? ' ' + item.time : ''}</span>` : '<span class="text-[10px] text-stone-400 dark:text-slate-500 shrink-0">Sin fecha</span>'}
                </div>
              `).join('');
            } else {
              previewList.innerHTML = items.map((item, idx) => `
                <div class="flex flex-col sm:flex-row sm:items-center justify-between p-1.5 rounded-lg bg-stone-100/90 dark:bg-slate-900 border border-stone-200 dark:border-slate-800 gap-1.5">
                  <div class="flex items-center gap-1.5 truncate">
                    <span class="text-amber-500 font-bold shrink-0">•</span>
                    <span class="font-semibold text-stone-800 dark:text-slate-200 truncate">${item.title}</span>
                  </div>
                  <div class="flex items-center gap-1 shrink-0">
                    <input type="date" value="${item.date || ''}" onchange="app.updateManualSeriesItem(${idx}, 'date', this.value)" class="input-bg border rounded-md px-1.5 py-0.5 text-[10px] font-mono outline-none focus:border-emerald-500 text-stone-800 dark:text-slate-200" title="Fecha manual" />
                    <input type="time" value="${item.time || ''}" onchange="app.updateManualSeriesItem(${idx}, 'time', this.value)" class="input-bg border rounded-md px-1 py-0.5 text-[10px] font-mono outline-none focus:border-emerald-500 text-stone-800 dark:text-slate-200" title="Hora manual" />
                    ${item.date ? `<button type="button" onclick="app.clearManualSeriesItem(${idx})" class="p-0.5 rounded text-stone-400 hover:text-rose-500 transition text-[10px]" title="Borrar fecha">✕</button>` : ''}
                  </div>
                </div>
              `).join('');
            }
          }
        },

        updateManualSeriesItem(idx, field, val) {
          manualSeriesDates[idx] = manualSeriesDates[idx] || { date: '', time: '' };
          manualSeriesDates[idx][field] = val ? val.trim() : '';
          this.updateSubtaskSeriesPreview();
        },

        clearManualSeriesItem(idx) {
          if (manualSeriesDates[idx]) {
            delete manualSeriesDates[idx];
          }
          this.updateSubtaskSeriesPreview();
        },

        confirmAddSubtaskSeries() {
          if (!activeSubtaskSeriesContext) return;
          const { cat, itemId } = activeSubtaskSeriesContext;
          const items = this.calculateSeriesItems();

          if (!items || items.length === 0) {
            return this.showToast('No hay elementos a generar.', 'warning');
          }

          const found = findNodeAndParentInTree(state.lists[cat] || [], itemId);
          if (!found) {
            return this.showToast('No se encontró el elemento padre.', 'error');
          }

          pushUndo(`Generar serie de ${items.length} subnotas`);
          if (!Array.isArray(found.node.children)) found.node.children = [];

          const timestamp = Date.now();
          items.forEach((it, idx) => {
            found.node.children.push({
              id: 'sub_' + timestamp + '_' + idx + '_' + Math.random().toString(36).substr(2, 4),
              title: it.title,
              date: it.date || null,
              time: it.time || null,
              done: false,
              pinned: false,
              children: []
            });
          });

          found.node.collapsed = false;
          this.closeModal('modalSubtaskSeriesPrompt');
          activeSubtaskSeriesContext = null;

          showUndoToast(`${items.length} subnotas creadas en secuencia.`);
          renderListsTree();
          renderMilestoneWidget();
          saveState();
        },

        toggleSubtaskStatus(cat, itemId, subId) {
          const targetId = subId || itemId;
          const found = findNodeAndParentInTree(state.lists[cat] || [], targetId);
          if (!found) return;
          pushUndo('Cambiar estado de subnota');
          const newDone = !(found.node.status === 'done' || found.node.done);
          found.node.done = newDone;
          if (found.node.status !== undefined) found.node.status = newDone ? 'done' : 'pending';
          setChildrenStatusCascade(found.node, newDone);
          updateParentsStatusCascade(state.lists[cat] || [], targetId);
          renderListsTree();
          renderMilestoneWidget();
          renderHeaderAndKPIs();
          saveState();
        },

        deleteSubtask(cat, itemId, subId) {
          const targetId = subId || itemId;
          const found = findNodeAndParentInTree(state.lists[cat] || [], targetId);
          if (!found) return;
          pushUndo('Eliminar subnota');
          found.array.splice(found.index, 1);
          renderListsTree();
          saveState();
        },

        toggleCollapseListNode(cat, itemId) {
          const found = findNodeAndParentInTree(state.lists[cat] || [], itemId);
          if (found && found.node) {
            found.node.collapsed = !found.node.collapsed;
            saveState();
            renderListsTree();
          }
        },

        toggleCollapseAllListNodes(shouldCollapse) {
          const cat = state.ui.listTab || 'entregas';
          const items = state.lists[cat] || [];
          if (shouldCollapse === undefined) {
            let anyExpanded = false;
            function checkOpen(nodes) {
              if (!Array.isArray(nodes) || anyExpanded) return;
              for (const n of nodes) {
                if (Array.isArray(n.children) && n.children.length > 0) {
                  if (!n.collapsed) { anyExpanded = true; break; }
                  checkOpen(n.children);
                }
              }
            }
            checkOpen(items);
            shouldCollapse = anyExpanded;
          }

          function walk(nodes) {
            if (!Array.isArray(nodes)) return;
            nodes.forEach(n => {
              if (n && Array.isArray(n.children) && n.children.length > 0) {
                n.collapsed = shouldCollapse;
                walk(n.children);
              }
            });
          }
          walk(items);
          saveState();
          renderListsTree();
        },

        toggleCompletedAccordion() {
          state.ui.completedOpen = !state.ui.completedOpen;
          renderListsTree();
        },

        async clearCompletedList(cat) {
          const ok = await this.showConfirm({
            title: 'Vaciar tareas completadas',
            message: '¿Eliminar definitivamente todas las tareas completadas de esta lista?',
            confirmText: 'Eliminar',
            isDanger: true
          });
          if (!ok) return;
          pushUndo('Vaciar tareas completadas');
          state.lists[cat] = state.lists[cat].filter(it => it.isContainer || it.status !== 'done');
          renderListsTree();
          saveState();
          this.showToast('Tareas completadas eliminadas.', 'info');
        },
        moveListItem(cat, itemIdOrIdx, dir) {
          pushUndo('Reordenar notas');
          state.ui.listSort = 'manual';

          if (typeof itemIdOrIdx === 'number') {
            const arr = state.lists[cat];
            const target = itemIdOrIdx + dir;
            if (arr && target >= 0 && target < arr.length) {
              const temp = arr[itemIdOrIdx];
              arr[itemIdOrIdx] = arr[target];
              arr[target] = temp;
            }
            renderListsTree();
            saveState();
            return;
          }

          const itemId = String(itemIdOrIdx);
          const moveInNode = (arr, isTopLevel = false) => {
            const itemIdx = arr.findIndex(x => String(x.id) === itemId);
            if (itemIdx !== -1) {
              if (isTopLevel) {
                const isTargetActive = arr[itemIdx].isContainer || arr[itemIdx].status !== 'done';
                const siblings = arr.filter(x => (x.isContainer || x.status !== 'done') === isTargetActive);
                const sIdx = siblings.findIndex(x => String(x.id) === itemId);
                const targetSIdx = sIdx + dir;
                if (targetSIdx >= 0 && targetSIdx < siblings.length) {
                  const targetNeighbor = siblings[targetSIdx];
                  const realIdx1 = arr.findIndex(x => String(x.id) === itemId);
                  const realIdx2 = arr.findIndex(x => String(x.id) === String(targetNeighbor.id));
                  if (realIdx1 !== -1 && realIdx2 !== -1) {
                    const temp = arr[realIdx1];
                    arr[realIdx1] = arr[realIdx2];
                    arr[realIdx2] = temp;
                  }
                }
              } else {
                const targetIdx = itemIdx + dir;
                if (targetIdx >= 0 && targetIdx < arr.length) {
                  const temp = arr[itemIdx];
                  arr[itemIdx] = arr[targetIdx];
                  arr[targetIdx] = temp;
                }
              }
              return true;
            }

            for (const it of arr) {
              if (Array.isArray(it.children) && it.children.length > 0) {
                if (moveInNode(it.children, false)) return true;
              }
            }
            return false;
          };

          if (Array.isArray(state.lists[cat])) {
            moveInNode(state.lists[cat], true);
          }
          renderListsTree();
          saveState();
        },

        // DUPLICAR NOTAS Y SUBNOTAS (con clonación profunda e incremento inteligente de títulos y fechas)
        duplicateListItem(cat, id, forceInstant = false) {
          const found = findNodeAndParentInTree(state.lists[cat] || [], id);
          if (!found) return;

          // Si tiene fechas o patrón numérico en el título y no es forzado directo, abrir diálogo inteligente
          if (!forceInstant && (nodeHasDates(found.node) || /\d+$/.test(found.node.title.trim()))) {
            this.openSmartDuplicateModal(cat, id);
            return;
          }

          pushUndo('Duplicar elemento');
          const cloned = deepCloneNodeWithNewIds(found.node);
          found.array.splice(found.index + 1, 0, cloned);
          renderListsTree();
          saveState();
          showUndoToast('Elemento duplicado: ' + cloned.title);
        },

        openSmartDuplicateModal(cat, id) {
          const found = findNodeAndParentInTree(state.lists[cat] || [], id);
          if (!found) return;
          activeSmartDuplicateContext = { cat, id };

          const titleEl = document.getElementById('smartDupSourceTitle');
          const badgeEl = document.getElementById('smartDupDateBadge');
          const countInput = document.getElementById('smartDupCount');
          const enableShiftCheck = document.getElementById('smartDupEnableShift');
          const intervalSelect = document.getElementById('smartDupIntervalDays');

          if (titleEl) {
            titleEl.value = found.node.title;
          }
          const hasDates = nodeHasDates(found.node);
          if (badgeEl) {
            badgeEl.textContent = hasDates ? 'Con fechas' : 'Sin fechas';
            badgeEl.className = hasDates ? 'text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 font-bold border border-emerald-500/30 shrink-0' : 'text-[10px] font-mono px-2 py-0.5 rounded-full bg-stone-100 dark:bg-slate-800 text-stone-600 dark:text-slate-400 font-bold border border-stone-300 dark:border-slate-700 shrink-0';
          }
          if (countInput) countInput.value = '1';
          if (enableShiftCheck) enableShiftCheck.checked = hasDates;
          if (intervalSelect) intervalSelect.value = '7';
          document.getElementById('smartDupCustomDaysBox')?.classList.add('hidden');

          this.updateSmartDuplicatePreview();
          document.getElementById('modalSmartDuplicate')?.classList.remove('hidden');
          setTimeout(() => titleEl && titleEl.focus(), 60);
        },

        handleSmartDupIntervalChange() {
          const sel = document.getElementById('smartDupIntervalDays')?.value;
          const customBox = document.getElementById('smartDupCustomDaysBox');
          if (customBox) {
            if (sel === 'custom') customBox.classList.remove('hidden');
            else customBox.classList.add('hidden');
          }
          this.updateSmartDuplicatePreview();
        },

        updateSmartDuplicatePreview() {
          if (!activeSmartDuplicateContext) return;
          const { cat, id } = activeSmartDuplicateContext;
          const found = findNodeAndParentInTree(state.lists[cat] || [], id);
          if (!found) return;

          let count = parseInt(document.getElementById('smartDupCount')?.value, 10);
          if (isNaN(count) || count < 1) count = 1;
          if (count > 20) count = 20;

          const baseTitleInput = (document.getElementById('smartDupSourceTitle')?.value || '').trim();
          const baseTitle = baseTitleInput || found.node.title;

          const enableShift = !!document.getElementById('smartDupEnableShift')?.checked;
          const intervalVal = document.getElementById('smartDupIntervalDays')?.value || '7';
          let stepDays = 7;
          if (intervalVal === 'custom') {
            stepDays = parseInt(document.getElementById('smartDupCustomDays')?.value, 10) || 7;
          } else {
            stepDays = parseInt(intervalVal, 10) || 7;
          }
          const adjustWeekend = !!document.getElementById('smartDupAdjustWeekend')?.checked;

          const badge = document.getElementById('smartDupPreviewBadge');
          const btnText = document.getElementById('smartDupConfirmBtnText');
          const previewList = document.getElementById('smartDupPreviewList');

          if (badge) badge.textContent = `${count} ${count === 1 ? 'copia' : 'copias'}`;
          if (btnText) btnText.textContent = `Duplicar ${count} ${count === 1 ? 'Semana / Copia' : 'Semanas / Copias'}`;

          if (previewList) {
            let html = '';
            for (let i = 1; i <= count; i++) {
              let copyTitle;
              if (count === 1 && baseTitleInput && baseTitleInput !== found.node.title) {
                copyTitle = baseTitleInput;
              } else {
                copyTitle = generateNumberedCopyTitle(baseTitle, i);
              }
              const daysShift = enableShift ? (i * stepDays) : 0;
              let dateNote = '';
              if (enableShift && found.node.date) {
                const parts = found.node.date.split('-');
                if (parts.length === 3) {
                  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
                  d.setDate(d.getDate() + daysShift);
                  if (adjustWeekend) {
                    const day = d.getDay();
                    if (day === 6) d.setDate(d.getDate() - 1);
                    else if (day === 0) d.setDate(d.getDate() - 2);
                  }
                  const yyyy = d.getFullYear();
                  const mm = String(d.getMonth() + 1).padStart(2, '0');
                  const dd = String(d.getDate()).padStart(2, '0');
                  dateNote = `${yyyy}-${mm}-${dd}`;
                }
              }

              html += `
                <div class="flex items-center justify-between p-1.5 rounded-lg bg-stone-100/90 dark:bg-slate-900 border border-stone-200 dark:border-slate-800">
                  <div class="flex items-center gap-1.5 truncate mr-2">
                    <span class="text-emerald-500 font-bold shrink-0">${i}.</span>
                    <span class="font-semibold text-stone-800 dark:text-slate-200 truncate">${copyTitle}</span>
                  </div>
                  <div class="flex items-center gap-1 shrink-0 font-mono text-[10px]">
                    ${enableShift ? `<span class="px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-bold border border-emerald-500/20">+${daysShift}d${dateNote ? ' (' + dateNote + ')' : ''}</span>` : '<span class="text-stone-400">Sin desplazar</span>'}
                  </div>
                </div>
              `;
            }
            previewList.innerHTML = html;
          }
        },

        confirmSmartDuplicate(bypassShift = false) {
          if (!activeSmartDuplicateContext) return;
          const { cat, id } = activeSmartDuplicateContext;
          const found = findNodeAndParentInTree(state.lists[cat] || [], id);
          if (!found) return;

          if (bypassShift) {
            this.closeModal('modalSmartDuplicate');
            this.duplicateListItem(cat, id, true);
            return;
          }

          let count = parseInt(document.getElementById('smartDupCount')?.value, 10);
          if (isNaN(count) || count < 1) count = 1;
          if (count > 20) count = 20;

          const baseTitleInput = (document.getElementById('smartDupSourceTitle')?.value || '').trim();
          const baseTitle = baseTitleInput || found.node.title;

          const enableShift = !!document.getElementById('smartDupEnableShift')?.checked;
          const intervalVal = document.getElementById('smartDupIntervalDays')?.value || '7';
          let stepDays = 7;
          if (intervalVal === 'custom') {
            stepDays = parseInt(document.getElementById('smartDupCustomDays')?.value, 10) || 7;
          } else {
            stepDays = parseInt(intervalVal, 10) || 7;
          }
          const adjustWeekend = !!document.getElementById('smartDupAdjustWeekend')?.checked;

          pushUndo(`Duplicar ${count} copias de ${found.node.title}`);

          for (let i = 1; i <= count; i++) {
            const cloned = deepCloneNodeWithNewIds(found.node);
            if (count === 1 && baseTitleInput && baseTitleInput !== found.node.title) {
              cloned.title = baseTitleInput;
            } else {
              cloned.title = generateNumberedCopyTitle(baseTitle, i);
            }
            if (enableShift) {
              shiftNodeDates(cloned, i * stepDays, adjustWeekend);
            }
            found.array.splice(found.index + i, 0, cloned);
          }

          this.closeModal('modalSmartDuplicate');
          activeSmartDuplicateContext = null;

          showUndoToast(`${count} ${count === 1 ? 'copia creada' : 'copias creadas en secuencia.'}`);
          renderListsTree();
          renderMilestoneWidget();
          saveState();
        },

        duplicateFromEditModal() {
          const cat = document.getElementById('editListItemCategory').value;
          const id = document.getElementById('editListItemId').value;
          if (!cat || !id) return;
          app.closeModal('modalEditListItem');
          app.duplicateListItem(cat, id);
        },

        deleteFromEditModal() {
          const cat = document.getElementById('editListItemCategory').value;
          const id = document.getElementById('editListItemId').value;
          if (!cat || !id) return;
          app.closeModal('modalEditListItem');
          app.deleteListItem(cat, id);
        },

        // MOVER / REUBICAR NOTAS Y SUBNOTAS (MODAL DE DESTINO COLAPSABLE)
        openMoveListItemModal(cat, id) {
          const found = findNodeAndParentInTree(state.lists[cat] || [], id);
          if (!found) return;
          activeMoveContext = { cat, id, sourceNode: found.node };
          moveModalExpandedIds = new Set(); // Inicia plegado por defecto para no saturar

          const titleEl = document.getElementById('modalMoveItemSourceTitle');
          if (titleEl) titleEl.textContent = found.node.title;

          this.renderMoveDestinationsList();
          document.getElementById('modalMoveItem').classList.remove('hidden');
        },

        toggleMoveDestFolder(nodeId) {
          if (moveModalExpandedIds.has(nodeId)) {
            moveModalExpandedIds.delete(nodeId);
          } else {
            moveModalExpandedIds.add(nodeId);
          }
          this.renderMoveDestinationsList();
        },

        toggleCollapseAllMoveDestinations(shouldCollapse) {
          if (!activeMoveContext) return;
          const { cat, id, sourceNode } = activeMoveContext;
          moveModalExpandedIds.clear();
          if (!shouldCollapse) {
            function addAll(nodes) {
              if (!Array.isArray(nodes)) return;
              nodes.forEach(n => {
                if (n.id === id || isDescendantOf(sourceNode, n.id)) return;
                if (Array.isArray(n.children) && n.children.length > 0) {
                  moveModalExpandedIds.add(n.id);
                  addAll(n.children);
                }
              });
            }
            addAll(state.lists[cat] || []);
          }
          this.renderMoveDestinationsList();
        },

        renderMoveDestinationsList() {
          if (!activeMoveContext) return;
          const { cat, id, sourceNode } = activeMoveContext;
          const destContainer = document.getElementById('modalMoveDestinationsList');
          if (!destContainer) return;

          let html = `
            <button type="button" onclick="app.executeMoveItem('root')" class="w-full text-left p-2.5 rounded-xl border border-stone-300 dark:border-slate-700/80 hover:border-theme dark:hover:border-cyan-400 subpanel-bg hover:bg-stone-200/60 dark:hover:bg-cyan-950/40 transition flex items-center justify-between group">
              <div class="flex items-center gap-2">
                <span class="text-base">📂</span>
                <div>
                  <div class="font-bold text-stone-900 dark:text-white group-hover:text-theme-main dark:group-hover:text-cyan-300">Nivel Raíz Principal</div>
                  <div class="text-[10px] text-stone-500 dark:text-slate-400">Mover fuera de cualquier carpeta al listado principal</div>
                </div>
              </div>
              <span class="text-xs text-theme-main dark:text-cyan-400 font-bold opacity-0 group-hover:opacity-100 transition">Elegir ➔</span>
            </button>
          `;

          function collectDestinations(nodes, depth = 0) {
            if (!Array.isArray(nodes)) return;
            nodes.forEach(n => {
              if (n.id === id || isDescendantOf(sourceNode, n.id)) return;
              const hasChildren = Array.isArray(n.children) && n.children.length > 0;
              const isExpanded = moveModalExpandedIds.has(n.id);
              const indent = depth * 14;
              const isFolder = !!n.isContainer;
              const icon = isFolder ? '📁' : '📝';

              html += `
                <div style="margin-left: ${indent}px; width: calc(100% - ${indent}px);" class="flex items-center gap-1">
                  ${hasChildren ? `
                    <button type="button" onclick="app.toggleMoveDestFolder('${n.id}')" class="w-6 h-7 rounded-lg hover:bg-stone-200 dark:hover:bg-slate-800 text-stone-500 dark:text-slate-400 hover:text-theme-main dark:hover:text-cyan-300 font-bold text-xs flex items-center justify-center shrink-0 transition" title="${isExpanded ? 'Plegar subcarpetas' : 'Desplegar subcarpetas'}">
                      ${isExpanded ? '▼' : '▶'}
                    </button>
                  ` : '<div class="w-6 shrink-0"></div>'}
                  <button type="button" onclick="app.executeMoveItem('${n.id}')" class="flex-1 text-left p-2 rounded-xl border border-stone-300 dark:border-slate-800 hover:border-theme dark:hover:border-cyan-400 subpanel-bg hover:bg-stone-200/60 dark:hover:bg-cyan-950/40 transition flex items-center justify-between group min-w-0">
                    <div class="flex items-center gap-2 truncate">
                      <span class="text-sm shrink-0">${icon}</span>
                      <span class="font-semibold text-stone-900 dark:text-slate-200 group-hover:text-theme-main dark:group-hover:text-cyan-300 truncate">${n.title}</span>
                      ${isFolder ? '<span class="text-[9px] px-1.5 py-0.2 rounded bg-cyan-950 text-cyan-300 border border-cyan-800 shrink-0 font-mono">Carpeta</span>' : ''}
                      ${hasChildren ? `<span class="text-[9px] text-stone-500 dark:text-slate-500 font-mono">(${n.children.length})</span>` : ''}
                    </div>
                    <span class="text-xs text-theme-main dark:text-cyan-400 font-bold opacity-0 group-hover:opacity-100 transition shrink-0 ml-2">Meter aquí ➔</span>
                  </button>
                </div>
              `;

              if (hasChildren && isExpanded) {
                collectDestinations(n.children, depth + 1);
              }
            });
          }

          collectDestinations(state.lists[cat] || [], 0);
          destContainer.innerHTML = html;
        },

        openMoveModalFromEdit() {
          const cat = document.getElementById('editListItemCategory').value;
          const id = document.getElementById('editListItemId').value;
          if (!cat || !id) return;
          app.closeModal('modalEditListItem');
          app.openMoveListItemModal(cat, id);
        },

        executeMoveItem(targetId) {
          if (!activeMoveContext) return;
          const { cat, id } = activeMoveContext;
          if (targetId === id) return this.showToast('No puedes mover una nota dentro de sí misma.', 'warning');

          const sourceFound = findNodeAndParentInTree(state.lists[cat] || [], id);
          if (!sourceFound) return;

          pushUndo('Mover elemento');
          const removed = sourceFound.array.splice(sourceFound.index, 1)[0];

          if (!targetId || targetId === 'root') {
            state.lists[cat].push(removed);
            showUndoToast(`"${removed.title}" movida a la raíz principal.`);
          } else {
            const targetFound = findNodeAndParentInTree(state.lists[cat] || [], targetId);
            if (targetFound) {
              if (!Array.isArray(targetFound.node.children)) targetFound.node.children = [];
              targetFound.node.children.push(removed);
              targetFound.node.collapsed = false;
              showUndoToast(`"${removed.title}" movida dentro de "${targetFound.node.title}".`);
            } else {
              state.lists[cat].push(removed);
            }
          }

          app.closeModal('modalMoveItem');
          activeMoveContext = null;
          renderListsTree();
          saveState();
        },

        // FUNCIONES DE APOYO Y POSICIONAMIENTO UNIVERSAL PARA MENÚS CONTEXTUALES (••• Y CLIC DERECHO)
        positionPopoverMenu(popover, event) {
          if (!popover) return;
          popover.style.visibility = 'hidden';
          popover.classList.remove('hidden');
          const popWidth = popover.offsetWidth || 208;
          const popHeight = popover.offsetHeight || 230;

          let top = 100, left = 100;

          if (event && event.type === 'contextmenu') {
            left = event.clientX;
            top = event.clientY;
          } else if (event && event.currentTarget) {
            const rect = event.currentTarget.getBoundingClientRect();
            left = rect.right - popWidth;
            top = rect.bottom + 4;
            // Si desborda por abajo de la ventana, desplegar hacia arriba del botón
            if (top + popHeight > window.innerHeight - 10) {
              top = rect.top - popHeight - 4;
            }
          }

          // Ajuste estricto dentro del viewport (SIN window.scrollY/X porque es fixed)
          if (left + popWidth > window.innerWidth - 10) left = window.innerWidth - popWidth - 10;
          if (left < 10) left = 10;
          if (top + popHeight > window.innerHeight - 10) top = window.innerHeight - popHeight - 10;
          if (top < 10) top = 10;

          popover.style.top = `${Math.round(top)}px`;
          popover.style.left = `${Math.round(left)}px`;
          popover.style.visibility = 'visible';
        },

        closeAllContextMenus() {
          ['listActionMenuPopover', 'expenseActionMenuPopover', 'habitActionMenuPopover', 'classActionMenuPopover', 'subjectActionMenuPopover', 'workspaceTabActionMenuPopover', 'boardCardMenuPopover'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.add('hidden');
          });
          activeActionsMenuContext = null;
          activeExpenseMenuContext = null;
          activeHabitMenuContext = null;
          activeClassMenuContext = null;
          activeSubjectMenuContext = null;
          activeWorkspaceTabContext = null;
        },

        // MENÚ CONTEXTUAL (••• Y CLIC DERECHO) PARA ELEMENTOS DE LISTAS
        openItemActionsMenu(event, cat, id) {
          if (event) {
            event.stopPropagation();
            if (event.preventDefault) event.preventDefault();
          }

          const popover = document.getElementById('listActionMenuPopover');
          if (!popover) return false;

          // Toggle: si ya está abierto para este mismo elemento y fue un clic normal, cerrarlo
          if (!popover.classList.contains('hidden') && activeActionsMenuContext && activeActionsMenuContext.id === id && event && event.type === 'click') {
            this.closeItemActionsMenu();
            return false;
          }

          let targetCat = cat || state.ui.listTab || 'entregas';
          let found = findNodeAndParentInTree(state.lists[targetCat] || [], id);
          let actualCat = targetCat;
          if (!found) {
            for (const c of Object.keys(state.lists || {})) {
              found = findNodeAndParentInTree(state.lists[c] || [], id);
              if (found) { actualCat = c; break; }
            }
          }
          if (!found) return false;

          this.closeAllContextMenus();
          activeActionsMenuContext = { cat: actualCat, id, node: found.node, isContainer: found.node.isContainer, pinned: !!found.node.pinned };

          const isCompleted = !!(found.node.done || found.node.status === 'done');
          const pinTextEl = document.getElementById('listActionMenuPinText');
          if (pinTextEl) pinTextEl.textContent = found.node.pinned ? 'Desfijar' : 'Fijar arriba';

          const restoreBtn = document.getElementById('listActionMenuRestoreBtn');
          const nonCompletedRows = document.querySelectorAll('.list-action-non-completed');
          if (isCompleted) {
            if (restoreBtn) restoreBtn.classList.remove('hidden');
            nonCompletedRows.forEach(el => el.classList.add('hidden'));
          } else {
            if (restoreBtn) restoreBtn.classList.add('hidden');
            nonCompletedRows.forEach(el => el.classList.remove('hidden'));
          }

          this.positionPopoverMenu(popover, event);
          return false;
        },

        closeItemActionsMenu() {
          this.closeAllContextMenus();
        },

        triggerMenuAction(action) {
          if (!activeActionsMenuContext) return;
          const { cat, id } = activeActionsMenuContext;
          this.closeItemActionsMenu();

          if (action === 'restore') {
            this.toggleListItemStatus(cat, id);
          } else if (action === 'edit') {
            this.openEditListItemModal(cat, id);
          } else if (action === 'addSubtaskSeries') {
            this.openSubtaskSeriesModal(cat, id);
          } else if (action === 'duplicate') {
            this.duplicateListItem(cat, id);
          } else if (action === 'move') {
            this.openMoveListItemModal(cat, id);
          } else if (action === 'pin') {
            this.togglePinListItem(cat, id);
          } else if (action === 'moveUp') {
            this.moveListItem(cat, id, -1);
          } else if (action === 'moveDown') {
            this.moveListItem(cat, id, 1);
          } else if (action === 'delete') {
            this.deleteListItem(cat, id);
          }
        },

        // MENÚ CONTEXTUAL (••• Y CLIC DERECHO) PARA GASTOS
        openExpenseActionsMenu(event, expenseId) {
          if (event) {
            event.stopPropagation();
            if (event.preventDefault) event.preventDefault();
          }
          const popover = document.getElementById('expenseActionMenuPopover');
          if (!popover) return false;

          // Toggle si se hace clic repetido en el mismo botón
          if (!popover.classList.contains('hidden') && activeExpenseMenuContext && activeExpenseMenuContext.expenseId === expenseId && event && event.type === 'click') {
            this.closeExpenseActionsMenu();
            return false;
          }

          this.closeAllContextMenus();
          activeExpenseMenuContext = { expenseId };

          this.positionPopoverMenu(popover, event);
          return false;
        },

        closeExpenseActionsMenu() {
          this.closeAllContextMenus();
        },

        triggerExpenseMenuAction(action) {
          if (!activeExpenseMenuContext) return;
          const { expenseId } = activeExpenseMenuContext;
          this.closeExpenseActionsMenu();
          if (action === 'edit') {
            this.openEditExpenseModal(expenseId);
          } else if (action === 'delete') {
            this.deleteExpense(expenseId);
          }
        },

        // MENÚ CONTEXTUAL (••• Y CLIC DERECHO) PARA HÁBITOS PERSONALIZADOS
        openCustomHabitActionsMenu(event, habitId) {
          if (event) {
            event.stopPropagation();
            if (event.preventDefault) event.preventDefault();
          }
          const popover = document.getElementById('habitActionMenuPopover');
          if (!popover) return false;

          if (!popover.classList.contains('hidden') && activeHabitMenuContext && activeHabitMenuContext.habitId === habitId && event && event.type === 'click') {
            this.closeCustomHabitActionsMenu();
            return false;
          }

          this.closeAllContextMenus();
          activeHabitMenuContext = { habitId };

          const h = (state.customHabits || []).find(item => item.id === habitId);
          const toggleTextEl = document.getElementById('habitActionMenuToggleText');
          if (toggleTextEl && h) {
            toggleTextEl.textContent = (h.active !== false) ? 'Pausar hábito' : 'Activar hábito';
          }

          this.positionPopoverMenu(popover, event);
          return false;
        },

        closeCustomHabitActionsMenu() {
          this.closeAllContextMenus();
        },

        triggerHabitMenuAction(action) {
          if (!activeHabitMenuContext) return;
          const { habitId } = activeHabitMenuContext;
          this.closeCustomHabitActionsMenu();
          if (action === 'edit') {
            this.editCustomHabit(habitId);
          } else if (action === 'toggle') {
            this.toggleCustomHabit(habitId);
          } else if (action === 'delete') {
            this.deleteCustomHabit(habitId);
          }
        },

        // MENÚ CONTEXTUAL (••• Y CLIC DERECHO) PARA CLASES DEL HORARIO
        openClassActionsMenu(event, dIdx, cIdx) {
          if (event) {
            event.stopPropagation();
            if (event.preventDefault) event.preventDefault();
          }
          const popover = document.getElementById('classActionMenuPopover');
          if (!popover) return false;

          if (!popover.classList.contains('hidden') && activeClassMenuContext && activeClassMenuContext.dIdx === dIdx && activeClassMenuContext.cIdx === cIdx && event && event.type === 'click') {
            this.closeClassActionsMenu();
            return false;
          }

          this.closeAllContextMenus();
          activeClassMenuContext = { dIdx, cIdx };

          this.positionPopoverMenu(popover, event);
          return false;
        },

        closeClassActionsMenu() {
          this.closeAllContextMenus();
        },

        triggerClassMenuAction(action) {
          if (!activeClassMenuContext) return;
          const { dIdx, cIdx } = activeClassMenuContext;
          this.closeClassActionsMenu();
          if (action === 'edit') {
            this.openEditClassScheduleModal(dIdx, cIdx);
          } else if (action === 'delete') {
            this.deleteClassFromSchedule(dIdx, cIdx);
          }
        },

        // MENÚ CONTEXTUAL (••• Y CLIC DERECHO) PARA ASIGNATURAS
        openSubjectActionsMenu(event, subjectName) {
          if (event) {
            event.stopPropagation();
            if (event.preventDefault) event.preventDefault();
          }
          const popover = document.getElementById('subjectActionMenuPopover');
          if (!popover) return false;

          if (!popover.classList.contains('hidden') && activeSubjectMenuContext && activeSubjectMenuContext.subjectName === subjectName && event && event.type === 'click') {
            this.closeSubjectActionsMenu();
            return false;
          }

          this.closeAllContextMenus();
          activeSubjectMenuContext = { subjectName };

          this.positionPopoverMenu(popover, event);
          return false;
        },

        closeSubjectActionsMenu() {
          this.closeAllContextMenus();
        },

        triggerSubjectMenuAction(action) {
          if (!activeSubjectMenuContext) return;
          const { subjectName } = activeSubjectMenuContext;
          this.closeSubjectActionsMenu();
          if (action === 'hours') {
            this.promptSetSubjectStudyHours(subjectName);
          } else if (action === 'stats') {
            this.openSubjectStudyStatsModal(subjectName);
          } else if (action === 'delete') {
            this.deleteSubjectPrompt(subjectName);
          }
        },

        // MENÚ CONTEXTUAL (CLIC DERECHO) PARA PESTAÑAS DE VENTANAS
        openWorkspaceTabContextMenu(event, wsId) {
          if (event) {
            event.stopPropagation();
            if (event.preventDefault) event.preventDefault();
          }
          const popover = document.getElementById('workspaceTabActionMenuPopover');
          if (!popover) return false;

          this.closeAllContextMenus();
          activeWorkspaceTabContext = { wsId };

          this.positionPopoverMenu(popover, event);
          return false;
        },

        closeWorkspaceTabActionsMenu() {
          this.closeAllContextMenus();
        },

        triggerWorkspaceTabMenuAction(action) {
          if (!activeWorkspaceTabContext) return;
          const { wsId } = activeWorkspaceTabContext;
          this.closeWorkspaceTabActionsMenu();
          if (!window.WorkspacesManager) return;
          const ws = window.WorkspacesManager.getWorkspaceById(wsId);
          if (!ws) return;

          if (action === 'rename') {
            this.showPrompt({
              title: 'Renombrar Ventana',
              message: 'Introduce el nuevo nombre para la ventana:',
              defaultValue: ws.name
            }).then(name => {
              if (name && name.trim()) {
                window.WorkspacesManager.renameWorkspace(wsId, name.trim());
              }
            });
          } else if (action === 'duplicate') {
            window.WorkspacesManager.duplicateWorkspace(wsId);
          } else if (action === 'reset') {
            if (window.GridEngine && window.GridEngine.resetToDefaultLayout) {
              window.GridEngine.resetToDefaultLayout();
            }
          } else if (action === 'delete') {
            this.showConfirm({
              title: 'Eliminar Ventana',
              message: '¿Estás seguro de que deseas eliminar la ventana "' + ws.name + '"?',
              confirmText: 'Eliminar',
              cancelText: 'Cancelar',
              isDanger: true
            }).then(confirmed => {
              if (confirmed) {
                window.WorkspacesManager.deleteWorkspace(wsId);
              }
            });
          }
        },

        selectFocusDay(dIdx) {
          state.ui.selectedFocusDay = dIdx;
          renderDailyHabits();
        },

        // DRAG AND DROP PARA REUBICAR NOTAS ENTRE SÍ O EN RAÍZ
        handleListDragStart(event, cat, id) {
          draggedItemData = { cat, id };
          event.dataTransfer.setData('text/plain', JSON.stringify({ cat, id }));
          event.dataTransfer.effectAllowed = 'move';
          const rootDropZone = document.getElementById('listRootDropZone');
          if (rootDropZone) rootDropZone.classList.remove('hidden');
        },

        handleListDragEnd(event) {
          draggedItemData = null;
          const rootDropZone = document.getElementById('listRootDropZone');
          if (rootDropZone) rootDropZone.classList.add('hidden');
          document.querySelectorAll('.drag-target-hover').forEach(el => el.classList.remove('drag-target-hover'));
        },

        handleListDragOver(event, cat, targetId) {
          if (!draggedItemData || draggedItemData.id === targetId) return;
          event.preventDefault();
          event.stopPropagation();
          event.dataTransfer.dropEffect = 'move';
          event.currentTarget.classList.add('drag-target-hover');
        },

        handleListDragLeave(event) {
          event.stopPropagation();
          event.currentTarget.classList.remove('drag-target-hover');
        },

        handleListDrop(event, cat, targetId) {
          event.preventDefault();
          event.stopPropagation();
          event.currentTarget.classList.remove('drag-target-hover');
          if (!draggedItemData) return;
          const { cat: srcCat, id: srcId } = draggedItemData;
          if (srcId === targetId) return;

          const sourceFound = findNodeAndParentInTree(state.lists[srcCat] || [], srcId);
          if (sourceFound && isDescendantOf(sourceFound.node, targetId)) {
            return this.showToast('No puedes soltar una nota dentro de sus propias subnotas.', 'warning');
          }

          activeMoveContext = { cat: srcCat, id: srcId };
          app.executeMoveItem(targetId);
          const rootDropZone = document.getElementById('listRootDropZone');
          if (rootDropZone) rootDropZone.classList.add('hidden');
        },

        // TOUCH DRAG & DROP PARA MÓVIL (MANTENER PULSADO Y ARRASTRAR)
        handleListTouchStart(event, cat, id) {
          if (event.target.tagName === 'BUTTON' || event.target.tagName === 'INPUT' || event.target.closest('button') || event.target.closest('input')) {
            return;
          }
          if (touchDragTimer) clearTimeout(touchDragTimer);
          const touch = event.touches[0];
          touchStartPos = { x: touch.clientX, y: touch.clientY };
          isTouchDragging = false;
          currentTouchTargetEl = null;

          touchDragTimer = setTimeout(() => {
            isTouchDragging = true;
            draggedItemData = { cat, id };
            const draggedCard = document.getElementById(`list-item-${id}`);
            if (draggedCard) {
              draggedCard.classList.add('ring-2', 'ring-theme-main', 'scale-[1.02]', 'shadow-2xl', 'opacity-80', 'transition-transform');
            }
            if (navigator.vibrate) {
              navigator.vibrate(40);
            }
            const rootDropZone = document.getElementById('listRootDropZone');
            if (rootDropZone) rootDropZone.classList.remove('hidden');
          }, 350);
        },

        handleListTouchMove(event) {
          if (!touchDragTimer && !isTouchDragging) return;
          const touch = event.touches[0];
          const dist = Math.hypot(touch.clientX - touchStartPos.x, touch.clientY - touchStartPos.y);

          // Si el usuario desliza antes de cumplir los 350ms, es scroll de pantalla habitual
          if (!isTouchDragging && dist > 10) {
            clearTimeout(touchDragTimer);
            touchDragTimer = null;
            return;
          }

          if (isTouchDragging) {
            event.preventDefault(); // Evitar scroll mientras se arrastra la nota
            const elementUnderFinger = document.elementFromPoint(touch.clientX, touch.clientY);
            const targetCard = elementUnderFinger ? elementUnderFinger.closest('[data-item-id]') : null;

            document.querySelectorAll('.drag-target-hover').forEach(el => el.classList.remove('drag-target-hover'));
            if (targetCard && targetCard.id !== `list-item-${draggedItemData?.id}`) {
              targetCard.classList.add('drag-target-hover');
              currentTouchTargetEl = targetCard;
            } else {
              currentTouchTargetEl = null;
            }
          }
        },

        handleListTouchEnd(event) {
          if (touchDragTimer) {
            clearTimeout(touchDragTimer);
            touchDragTimer = null;
          }
          if (!isTouchDragging) return;
          isTouchDragging = false;

          const draggedId = draggedItemData ? draggedItemData.id : null;
          const draggedCat = draggedItemData ? draggedItemData.cat : null;
          const draggedCard = draggedId ? document.getElementById(`list-item-${draggedId}`) : null;
          if (draggedCard) {
            draggedCard.classList.remove('ring-2', 'ring-theme-main', 'scale-[1.02]', 'shadow-2xl', 'opacity-80', 'transition-transform');
          }

          document.querySelectorAll('.drag-target-hover').forEach(el => el.classList.remove('drag-target-hover'));
          const rootDropZone = document.getElementById('listRootDropZone');
          if (rootDropZone) rootDropZone.classList.add('hidden');

          if (currentTouchTargetEl && draggedItemData) {
            const targetId = currentTouchTargetEl.getAttribute('data-item-id');
            if (targetId && targetId !== draggedId) {
              const sourceFound = findNodeAndParentInTree(state.lists[draggedCat] || [], draggedId);
              if (sourceFound && isDescendantOf(sourceFound.node, targetId)) {
                draggedItemData = null;
                currentTouchTargetEl = null;
                return this.showToast('No puedes soltar una nota dentro de sus propias subnotas.', 'warning');
              }
              activeMoveContext = { cat: draggedCat, id: draggedId };
              this.executeMoveItem(targetId);
            }
          }
          draggedItemData = null;
          currentTouchTargetEl = null;
        },

        handleRootDragOver(event) {
          event.preventDefault();
          event.dataTransfer.dropEffect = 'move';
          event.currentTarget.classList.add('border-cyan-400', 'bg-cyan-900/40');
        },

        handleRootDragLeave(event) {
          event.currentTarget.classList.remove('border-cyan-400', 'bg-cyan-900/40');
        },

        handleRootDrop(event) {
          event.preventDefault();
          event.currentTarget.classList.remove('border-cyan-400', 'bg-cyan-900/40');
          if (!draggedItemData) return;
          activeMoveContext = { cat: draggedItemData.cat, id: draggedItemData.id };
          app.executeMoveItem('root');
          const rootDropZone = document.getElementById('listRootDropZone');
          if (rootDropZone) rootDropZone.classList.add('hidden');
        },

        // ========================================================
        // SELECCIÓN MÚLTIPLE Y EDICIÓN MASIVA DE NOTAS / ENTREGAS
        // ========================================================
        handleItemCheckboxToggle(id, event) {
          if (event && event.stopPropagation) event.stopPropagation();
          
          const isShift = event && event.shiftKey;
          if (isShift && lastSelectedId && visibleListItemIds.includes(lastSelectedId) && visibleListItemIds.includes(id)) {
            const idx1 = visibleListItemIds.indexOf(lastSelectedId);
            const idx2 = visibleListItemIds.indexOf(id);
            const start = Math.min(idx1, idx2);
            const end = Math.max(idx1, idx2);
            for (let i = start; i <= end; i++) {
              selectedListItemIds.add(visibleListItemIds[i]);
            }
            lastSelectedId = id;
            selectionModeActive = true;
          } else {
            if (selectedListItemIds.has(id)) {
              selectedListItemIds.delete(id);
            } else {
              selectedListItemIds.add(id);
              lastSelectedId = id;
            }
          }

          if (selectedListItemIds.size > 0) {
            selectionModeActive = true;
          }
          updateBulkToolbar();
          renderListsTree();
        },

        isSelectionModeActive() {
          return selectionModeActive || selectedListItemIds.size > 0;
        },

        toggleSelectMode(forceState) {
          if (typeof forceState === 'boolean') {
            selectionModeActive = forceState;
          } else {
            selectionModeActive = !selectionModeActive;
          }
          if (!selectionModeActive) {
            selectedListItemIds.clear();
            lastSelectedId = null;
          }
          updateBulkToolbar();
          renderListsTree();
        },

        selectAllListItems() {
          visibleListItemIds.forEach(id => selectedListItemIds.add(id));
          if (selectedListItemIds.size > 0) selectionModeActive = true;
          updateBulkToolbar();
          renderListsTree();
        },

        clearListSelection() {
          selectedListItemIds.clear();
          lastSelectedId = null;
          selectionModeActive = false;
          updateBulkToolbar();
          renderListsTree();
        },

        bulkToggleStatus() {
          if (selectedListItemIds.size === 0) return;
          const cat = state.ui.listTab || 'entregas';
          const list = state.lists[cat] || [];
          
          let hasPending = false;
          selectedListItemIds.forEach(id => {
            const found = findNodeAndParentInTree(list, id);
            if (found) {
              const isDone = found.node.status === 'done' || found.node.done;
              if (!isDone) hasPending = true;
            }
          });

          const newStatus = hasPending ? 'done' : 'pending';
          const newDone = hasPending;

          pushUndo(`Cambiar estado de ${selectedListItemIds.size} elementos`);
          selectedListItemIds.forEach(id => {
            const found = findNodeAndParentInTree(list, id);
            if (found) {
              found.node.status = newStatus;
              found.node.done = newDone;
            }
          });

          renderListsTree();
          renderMilestoneWidget();
          saveState();
          this.showToast(`${selectedListItemIds.size} notas marcadas como ${newStatus === 'done' ? 'completadas ✅' : 'pendientes ⬜'}.`, 'emerald');
        },

        bulkTogglePin() {
          if (selectedListItemIds.size === 0) return;
          const cat = state.ui.listTab || 'entregas';
          const list = state.lists[cat] || [];

          let hasUnpinned = false;
          selectedListItemIds.forEach(id => {
            const found = findNodeAndParentInTree(list, id);
            if (found && !found.node.pinned) hasUnpinned = true;
          });

          const newPinned = hasUnpinned;
          pushUndo(`${newPinned ? 'Fijar' : 'Desfijar'} ${selectedListItemIds.size} elementos`);
          selectedListItemIds.forEach(id => {
            const found = findNodeAndParentInTree(list, id);
            if (found) {
              found.node.pinned = newPinned;
            }
          });

          renderListsTree();
          saveState();
          this.showToast(`${selectedListItemIds.size} notas ${newPinned ? 'fijadas 📌' : 'desfijadas'}.`, 'amber');
        },

        async bulkDelete() {
          const count = selectedListItemIds.size;
          if (count === 0) return;
          const cat = state.ui.listTab || 'entregas';

          const confirmed = await this.showConfirm({
            title: 'Eliminar Notas Seleccionadas',
            message: `¿Estás seguro de que deseas eliminar permanentemente las ${count} notas seleccionadas?\n\nEsta acción se puede deshacer de inmediato con Ctrl+Z o el botón Deshacer.`,
            confirmText: 'Eliminar',
            cancelText: 'Cancelar',
            isDanger: true
          });
          if (!confirmed) return;

          pushUndo(`Eliminar ${count} notas`);
          state.lists[cat] = removeNodesByIdsFromTree(state.lists[cat] || [], selectedListItemIds);

          selectedListItemIds.clear();
          lastSelectedId = null;
          selectionModeActive = false;
          updateBulkToolbar();

          showUndoToast(`${count} notas eliminadas.`);
          renderListsTree();
          renderMilestoneWidget();
          saveState();
        },

        openBulkEditModal() {
          const count = selectedListItemIds.size;
          if (count === 0) return this.showToast('Selecciona primero al menos una nota.', 'amber');

          const cat = state.ui.listTab || 'entregas';
          const list = state.lists[cat] || [];

          document.getElementById('modalBulkEditCount').textContent = count;
          document.getElementById('bulkApplyDate').checked = false;
          document.getElementById('bulkClearDate').checked = false;
          document.getElementById('bulkDateInput').value = '';
          document.getElementById('bulkDateFieldBox').classList.add('opacity-40');

          document.getElementById('bulkApplyTime').checked = false;
          document.getElementById('bulkClearTime').checked = false;
          document.getElementById('bulkTimeInput').value = '';
          document.getElementById('bulkTimeFieldBox').classList.add('opacity-40');

          document.getElementById('bulkApplyMove').checked = false;
          document.getElementById('bulkMoveFieldBox').classList.add('opacity-40');

          document.getElementById('bulkApplyPin').checked = false;
          document.getElementById('bulkPinFieldBox').classList.add('opacity-40');

          document.getElementById('bulkApplyStatus').checked = false;
          document.getElementById('bulkStatusFieldBox').classList.add('opacity-40');

          // Población de carpetas de destino (excluyendo seleccionadas para evitar ciclos)
          const destSelect = document.getElementById('bulkDestinationSelect');
          if (destSelect) {
            let opts = '<option value="__root__">📁 Nivel Principal (Raíz)</option>';
            function scanContainers(nodes, indent = '') {
              nodes.forEach(n => {
                if (n.isContainer && !selectedListItemIds.has(n.id)) {
                  opts += `<option value="${n.id}">${indent}📁 ${escapeHtml(n.title)}</option>`;
                  if (Array.isArray(n.children)) scanContainers(n.children, indent + '  ');
                }
              });
            }
            scanContainers(list);
            destSelect.innerHTML = opts;
          }

          this.openModal('modalBulkEditListItems');
        },

        applyBulkEdit() {
          const count = selectedListItemIds.size;
          if (count === 0) {
            this.closeModal('modalBulkEditListItems');
            return;
          }
          const cat = state.ui.listTab || 'entregas';
          const list = state.lists[cat] || [];

          const applyDate = document.getElementById('bulkApplyDate').checked;
          const clearDate = document.getElementById('bulkClearDate').checked;
          const dateVal = clearDate ? null : (document.getElementById('bulkDateInput').value.trim() || null);

          const applyTime = document.getElementById('bulkApplyTime').checked;
          const clearTime = document.getElementById('bulkClearTime').checked;
          const timeVal = clearTime ? null : (document.getElementById('bulkTimeInput').value.trim() || null);

          const applyMove = document.getElementById('bulkApplyMove').checked;
          const targetDestId = document.getElementById('bulkDestinationSelect').value;

          const applyPin = document.getElementById('bulkApplyPin').checked;
          const pinVal = document.getElementById('bulkPinSelect').value === 'pin';

          const applyStatus = document.getElementById('bulkApplyStatus').checked;
          const statusVal = document.getElementById('bulkStatusSelect').value;

          if (!applyDate && !applyTime && !applyMove && !applyPin && !applyStatus) {
            return this.showToast('No has marcado ninguna casilla para modificar.', 'amber');
          }

          pushUndo(`Edición masiva de ${count} notas`);

          const itemsToMove = [];
          selectedListItemIds.forEach(id => {
            const found = findNodeAndParentInTree(list, id);
            if (found) {
              if (applyDate) found.node.date = dateVal;
              if (applyTime) found.node.time = timeVal;
              if (applyPin) found.node.pinned = pinVal;
              if (applyStatus) {
                found.node.status = statusVal;
                found.node.done = (statusVal === 'done');
              }
              if (applyMove) {
                itemsToMove.push({ found, node: found.node });
              }
            }
          });

          // Reubicación de elementos seleccionados si se marcó mover
          if (applyMove && itemsToMove.length > 0) {
            itemsToMove.forEach(({ found }) => {
              found.array.splice(found.index, 1);
            });
            if (targetDestId === '__root__') {
              itemsToMove.forEach(({ node }) => list.push(node));
            } else {
              const destFound = findNodeAndParentInTree(list, targetDestId);
              if (destFound && destFound.node) {
                if (!Array.isArray(destFound.node.children)) destFound.node.children = [];
                itemsToMove.forEach(({ node }) => destFound.node.children.push(node));
              } else {
                itemsToMove.forEach(({ node }) => list.push(node));
              }
            }
          }

          this.closeModal('modalBulkEditListItems');
          selectedListItemIds.clear();
          lastSelectedId = null;
          selectionModeActive = false;
          updateBulkToolbar();
          renderListsTree();
          renderMilestoneWidget();
          saveState();
          this.showToast(`Edición masiva aplicada a ${count} notas.`, 'emerald');
        },

        // CALENDARIO INTERACTIVO INTEGRADO (CUSTOM DATE PICKER)
        openCustomDatePicker(inputElement) {
          if (!inputElement) return;
          if (typeof inputElement === 'string') inputElement = document.getElementById(inputElement);
          if (!inputElement) return;
          datePickerState.activeInput = inputElement;
          let initDate = new Date();
          if (inputElement.value) {
            const parts = inputElement.value.split('-');
            if (parts.length === 3) {
              initDate = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
              datePickerState.selectedDateStr = inputElement.value;
            } else {
              datePickerState.selectedDateStr = '';
            }
          } else {
            datePickerState.selectedDateStr = '';
          }
          datePickerState.year = initDate.getFullYear();
          datePickerState.month = initDate.getMonth();
          app.renderCustomDatePicker();
          document.getElementById('customDatePickerModal').classList.remove('hidden');
        },

        renderCustomDatePicker() {
          const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
          const titleEl = document.getElementById('datePickerMonthYear');
          if (titleEl) titleEl.textContent = `${monthNames[datePickerState.month]} ${datePickerState.year}`;

          const firstDay = (new Date(datePickerState.year, datePickerState.month, 1).getDay() + 6) % 7;
          const daysInMonth = new Date(datePickerState.year, datePickerState.month + 1, 0).getDate();

          const today = new Date();
          const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

          const gridEl = document.getElementById('datePickerDaysGrid');
          if (!gridEl) return;

          let html = '';
          for (let i = 0; i < firstDay; i++) {
            html += `<div></div>`;
          }

          for (let d = 1; d <= daysInMonth; d++) {
            const dStr = `${datePickerState.year}-${String(datePickerState.month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const isSelected = dStr === datePickerState.selectedDateStr;
            const isToday = dStr === todayStr;

            let cls = 'w-7 h-7 mx-auto rounded-lg flex items-center justify-center font-semibold text-xs transition cursor-pointer ';
            if (isSelected) {
              cls += 'bg-theme-main text-white font-bold shadow-md';
            } else if (isToday) {
              cls += 'border border-theme text-theme-main dark:text-blue-400 hover:bg-theme-main/10 font-bold';
            } else {
              cls += 'hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200';
            }

            html += `<button type="button" onclick="app.datePickerSelectDay('${dStr}')" class="${cls}">${d}</button>`;
          }

          gridEl.innerHTML = html;
        },

        datePickerPrevMonth() {
          datePickerState.month--;
          if (datePickerState.month < 0) {
            datePickerState.month = 11;
            datePickerState.year--;
          }
          app.renderCustomDatePicker();
        },

        datePickerNextMonth() {
          datePickerState.month++;
          if (datePickerState.month > 11) {
            datePickerState.month = 0;
            datePickerState.year++;
          }
          app.renderCustomDatePicker();
        },

        datePickerSelectDay(dateStr) {
          if (datePickerState.activeInput) {
            datePickerState.activeInput.value = dateStr;
            datePickerState.activeInput.dispatchEvent(new Event('change', { bubbles: true }));
            datePickerState.activeInput.dispatchEvent(new Event('input', { bubbles: true }));
          }
          app.closeDatePicker();
        },

        datePickerSetQuick(preset) {
          const d = new Date();
          if (preset === 'mon') {
            const day = (d.getDay() + 6) % 7;
            const daysUntilMon = day === 0 ? 7 : (7 - day);
            d.setDate(d.getDate() + daysUntilMon);
          } else if (typeof preset === 'number') {
            d.setDate(d.getDate() + preset);
          }
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, '0');
          const dayStr = String(d.getDate()).padStart(2, '0');
          app.datePickerSelectDay(`${y}-${m}-${dayStr}`);
        },

        datePickerClear() {
          if (datePickerState.activeInput) {
            datePickerState.activeInput.value = '';
            datePickerState.activeInput.dispatchEvent(new Event('change', { bubbles: true }));
            datePickerState.activeInput.dispatchEvent(new Event('input', { bubbles: true }));
          }
          app.closeDatePicker();
        },

        closeDatePicker() {
          const modal = document.getElementById('customDatePickerModal');
          if (modal) modal.classList.add('hidden');
          datePickerState.activeInput = null;
        },

        openCalendarImportModal() { document.getElementById('calendarImportModal').classList.remove('hidden'); },
        handleIcsFileUpload(event) {
          const file = event.target.files[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = (e) => {
            const text = e.target.result;
            const matches = text.match(/BEGIN:VEVENT([\s\S]*?)END:VEVENT/g) || [];
            let count = 0;
            matches.forEach(m => {
              const summaryMatch = m.match(/SUMMARY:(.*)/);
              const dtstartMatch = m.match(/DTSTART(?:;VALUE=DATE)?:(\d{8})/);
              if (summaryMatch) {
                const title = summaryMatch[1].trim();
                let dateStr = null;
                if (dtstartMatch) {
                  const raw = dtstartMatch[1];
                  dateStr = `${raw.slice(0,4)}-${raw.slice(4,6)}-${raw.slice(6,8)}`;
                }
                state.lists.entregas.push({
                  id: 'ics_' + Date.now() + Math.random(),
                  title,
                  date: dateStr,
                  status: 'pending',
                  children: []
                });
                count++;
              }
            });
            app.closeModal('calendarImportModal');
            renderListsTree();
            saveState();
            app.showToast(`¡Se han importado ${count} eventos de Calendar a la lista de entregas!`, 'success');
          };
          reader.readAsText(file);
        },

        // Tab 2 Metas y Horario
        autoSaveGoalSetting() {
          const g = state.goalsTemplate;
          const gymEl = document.getElementById('goalGymInput');
          if (gymEl && gymEl.value !== '') {
            const v = parseInt(gymEl.value, 10);
            if (!isNaN(v) && v > 0) g.gymSessions = v;
          }
          const runEl = document.getElementById('goalRunKmInput');
          if (runEl && runEl.value !== '') {
            const v = parseFloat(runEl.value);
            if (!isNaN(v) && v >= 0) g.runKm = v;
          }
          const nutriPhaseEl = document.getElementById('goalNutriPhase');
          if (nutriPhaseEl) g.nutri.phase = nutriPhaseEl.value;
          const nutriKcalEl = document.getElementById('goalNutriKcal');
          if (nutriKcalEl && nutriKcalEl.value !== '') {
            const v = parseInt(nutriKcalEl.value, 10);
            if (!isNaN(v) && v >= 500) g.nutri.kcal = v;
          }
          const nutriMarginEl = document.getElementById('goalNutriMargin');
          if (nutriMarginEl && nutriMarginEl.value !== '') {
            const v = parseInt(nutriMarginEl.value, 10);
            if (!isNaN(v) && v >= 10) g.nutri.margin = v;
          }
          const nutriDaysEl = document.getElementById('goalNutriDays');
          if (nutriDaysEl && nutriDaysEl.value !== '') {
            const v = parseInt(nutriDaysEl.value, 10);
            if (!isNaN(v) && v >= 1) g.nutri.minDays = v;
          }
          const attEl = document.getElementById('goalAttPercentInput');
          if (attEl && attEl.value !== '') {
            const v = parseInt(attEl.value, 10);
            if (!isNaN(v) && v >= 0) g.academic.attMinPercent = v;
          }

          const curWk = getActiveWeek();
          if (curWk) {
            curWk.goals = JSON.parse(JSON.stringify(g));
            if (Array.isArray(curWk.days)) {
              curWk.days.forEach(d => {
                if (d.nutritionKcal != null) {
                  const ev = evalNutritionStatus(d.nutritionKcal, g.nutri.kcal, g.nutri.phase, g.nutri.margin);
                  d.nutrition = ev.status === 'pending' ? 'pending' : (ev.score >= 0.8 ? 'success' : 'fail');
                  d.nutritionScore = ev.score;
                }
              });
            }
          }
          renderHeaderAndKPIs();
          saveState(true);
        },
        saveGoalsSettings(showAlert = true) {
          this.autoSaveGoalSetting();
          renderApp();
          saveState();
          if (showAlert) this.showToast('¡Metas actualizadas!', 'success');
        },
        setStudyPlanDay(dayIdx, val) {
          const w = getActiveWeek();
          w.studyHoursPlan[dayIdx] = parseFloat(val) || 0;
          if (state.viewingWeek === state.currentWeek) state.goalsTemplate.studyHoursDaily[dayIdx] = w.studyHoursPlan[dayIdx];
          renderApp();
          saveState();
        },
        async distributeStudyEvenly() {
          const w = getActiveWeek();
          const totalStr = await this.showPrompt({
            title: 'Distribución de Estudio',
            message: 'Introduce las horas totales de estudio para la semana laboral (L-V):',
            defaultValue: '15.0',
            placeholder: '15.0'
          });
          if (totalStr === null) return;
          const total = parseFloat(totalStr);
          if (isNaN(total) || total <= 0) return;
          const perDay = parseFloat((total / 5).toFixed(1));
          w.studyHoursPlan = [perDay, perDay, perDay, perDay, perDay, 0, 0];
          if (state.viewingWeek === state.currentWeek) state.goalsTemplate.studyHoursDaily = [...w.studyHoursPlan];
          renderApp();
          saveState();
          this.showToast(`Plan de estudio ajustado a ${perDay}h al día (L-V).`, 'success');
        },

        // NUEVO: Modal Añadir o Editar Clase en Horario con chips y tipo General [G]
        openAddClassScheduleModal(dayIdx) {
          activeScheduleAddContext = { dayIdx, classType: 'T' };
          document.getElementById('modalAddClassTitle').innerHTML = `<span>🏫</span> Añadir Clase al ${DAY_FULL[dayIdx]}`;
          document.getElementById('newClassSubjectInput').value = '';
          document.getElementById('newClassTimeInput').value = '';
          app.selectClassTypeRadio('T');

          // Chips de asignaturas existentes recomendadas
          const existing = Object.keys(state.subjectRules);
          document.getElementById('recommendedSubjectsChips').innerHTML = existing.map(sub => `
            <button type="button" onclick="app.fillNewClassSubject('${sub.replace(/'/g, "\\'")}')" class="px-2 py-0.5 rounded-lg subpanel-bg border hover:border-cyan-400 text-xs font-semibold text-cyan-300">${sub}</button>
          `).join('');

          const submitBtn = document.getElementById('modalAddClassSubmitBtn');
          if (submitBtn) submitBtn.textContent = 'Añadir al Horario';
          document.getElementById('modalAddClassSchedule').classList.remove('hidden');
        },

        openEditClassScheduleModal(dayIdx, classIdx) {
          const cls = state.scheduleTemplate[dayIdx] && state.scheduleTemplate[dayIdx][classIdx];
          if (!cls) return;
          activeScheduleAddContext = { dayIdx, classIdx, classType: cls.type || 'T' };
          document.getElementById('modalAddClassTitle').innerHTML = `<svg class="w-4 h-4 text-theme-main inline-block mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> <span>Editar Clase del ${DAY_FULL[dayIdx]}</span>`;
          document.getElementById('newClassSubjectInput').value = cls.subject || '';
          document.getElementById('newClassTimeInput').value = cls.time || '';
          app.selectClassTypeRadio(cls.type || 'T');

          const existing = Object.keys(state.subjectRules);
          document.getElementById('recommendedSubjectsChips').innerHTML = existing.map(sub => `
            <button type="button" onclick="app.fillNewClassSubject('${sub.replace(/'/g, "\\'")}')" class="px-2 py-0.5 rounded-lg subpanel-bg border hover:border-cyan-400 text-xs font-semibold text-cyan-300">${sub}</button>
          `).join('');

          const submitBtn = document.getElementById('modalAddClassSubmitBtn');
          if (submitBtn) submitBtn.textContent = 'Guardar Cambios';
          document.getElementById('modalAddClassSchedule').classList.remove('hidden');
        },

        fillNewClassSubject(sub) {
          document.getElementById('newClassSubjectInput').value = sub;
        },

        selectClassTypeRadio(type) {
          if (!activeScheduleAddContext) return;
          activeScheduleAddContext.classType = type;
          ['T', 'P', 'G'].forEach(t => {
            const btn = document.getElementById(`classTypeBtn_${t}`);
            if (btn) {
              if (t === type) {
                btn.className = 'p-2 rounded-xl border text-center font-bold bg-theme-main text-white border-theme shadow-md';
              } else {
                btn.className = 'p-2 rounded-xl border text-center font-bold subpanel-bg text-slate-400 border-slate-700';
              }
            }
          });
        },

        confirmAddClassSchedule() {
          if (!activeScheduleAddContext) return;
          const sub = document.getElementById('newClassSubjectInput').value.trim();
          if (!sub) return this.showToast('Introduce el nombre de la asignatura.', 'error');
          const time = document.getElementById('newClassTimeInput').value.trim();
          const { dayIdx, classIdx, classType } = activeScheduleAddContext;

          pushUndo('Modificar horario de clases');
          if (classIdx !== undefined) {
            // Edición de clase existente
            const oldClass = state.scheduleTemplate[dayIdx][classIdx];
            state.scheduleTemplate[dayIdx][classIdx] = {
              id: oldClass ? oldClass.id : ('c_' + Date.now()),
              subject: sub,
              type: classType || 'T',
              time: time || ''
            };
            if (!state.subjectRules[sub]) {
              state.subjectRules[sub] = { ruleType: 'percent', minPercent: 85, fixedMaxFails: 3 };
            }
          } else {
            // Nueva clase
            const newClass = {
              id: 'c_' + Date.now(),
              subject: sub,
              type: classType || 'T',
              time: time || ''
            };
            state.scheduleTemplate[dayIdx].push(newClass);
            if (!state.subjectRules[sub]) {
              state.subjectRules[sub] = { ruleType: 'percent', minPercent: 85, fixedMaxFails: 3 };
            }

            // Si estamos en la semana actual, agregar la ranura de asistencia a este día
            if (state.viewingWeek === state.currentWeek) {
              getActiveWeek().days[dayIdx].attendance.push({
                subject: newClass.subject,
                type: newClass.type,
                status: 'pending'
              });
            }
          }

          app.closeModal('modalAddClassSchedule');
          renderApp();
          saveState();
        },

        deleteClassFromSchedule(dayIdx, classIdx) {
          pushUndo('Eliminar clase del horario');
          state.scheduleTemplate[dayIdx].splice(classIdx, 1);
          renderApp();
          saveState();
        },

        addNewSubjectPrompt() {
          activeSubjectPromptContext = { mode: 'add', oldName: '' };
          document.getElementById('modalSubjectPromptTitle').innerHTML = `<svg class="w-4 h-4 text-theme-main inline-block mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg> <span>Nueva Asignatura</span>`;
          document.getElementById('modalSubjectPromptLabel').textContent = 'Nombre de la nueva asignatura a registrar:';
          const inp = document.getElementById('modalSubjectPromptInput');
          inp.value = '';
          document.getElementById('modalSubjectPrompt').classList.remove('hidden');
          setTimeout(() => inp.focus(), 50);
        },

        renameSubjectPrompt(oldName) {
          activeSubjectPromptContext = { mode: 'rename', oldName };
          document.getElementById('modalSubjectPromptTitle').innerHTML = `<svg class="w-4 h-4 text-theme-main inline-block mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> <span>Renombrar Asignatura</span>`;
          document.getElementById('modalSubjectPromptLabel').textContent = `Renombrar "${oldName}" a:`;
          const inp = document.getElementById('modalSubjectPromptInput');
          inp.value = oldName;
          document.getElementById('modalSubjectPrompt').classList.remove('hidden');
          setTimeout(() => { inp.focus(); inp.select(); }, 50);
        },

        confirmSubjectPrompt() {
          if (!activeSubjectPromptContext) return;
          const { mode, oldName } = activeSubjectPromptContext;
          const inputVal = document.getElementById('modalSubjectPromptInput').value.trim();
          if (!inputVal) return;

          pushUndo(mode === 'add' ? 'Añadir asignatura' : 'Renombrar asignatura');
          if (mode === 'add') {
            if (state.subjectRules[inputVal]) {
              this.showToast(`La asignatura "${inputVal}" ya existe en la plantilla.`, 'warning');
              return;
            }
            state.subjectRules[inputVal] = { ruleType: 'percent', minPercent: 85, fixedMaxFails: 3 };
          } else if (mode === 'rename') {
            if (inputVal !== oldName) {
              state.subjectRules[inputVal] = state.subjectRules[oldName];
              delete state.subjectRules[oldName];
              state.scheduleTemplate.forEach(day => day.forEach(c => { if (c.subject === oldName) c.subject = inputVal; }));
              Object.values(state.weeks).forEach(wk => wk.days.forEach(d => (d.attendance || []).forEach(c => { if (c.subject === oldName) c.subject = inputVal; })));
              if (state.pomo && state.pomo.selectedSubject === oldName) {
                state.pomo.selectedSubject = inputVal;
              }
            }
          }

          app.closeModal('modalSubjectPrompt');
          renderApp();
          saveState();
        },

        async deleteSubjectPrompt(sub) {
          const ok = await this.showConfirm({
            title: 'Eliminar asignatura',
            message: `¿Estás seguro de que deseas eliminar completamente la asignatura "${sub}" de la plantilla?\n\nEsta acción borrará:\n• Sus reglas académicas y tarjeta de colchón de faltas.\n• Todas sus clases registradas en el horario semanal.\n• Los registros pendientes de asistencia de esta materia en la semana actual.`,
            confirmText: 'Eliminar',
            isDanger: true
          });
          if (!ok) return;

          pushUndo('Eliminar asignatura');
          // 1. Eliminar regla académica
          delete state.subjectRules[sub];

          // 2. Eliminar todas las clases de esta asignatura en el horario semanal de la plantilla
          if (Array.isArray(state.scheduleTemplate)) {
            state.scheduleTemplate.forEach(day => {
              if (Array.isArray(day)) {
                for (let i = day.length - 1; i >= 0; i--) {
                  if (day[i] && day[i].subject === sub) {
                    day.splice(i, 1);
                  }
                }
              }
            });
          }

          // 3. Si Pomodoro tenía seleccionada esta asignatura, volver a "Estudio General"
          if (state.pomo && state.pomo.selectedSubject === sub) {
            state.pomo.selectedSubject = 'Estudio General';
          }

          // 4. Limpiar slots de asistencia pendientes en la semana actual
          const activeWk = getActiveWeek();
          if (activeWk && Array.isArray(activeWk.days)) {
            activeWk.days.forEach(d => {
              if (Array.isArray(d.attendance)) {
                d.attendance = d.attendance.filter(c => c.subject !== sub || c.status !== 'pending');
              }
            });
          }

          renderApp();
          saveState();
          this.showToast(`Asignatura "${sub}" eliminada.`, 'info');
        },
        setSubjectRuleType(sub, type) { state.subjectRules[sub].ruleType = type; renderApp(); saveState(); },
        setSubjectRuleValue(sub, val) {
          const num = parseInt(val, 10) || 0;
          if (state.subjectRules[sub].ruleType === 'percent') state.subjectRules[sub].minPercent = num;
          else state.subjectRules[sub].fixedMaxFails = num;
          renderApp();
          saveState();
        },
        setSubjectManualTotalClasses(sub, val) {
          const num = Math.max(1, parseInt(val, 10) || 1);
          if (!state.subjectRules[sub]) state.subjectRules[sub] = { ruleType: 'percent', minPercent: 85, fixedMaxFails: 3 };
          state.subjectRules[sub].manualTotalClasses = num;
          renderApp();
          saveState();
          this.showToast(`Total de clases para ${sub} fijado en ${num}.`, 'success');
        },
        resetSubjectManualTotalClasses(sub) {
          if (state.subjectRules[sub]) delete state.subjectRules[sub].manualTotalClasses;
          renderApp();
          saveState();
          this.showToast(`Cálculo de clases para ${sub} restablecido a automático.`, 'info');
        },
        setSubjectManualAbsentTotal(sub, val) {
          const num = Math.max(0, parseInt(val, 10) || 0);
          if (!state.subjectRules[sub]) state.subjectRules[sub] = { ruleType: 'percent', minPercent: 85, fixedMaxFails: 3 };
          state.subjectRules[sub].manualAbsentTotal = num;
          renderApp();
          saveState();
          this.showToast(`Faltas acumuladas para ${sub} fijadas en ${num}.`, 'success');
        },
        resetSubjectManualAbsentTotal(sub) {
          if (state.subjectRules[sub]) delete state.subjectRules[sub].manualAbsentTotal;
          renderApp();
          saveState();
          this.showToast(`Cómputo de faltas para ${sub} restablecido a semanas.`, 'info');
        },

        // Tab 3 Finanzas
        setFinanceMode(mode) {
          state.financeSettings.mode = mode;
          getActiveWeek().budgetLimit = mode === 'auto' ? calculateAutoWeeklyBudget() : state.financeSettings.manualBudget;
          renderApp();
          saveState();
        },
        saveFinanceSettings() {
          const s = state.financeSettings;
          s.manualBudget = parseFloat(document.getElementById('tab3ManualBudgetInput').value) || 60;
          s.monthlyIncome = parseFloat(document.getElementById('tab3MonthlyIncome').value) || 0;
          s.monthlySavingsGoal = parseFloat(document.getElementById('tab3MonthlySavings').value) || 0;
          s.antThreshold = parseFloat(document.getElementById('tab3AntThreshold').value) || 5.0;
          getActiveWeek().budgetLimit = s.mode === 'auto' ? calculateAutoWeeklyBudget() : s.manualBudget;
          renderApp();
          saveState();
          this.showToast('¡Parámetros financieros guardados!', 'success');
        },

        // GESTIÓN DE CATEGORÍAS DE GASTOS
        ensureCategoryIds() {
          if (!state.financeSettings || !Array.isArray(state.financeSettings.customCategories)) {
            state.financeSettings.customCategories = [
              { id: 'cat_super', name: 'Súper', emoji: '🛒' },
              { id: 'cat_cafe', name: 'Café', emoji: '☕' },
              { id: 'cat_ocio', name: 'Ocio', emoji: '🍻' },
              { id: 'cat_otros', name: 'Otros', emoji: '📦' }
            ];
          }
          state.financeSettings.customCategories.forEach((c, idx) => {
            if (!c.id) {
              c.id = 'cat_' + idx + '_' + Math.random().toString(36).substr(2, 6);
            }
          });
        },

        // --- GESTIÓN DE LA BIBLIOTECA DE ICONOS VECTORIALES SVG ---
        currentIconTarget: null, // 'habit' | 'category'
        currentIconCategoryFilter: 'all',

        openIconPicker(targetType = 'habit') {
          this.currentIconTarget = targetType;
          this.currentIconCategoryFilter = 'all';
          const searchInp = document.getElementById('iconSearchInput');
          if (searchInp) searchInp.value = '';
          this.updateIconCategoryFilterUI();
          this.renderIconGrid();
          this.openModal('modalIconPicker');
          setTimeout(() => searchInp && searchInp.focus(), 60);
        },

        setIconCategoryFilter(cat) {
          this.currentIconCategoryFilter = cat;
          this.updateIconCategoryFilterUI();
          this.renderIconGrid();
        },

        updateIconCategoryFilterUI() {
          const btns = document.querySelectorAll('.icon-cat-btn');
          btns.forEach(b => {
            const c = b.getAttribute('data-cat');
            if (c === this.currentIconCategoryFilter) {
              b.className = 'icon-cat-btn px-2.5 py-1 rounded-lg font-bold bg-theme-main text-white shadow-xs';
            } else {
              b.className = 'icon-cat-btn px-2.5 py-1 rounded-lg font-semibold subpanel-bg border text-stone-600 dark:text-slate-300 hover:border-theme transition';
            }
          });
        },

        filterIcons() {
          this.renderIconGrid();
        },

        renderIconGrid() {
          const container = document.getElementById('iconGridContainer');
          if (!container) return;

          const query = (document.getElementById('iconSearchInput')?.value || '').toLowerCase().trim();
          const cat = this.currentIconCategoryFilter;

          const entries = Object.entries(SVG_ICON_LIBRARY).filter(([id, data]) => {
            if (cat !== 'all' && data.cat !== cat) return false;
            if (!query) return true;
            const fullText = `${data.name} ${data.tags} ${id}`.toLowerCase();
            return fullText.includes(query);
          });

          if (entries.length === 0) {
            container.innerHTML = `<div class="col-span-full py-8 text-center text-slate-400 text-xs">No se encontraron iconos para "${escapeHtml(query)}"</div>`;
            return;
          }

          container.innerHTML = entries.map(([id, data]) => `
            <button type="button" onclick="app.selectIcon('${id}')" class="group flex flex-col items-center justify-center p-2 rounded-xl subpanel-bg border hover:border-theme-main hover:bg-theme-main/10 transition active:scale-95 text-center gap-1.5" title="${data.name}">
              <div class="w-8 h-8 rounded-lg flex items-center justify-center text-stone-700 dark:text-slate-200 group-hover:text-theme-main transition-colors">
                <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${data.svg}</svg>
              </div>
              <span class="text-[9px] font-bold text-stone-600 dark:text-slate-300 group-hover:text-theme-main truncate w-full block">${data.name.split('/')[0].trim()}</span>
            </button>
          `).join('');
        },

        selectIcon(iconId) {
          if (!SVG_ICON_LIBRARY[iconId]) return;
          const target = this.currentIconTarget;

          if (target === 'habit') {
            const iconInp = document.getElementById('habitIconInput');
            const preview = document.getElementById('habitIconPreview');
            if (iconInp) iconInp.value = iconId;
            if (preview) {
              preview.innerHTML = renderItemIcon(iconId, 'w-5 h-5 text-theme-main');
            }
          } else if (target === 'category') {
            const catIconInp = document.getElementById('manageCatIconInput');
            const preview = document.getElementById('manageCatIconPreview');
            if (catIconInp) catIconInp.value = iconId;
            if (preview) {
              preview.innerHTML = renderItemIcon(iconId, 'w-4 h-4 text-theme-main');
            }
          }

          this.closeModal('modalIconPicker');
          this.showToast(`Icono "${SVG_ICON_LIBRARY[iconId].name}" seleccionado`, 'info');
        },

        renderCategoryQuickIcons() {
          const row = document.getElementById('quickCategoryIconRow');
          if (!row) return;
          const recIcons = ['cart', 'coffee', 'beer', 'fuel', 'utensils', 'pill', 'home', 'book', 'tag', 'gift', 'smartphone', 'gamepad'];
          row.innerHTML = recIcons.map(id => {
            const it = SVG_ICON_LIBRARY[id];
            if (!it) return '';
            return `
              <button type="button" onclick="app.selectIcon('${id}')" class="p-1.5 rounded-lg subpanel-bg border hover:border-theme text-stone-700 dark:text-slate-300 hover:text-theme-main transition active:scale-95" title="${it.name}">
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${it.svg}</svg>
              </button>
            `;
          }).join('');
        },

        openManageCategoriesModal() {
          app.ensureCategoryIds();
          app.cancelCategoryEdit();
          app.renderCategoryQuickIcons();
          app.renderCategoriesManagerList();
          document.getElementById('modalManageCategories').classList.remove('hidden');
        },

        renderCategoriesManagerList() {
          app.ensureCategoryIds();
          const listContainer = document.getElementById('manageCategoriesList');
          if (!listContainer) return;

          const cats = state.financeSettings.customCategories;
          const usageMap = {};
          Object.values(state.weeks || {}).forEach(w => {
            if (w && Array.isArray(w.expenses)) {
              w.expenses.forEach(e => {
                const eCat = (e.category || '').trim();
                usageMap[eCat] = (usageMap[eCat] || 0) + 1;
              });
            }
          });

          if (cats.length === 0) {
            listContainer.innerHTML = `<span class="text-slate-400 text-xs block py-2 text-center">No hay categorías configuradas.</span>`;
            return;
          }

          listContainer.innerHTML = cats.map((c, idx) => {
            const formatted = `${c.emoji} ${c.name}`.trim();
            const count = (usageMap[formatted] || 0) + (usageMap[c.name] || 0);
            const isFirst = idx === 0;
            const isLast = idx === cats.length - 1;
            return `
              <div class="p-2.5 rounded-xl subpanel-bg border border-slate-800/80 hover:border-slate-700 flex items-center justify-between text-xs transition shadow-xs gap-2">
                <div class="flex items-center gap-2 min-w-0 flex-1">
                  <!-- Flechas para reordenar categorías -->
                  <div class="flex flex-col gap-0.5 shrink-0">
                    <button onclick="app.moveCategoryOrder('${c.id}', -1)" ${isFirst ? 'disabled class="opacity-20 cursor-not-allowed"' : 'class="hover:text-theme-main transition text-slate-400 active:scale-90"'} title="Mover arriba">
                      <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="18 15 12 9 6 15"/></svg>
                    </button>
                    <button onclick="app.moveCategoryOrder('${c.id}', 1)" ${isLast ? 'disabled class="opacity-20 cursor-not-allowed"' : 'class="hover:text-theme-main transition text-slate-400 active:scale-90"'} title="Mover abajo">
                      <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
                    </button>
                  </div>
                  <span class="w-8 h-8 rounded-lg subpanel-bg border border-theme/20 flex items-center justify-center text-theme-main shrink-0">
                    ${renderItemIcon(c.iconId || c.emoji || 'cart', 'w-4 h-4 text-theme-main')}
                  </span>
                  <div class="truncate">
                    <span class="font-bold text-white text-xs block truncate">${c.name}</span>
                    <span class="text-[10px] text-slate-400 font-mono">${count} compra${count === 1 ? '' : 's'}</span>
                  </div>
                </div>
                <div class="flex items-center gap-1.5 shrink-0">
                  <button onclick="app.editCategory('${c.id}')" class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg subpanel-bg border hover:border-cyan-400 text-slate-300 hover:text-cyan-300 font-semibold text-[11px] transition" title="Modificar nombre o emoji">
                    <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    <span>Editar</span>
                  </button>
                  <button onclick="app.deleteCategory('${c.id}')" class="px-2.5 py-1 rounded-lg subpanel-bg border hover:border-rose-400 text-slate-400 hover:text-rose-400 font-semibold text-[11px] transition" title="Eliminar categoría">✕</button>
                </div>
              </div>
            `;
          }).join('');
        },

        moveCategoryOrder(catId, dir) {
          app.ensureCategoryIds();
          const cats = state.financeSettings.customCategories;
          const idx = cats.findIndex(x => x.id === catId);
          if (idx === -1) return;
          const targetIdx = idx + dir;
          if (targetIdx < 0 || targetIdx >= cats.length) return;

          pushUndo('Reordenar categorías de gasto');
          const [moved] = cats.splice(idx, 1);
          cats.splice(targetIdx, 0, moved);

          app.renderCategoriesManagerList();
          renderQuickExpensesUI();
          if (state.activeTab === 3) renderTab3();
          saveState();
        },

        pickCategoryEmoji(emoji) {
          const input = document.getElementById('manageCatEmojiInput');
          if (input) input.value = emoji;
        },

        editCategory(catId) {
          app.ensureCategoryIds();
          const cat = state.financeSettings.customCategories.find(x => x.id === catId);
          if (!cat) return;

          document.getElementById('manageCatEditId').value = cat.id;
          const iconId = cat.iconId || (SVG_ICON_LIBRARY[cat.emoji] ? cat.emoji : 'cart');
          const catIconInp = document.getElementById('manageCatIconInput');
          if (catIconInp) catIconInp.value = iconId;
          const preview = document.getElementById('manageCatIconPreview');
          if (preview) {
            preview.innerHTML = renderItemIcon(cat.iconId || cat.emoji || 'cart', 'w-4 h-4 text-theme-main');
          }
          document.getElementById('manageCatEmojiInput').value = cat.emoji || '📦';
          document.getElementById('manageCatNameInput').value = cat.name || '';
          document.getElementById('catFormTitle').textContent = `Editar Categoría: "${cat.name}"`;
          document.getElementById('catSubmitBtn').textContent = 'Guardar';
          document.getElementById('catCancelEditBtn').classList.remove('hidden');
          document.getElementById('manageCatNameInput').focus();
        },

        cancelCategoryEdit() {
          document.getElementById('manageCatEditId').value = '';
          const catIconInp = document.getElementById('manageCatIconInput');
          if (catIconInp) catIconInp.value = 'cart';
          const preview = document.getElementById('manageCatIconPreview');
          if (preview) {
            preview.innerHTML = renderItemIcon('cart', 'w-4 h-4 text-theme-main');
          }
          document.getElementById('manageCatEmojiInput').value = '📦';
          document.getElementById('manageCatNameInput').value = '';
          document.getElementById('catFormTitle').textContent = 'Añadir Nueva Categoría';
          document.getElementById('catSubmitBtn').textContent = '+ Añadir';
          document.getElementById('catCancelEditBtn').classList.add('hidden');
        },

        saveCategory() {
          app.ensureCategoryIds();
          const editId = document.getElementById('manageCatEditId').value;
          const iconId = document.getElementById('manageCatIconInput')?.value || 'cart';
          const emoji = (document.getElementById('manageCatEmojiInput').value || '').trim() || '📦';
          const name = (document.getElementById('manageCatNameInput').value || '').trim();

          if (!name) {
            return this.showToast('Por favor introduce el nombre de la categoría.', 'error');
          }

          const cats = state.financeSettings.customCategories;

          if (editId) {
            const cat = cats.find(x => x.id === editId);
            if (!cat) return;

            const oldFormatted = `${cat.emoji} ${cat.name}`.trim();
            const oldName = cat.name.trim();
            const newFormatted = `${emoji} ${name}`.trim();

            cat.iconId = iconId;
            cat.emoji = emoji;
            cat.name = name;

            if (oldFormatted !== newFormatted) {
              Object.values(state.weeks || {}).forEach(w => {
                if (w && Array.isArray(w.expenses)) {
                  w.expenses.forEach(e => {
                    const eCat = (e.category || '').trim();
                    if (eCat === oldFormatted || eCat === oldName || eCat === `${cat.emoji} ${oldName}`) {
                      e.category = newFormatted;
                    }
                  });
                }
              });
            }
          } else {
            const exists = cats.some(c => c.name.toLowerCase() === name.toLowerCase());
            if (exists) {
              return this.showToast(`Ya existe una categoría con el nombre "${name}".`, 'error');
            }

            cats.push({
              id: 'cat_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
              name,
              iconId,
              emoji
            });
          }

          app.cancelCategoryEdit();
          app.renderCategoriesManagerList();
          renderApp();
          saveState();
          this.showToast('Categoría guardada correctamente.', 'success');
        },

        async deleteCategory(catId) {
          app.ensureCategoryIds();
          const cats = state.financeSettings.customCategories;
          if (cats.length <= 1) {
            return this.showToast('Debes mantener al menos una categoría de gasto en la aplicación.', 'error');
          }

          const cat = cats.find(x => x.id === catId);
          if (!cat) return;

          const targetFormatted = `${cat.emoji} ${cat.name}`.trim();
          let usageCount = 0;
          Object.values(state.weeks || {}).forEach(w => {
            if (w && Array.isArray(w.expenses)) {
              w.expenses.forEach(e => {
                const eCat = (e.category || '').trim();
                if (eCat === targetFormatted || eCat === cat.name || eCat === `${cat.emoji} ${cat.name}`) {
                  usageCount++;
                }
              });
            }
          });

          if (usageCount > 0) {
            const fallback = cats.find(x => x.id !== catId);
            const fallbackFormatted = `${fallback.emoji} ${fallback.name}`;
            const confirmed = await this.showConfirm({
              title: 'Reasignar categoría de gastos',
              message: `La categoría "${targetFormatted}" está asignada a ${usageCount} gasto(s) en tu histórico.\n\n¿Deseas eliminarla y reasignar automáticamente esos gastos a "${fallbackFormatted}"?`,
              confirmText: 'Reasignar y Eliminar',
              isDanger: true
            });
            if (!confirmed) return;

            Object.values(state.weeks || {}).forEach(w => {
              if (w && Array.isArray(w.expenses)) {
                w.expenses.forEach(e => {
                  const eCat = (e.category || '').trim();
                  if (eCat === targetFormatted || eCat === cat.name || eCat === `${cat.emoji} ${cat.name}`) {
                    e.category = fallbackFormatted;
                  }
                });
              }
            });
          } else {
            const confirmed = await this.showConfirm({
              title: 'Eliminar categoría',
              message: `¿Eliminar definitivamente la categoría "${targetFormatted}"?`,
              confirmText: 'Eliminar',
              isDanger: true
            });
            if (!confirmed) return;
          }

          state.financeSettings.customCategories = cats.filter(x => x.id !== catId);
          if (document.getElementById('manageCatEditId').value === catId) {
            app.cancelCategoryEdit();
          }
          app.renderCategoriesManagerList();
          renderApp();
          saveState();
          this.showToast(`Categoría "${targetFormatted}" eliminada.`, 'info');
        },

        async resetDefaultCategories() {
          const ok = await this.showConfirm({
            title: 'Restablecer categorías',
            message: '¿Restablecer las categorías a las predeterminadas de fábrica?\n\n(Súper 🛒, Café ☕, Ocio 🍻, Otros 📦)',
            confirmText: 'Restablecer',
            isDanger: true
          });
          if (!ok) return;
          state.financeSettings.customCategories = [
            { id: 'cat_super', name: 'Súper', emoji: '🛒' },
            { id: 'cat_cafe', name: 'Café', emoji: '☕' },
            { id: 'cat_ocio', name: 'Ocio', emoji: '🍻' },
            { id: 'cat_otros', name: 'Otros', emoji: '📦' }
          ];
          app.cancelCategoryEdit();
          app.renderCategoriesManagerList();
          renderApp();
          saveState();
        },
        // HUCHA GLOBAL: OPERACIONES CON CALCULADORA EN VIVO
        openPiggyModal(type) {
          piggyModalCurrentType = type;
          piggyModalCalculatedValue = 0;

          const isDeposit = type === 'deposit';
          document.getElementById('piggyModalTitleText').textContent = isDeposit ? 'Ingreso en la Hucha' : 'Retiro de la Hucha';
          document.getElementById('piggyModalCurrentBalance').textContent = `${Number(state.piggyBank.balance).toFixed(2)} €`;

          const calcInput = document.getElementById('piggyModalCalcInput');
          calcInput.value = '';
          calcInput.placeholder = isDeposit ? 'Ej. 15.20 + 8.50 * 2' : 'Ej. 20.00';

          const noteInput = document.getElementById('piggyModalNoteInput');
          noteInput.value = '';
          noteInput.placeholder = isDeposit ? 'Ahorro semanal, Venta de segunda mano...' : 'Capricho, Cena fuera, Imprevisto...';

          const evalDisplay = document.getElementById('piggyModalEvaluatedDisplay');
          evalDisplay.textContent = '= 0.00 €';
          evalDisplay.className = 'font-mono font-extrabold text-theme-main text-sm';

          const submitBtn = document.getElementById('piggyModalSubmitBtn');
          submitBtn.textContent = isDeposit ? 'Ingresar en Hucha' : 'Retirar de Hucha';
          submitBtn.className = isDeposit ? 'px-5 py-2 rounded-xl bg-theme-main hover:opacity-95 text-white font-bold shadow-md border border-theme/60 active:translate-y-0.5 transition' : 'px-5 py-2 rounded-xl bg-theme-accent hover:opacity-95 text-white font-bold shadow-md border border-theme-accent/60 active:translate-y-0.5 transition';

          document.getElementById('modalPiggyAction').classList.remove('hidden');
          setTimeout(() => calcInput.focus(), 50);
        },

        closePiggyModal() {
          const modal = document.getElementById('modalPiggyAction');
          if (modal) modal.classList.add('hidden');
        },

        updatePiggyCalc(val) {
          const input = val !== undefined ? val : (document.getElementById('piggyModalCalcInput')?.value || '');
          const clean = input.replace(/,/g, '.').trim();
          const evalDisplay = document.getElementById('piggyModalEvaluatedDisplay');

          if (!clean) {
            piggyModalCalculatedValue = 0;
            evalDisplay.textContent = '= 0.00 €';
            evalDisplay.className = 'font-mono font-extrabold text-theme-main text-sm';
            return;
          }

          if (/^[0-9+\-*/.()\s]+$/.test(clean)) {
            try {
              const res = Function('"use strict"; return (' + clean + ')')();
              if (typeof res === 'number' && !isNaN(res) && isFinite(res)) {
                piggyModalCalculatedValue = Math.max(0, res);
                evalDisplay.textContent = `= ${piggyModalCalculatedValue.toFixed(2)} €`;
                evalDisplay.className = 'font-mono font-extrabold text-theme-main text-sm';
                return;
              }
            } catch (_) {}
          }

          evalDisplay.textContent = 'Expresión incompleta...';
          evalDisplay.className = 'font-mono font-bold text-theme-accent text-xs';
        },

        quickAddPiggy(amount) {
          const calcInput = document.getElementById('piggyModalCalcInput');
          if (!calcInput) return;
          const currentVal = calcInput.value.trim();
          if (!currentVal || currentVal === '0') {
            calcInput.value = String(amount);
          } else {
            calcInput.value = `${currentVal} + ${amount}`;
          }
          this.updatePiggyCalc(calcInput.value);
          calcInput.focus();
        },

        clearPiggyCalc() {
          const calcInput = document.getElementById('piggyModalCalcInput');
          if (calcInput) {
            calcInput.value = '';
            calcInput.focus();
          }
          this.updatePiggyCalc('');
        },

        confirmPiggyAction() {
          this.updatePiggyCalc();
          const amount = piggyModalCalculatedValue;
          if (isNaN(amount) || amount <= 0) {
            this.showToast('Por favor introduce un importe válido mayor que 0 €.', 'error');
            return;
          }

          if (piggyModalCurrentType === 'withdraw' && amount > state.piggyBank.balance) {
            this.showToast(`Saldo insuficiente. Tienes ${state.piggyBank.balance.toFixed(2)} € en la hucha.`, 'error');
            return;
          }

          pushUndo('Movimiento en hucha');
          const note = (document.getElementById('piggyModalNoteInput')?.value || '').trim() || (piggyModalCurrentType === 'deposit' ? 'Ahorro' : 'Retiro');
          const delta = piggyModalCurrentType === 'deposit' ? amount : -amount;

          state.piggyBank.balance += delta;
          if (!Array.isArray(state.piggyBank.history)) state.piggyBank.history = [];
          state.piggyBank.history.push({
            id: 'pig_' + Date.now(),
            date: new Date().toISOString(),
            amount: delta,
            note
          });

          this.closePiggyModal();
          this.showToast(`${piggyModalCurrentType === 'deposit' ? 'Ingreso' : 'Retiro'} de ${amount.toFixed(2)} € guardado en la hucha.`, 'success');
          renderTab3();
          saveState();
        },

        // GASTOS FIJOS MENSUALES
        openAddFixedItemModal() {
          document.getElementById('newFixedItemName').value = '';
          document.getElementById('newFixedItemAmount').value = '';
          document.getElementById('modalAddFixedItem').classList.remove('hidden');
          setTimeout(() => document.getElementById('newFixedItemName').focus(), 50);
        },

        confirmAddNewFixedItem() {
          const nameInput = document.getElementById('newFixedItemName');
          const amountInput = document.getElementById('newFixedItemAmount');
          const name = nameInput.value.trim();
          const amt = parseFloat(amountInput.value);

          if (!name) {
            this.showToast('Introduce el nombre del recibo o servicio.', 'error');
            nameInput.focus();
            return;
          }
          if (isNaN(amt) || amt <= 0) {
            this.showToast('Introduce un importe mensual válido mayor que 0 €.', 'error');
            amountInput.focus();
            return;
          }

          pushUndo('Añadir recibo fijo');
          if (!Array.isArray(state.monthlyFixedItems)) state.monthlyFixedItems = [];
          state.monthlyFixedItems.push({
            id: 'f_' + Date.now(),
            name,
            amount: amt,
            paid: false
          });

          this.closeModal('modalAddFixedItem');
          this.showToast(`Recibo "${name}" añadido (${amt.toFixed(2)} €).`, 'success');
          renderTab3();
          saveState();
        },
        toggleFixedPaid(id) {
          pushUndo('Cambiar estado de recibo');
          const item = state.monthlyFixedItems.find(x => x.id === id);
          if (item) item.paid = !item.paid;
          renderTab3();
          saveState();
        },
        deleteFixedItem(id) {
          pushUndo('Eliminar recibo fijo');
          state.monthlyFixedItems = state.monthlyFixedItems.filter(x => x.id !== id);
          renderTab3();
          saveState();
        },
        toggleTab3AddExpenseForm() {
          const box = document.getElementById('tab3InlineAddExpenseBox');
          box.classList.toggle('hidden');
        },
        selectExpenseChartDay(dIdx) {
          state.ui.selectedExpenseChartDayIndex = Number(dIdx);
          renderDailyExpenseChart();
        },
        submitTab3InlineExpense() {
          const amt = parseNumericExpression(document.getElementById('tab3InlineAmount')?.value);
          const concept = document.getElementById('tab3InlineConcept').value.trim();
          const cat = document.getElementById('tab3InlineCategory').value;
          if (isNaN(amt) || amt <= 0 || !concept) return this.showToast('Introduce un importe válido (o cálculo) y concepto.', 'error');

          pushUndo('Añadir gasto');
          const todayIdx = (new Date().getDay() + 6) % 7;
          getActiveWeek().expenses.push({
            id: 'exp_' + Date.now(),
            dayIndex: todayIdx,
            amount: amt,
            concept,
            category: cat,
            timestamp: new Date().toISOString()
          });

          if (!state.dictionary.frequentConcepts) state.dictionary.frequentConcepts = [];
          if (!state.dictionary.frequentConcepts.some(x => x.toLowerCase() === concept.toLowerCase())) {
            state.dictionary.frequentConcepts.push(concept);
          }

          document.getElementById('tab3InlineAmount').value = '';
          document.getElementById('tab3InlineConcept').value = '';
          document.getElementById('tab3InlineAddExpenseBox').classList.add('hidden');
          renderApp();
          saveState();
        },

        // EXPORTACIÓN A EXCEL / CSV CON PLANTILLA NORMALIZADA (Base de Datos)
        async exportExpensesCsvPrompt() {
          const choice = await this.showConfirm({
            title: 'Exportar Base de Datos de Gastos',
            message: '¿Deseas exportar la base de datos completa de todas las semanas registradas?\n\n• Pulsa "Todas las Semanas" para descargar el CSV consolidado completo.\n• Pulsa "Solo Semana Activa" para el extracto de esta semana.',
            confirmText: 'Todas las Semanas',
            cancelText: 'Solo Semana Activa'
          });
          const weeksToExport = choice ? Object.values(state.weeks) : [getActiveWeek()];
          
          let csvRows = [];
          // Cabecera UTF-8 BOM
          csvRows.push('Semana;Fecha;Dia;Categoria;Concepto;Importe_EUR;Es_Hormiga;Nota');

          const antTh = Number(state.financeSettings.antThreshold) || 5.0;

          weeksToExport.forEach(w => {
            const dateRange = getWeekDateRange(w.weekNum);
            (w.expenses || []).forEach(e => {
              const dIdx = Number(e.dayIndex) || 0;
              const dateStr = dateRange.daysDates[dIdx] ? `${dateRange.start.getFullYear()}-${String(dateRange.start.getMonth()+1).padStart(2,'0')}-${String(dateRange.daysDates[dIdx]).padStart(2,'0')}` : '';
              const isAnt = Number(e.amount) <= antTh ? 'SI' : 'NO';
              const cleanConcept = (e.concept || '').replace(/;/g, ',');
              const cleanCat = (e.category || '').replace(/;/g, ',');
              
              csvRows.push(`${w.weekNum};${dateStr};${DAY_FULL[dIdx]};${cleanCat};${cleanConcept};${Number(e.amount).toFixed(2)};${isAnt};`);
            });
          });

          const csvContent = '\uFEFF' + csvRows.join('\r\n');
          const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = choice ? 'Base_Datos_Gastos_CentroControl_Completo.csv' : `Gastos_CentroControl_S${getActiveWeek().weekNum}.csv`;
          a.click();
          URL.revokeObjectURL(url);
          this.showToast(choice ? 'Base de datos completa exportada a CSV.' : `Gastos de Semana #${getActiveWeek().weekNum} exportados a CSV.`, 'success');
        },

        // Cierre de Semana
        switchCloseWeekTab(tabKey) {
          const tabSummary = document.getElementById('closeWeekTabSummary');
          const tabMatrix = document.getElementById('closeWeekTabMatrix');
          const btnSummary = document.getElementById('closeWeekTabBtnSummary');
          const btnMatrix = document.getElementById('closeWeekTabBtnMatrix');

          if (tabKey === 'matrix') {
            if (tabSummary) tabSummary.classList.add('hidden');
            if (tabMatrix) tabMatrix.classList.remove('hidden');
            if (btnSummary) btnSummary.className = 'px-3.5 py-1.5 rounded-xl font-bold text-xs transition flex items-center gap-1.5 subpanel-bg border text-stone-600 dark:text-slate-300 hover:border-theme';
            if (btnMatrix) btnMatrix.className = 'px-3.5 py-1.5 rounded-xl font-bold text-xs transition flex items-center gap-1.5 bg-theme-main text-white shadow-xs';
            app.renderCloseWeekMatrix();
          } else {
            if (tabSummary) tabSummary.classList.remove('hidden');
            if (tabMatrix) tabMatrix.classList.add('hidden');
            if (btnSummary) btnSummary.className = 'px-3.5 py-1.5 rounded-xl font-bold text-xs transition flex items-center gap-1.5 bg-theme-main text-white shadow-xs';
            if (btnMatrix) btnMatrix.className = 'px-3.5 py-1.5 rounded-xl font-bold text-xs transition flex items-center gap-1.5 subpanel-bg border text-stone-600 dark:text-slate-300 hover:border-theme';
          }
        },

        renderCloseWeekMatrix() {
          const targetWkNum = state.currentWeek;
          const w = state.weeks[targetWkNum] || getActiveWeek();
          const m = calculateWeekMetrics(w);
          const streaks = calculateStreaks(w.weekNum);
          renderFullWeekTable(-1, m, streaks, 'modalCloseWeekTableHeader', 'modalCloseWeekTableBody');
        },

        openCloseWeekModal() {
          // Aseguramos trabajar sobre la semana actual a cerrar
          state.viewingWeek = state.currentWeek;
          const w = getActiveWeek();
          const m = calculateWeekMetrics(w);
          const surplus = Math.max(0, m.budget - m.spent);
          const dateRange = getWeekDateRange(w.weekNum);

          const titleEl = document.getElementById('closeWeekModalTitle');
          if (titleEl) titleEl.textContent = `Cerrar Semana #${w.weekNum} y Archivar`;

          const subEl = document.getElementById('closeWeekModalSubtitle');
          if (subEl) subEl.textContent = `Período: ${dateRange.label}`;

          document.getElementById('closeWeekSummary').innerHTML = `
            <div class="flex justify-between items-center py-1 text-stone-600 dark:text-slate-300"><span class="font-medium">Score Global:</span><strong class="text-stone-900 dark:text-white font-mono text-sm">${m.score} / 100</strong></div>
            <div class="flex justify-between items-center py-1 text-stone-600 dark:text-slate-300"><span class="font-medium">Gimnasio:</span><strong class="text-stone-900 dark:text-white font-mono">${m.gymReal} / ${w.goals.gymSessions} ses. (${Math.round(m.gymPct)}%)</strong></div>
            <div class="flex justify-between items-center py-1 text-stone-600 dark:text-slate-300"><span class="font-medium">Running:</span><strong class="text-stone-900 dark:text-white font-mono">${m.runKmReal.toFixed(1)} / ${w.goals.runKm} km (${Math.round(m.runPct)}%)</strong></div>
            <div class="flex justify-between items-center py-1 text-stone-600 dark:text-slate-300"><span class="font-medium">Estudio:</span><strong class="text-stone-900 dark:text-white font-mono">${formatHoursToHMin(m.studyReal)} / ${formatHoursToHMin(m.studyGoal)} (${Math.round(m.studyPct)}%)</strong></div>
            <div class="flex justify-between items-center py-1.5 text-stone-700 dark:text-slate-200"><span class="font-bold">Presupuesto Restante:</span><strong class="text-theme-main font-mono text-sm">${surplus.toFixed(2)} €</strong></div>
          `;

          document.getElementById('closeWeekSurplusBadge').textContent = `${surplus.toFixed(2)} €`;
          app.updateSurplusSlider();
          app.switchCloseWeekTab('summary');
          document.getElementById('closeWeekModal').classList.remove('hidden');
        },

        updateSurplusSlider() {
          const w = getActiveWeek();
          const m = calculateWeekMetrics(w);
          const surplus = Math.max(0, m.budget - m.spent);
          const sliderEl = document.getElementById('closeWeekSlider');
          const sliderVal = sliderEl ? parseInt(sliderEl.value, 10) : 50;

          const piggyPct = sliderVal;
          const carryPct = 100 - sliderVal;

          const piggyBar = document.getElementById('closeWeekBarPiggy');
          if (piggyBar) {
            piggyBar.style.width = `${piggyPct}%`;
            piggyBar.textContent = `${piggyPct}%`;
          }
          const carryBar = document.getElementById('closeWeekBarCarry');
          if (carryBar) {
            carryBar.style.width = `${carryPct}%`;
            carryBar.textContent = `${carryPct}%`;
          }

          const piggyAmt = parseFloat(((surplus * piggyPct) / 100).toFixed(2));
          const carryAmt = parseFloat((surplus - piggyAmt).toFixed(2));

          const piggyAmtEl = document.getElementById('closeWeekPiggyAmt');
          if (piggyAmtEl) piggyAmtEl.textContent = `${piggyAmt.toFixed(2)} €`;

          const carryAmtEl = document.getElementById('closeWeekCarryAmt');
          if (carryAmtEl) carryAmtEl.textContent = `+${carryAmt.toFixed(2)} €`;
        },

        confirmCloseWeek() {
          // Cerrar siempre la semana activa oficial (state.currentWeek)
          state.viewingWeek = state.currentWeek;
          const curWk = getActiveWeek();
          const m = calculateWeekMetrics(curWk);
          const surplus = Math.max(0, m.budget - m.spent);
          const sliderEl = document.getElementById('closeWeekSlider');
          const sliderVal = sliderEl ? parseInt(sliderEl.value, 10) : 50;

          pushUndo('Cerrar semana');
          const piggyAmt = parseFloat(((surplus * sliderVal) / 100).toFixed(2));
          const carryAmt = parseFloat((surplus - piggyAmt).toFixed(2));

          curWk.isClosed = true;
          curWk.closedAt = new Date().toISOString();
          curWk.surplusDistribution = { piggy: piggyAmt, carryNext: carryAmt };

          state.piggyBank.balance += piggyAmt;
          if (piggyAmt > 0) {
            state.piggyBank.history.push({ id: 'pig_' + Date.now(), date: new Date().toISOString(), amount: piggyAmt, note: `Sobrante Semana #${curWk.weekNum}` });
          }

          const nextNum = state.currentWeek + 1;
          state.currentWeek = nextNum;
          state.viewingWeek = nextNum;
          state.isReadOnlyLocked = false;
          state.weeks[nextNum] = createEmptyWeek(nextNum, state.goalsTemplate, state.scheduleTemplate);
          state.weeks[nextNum].budgetLimit += carryAmt;

          app.closeModal('closeWeekModal');
          playSoundAlarm('chord');
          renderApp();
          saveState();
          this.showToast(`¡Semana #${curWk.weekNum} cerrada con éxito! Iniciando la Semana #${nextNum}.`, 'success');
        },

        loadWeekForEditing(weekNum) {
          state.viewingWeek = weekNum;
          state.isReadOnlyLocked = true;
          app.switchTab(1);
          renderApp();
          saveState();
        },
        returnToActiveWeek() {
          state.viewingWeek = state.currentWeek;
          state.isReadOnlyLocked = false;
          renderApp();
          saveState();
        },
        setLabScope(scope) { state.ui.labScope = scope; renderTab4(); saveState(); },
        setEvolMetric(metric) { state.ui.evolMetric = metric; renderTab4(); saveState(); },

        // --- TOUR GUIADO INTERACTIVO POR LA PÁGINA (SPOTLIGHT & TOOLTIP FLOTANTE) ---
        guidedTourStep: 0,
        guidedTourSteps: [
          {
            tab: 1,
            targetId: 'mainAppHeader',
            title: '1. Cabecera, Semanas y Sincronización',
            description: 'Desde aquí cambias de semana (◀ / ▶), activas el <strong>Candado de Solo Lectura</strong> para evitar toques accidentales, cambias la paleta bicolor y pulsas <strong>Sincronizar</strong> para actualizar Drive y la app en tu iPad.'
          },
          {
            tab: 1,
            targetId: 'kpiGridContainer',
            title: '2. Tarjetas de KPIs y Diagnóstico',
            description: 'Tus 4 métricas vitales: <strong>Objetivos</strong> (baterías de gym, run, estudio y nutrición), <strong>Horas de Estudio</strong> con anillo de avance, <strong>Asistencia</strong> a clase con auditoría de faltas y <strong>Ritmo de Gasto</strong> del presupuesto semanal.'
          },
          {
            tab: 1,
            targetId: 'todayFocusContainer',
            title: '3. Enfoque de Hoy & Registro Táctil',
            description: 'Tu recuadro diario principal: anota calorías con un toque rápido, marca sesiones de gym (pierna, torso...), kilometraje de running y hábitos personales con checkboxes o valores numéricos.'
          },
          {
            tab: 1,
            targetId: 'interactiveListsPanel',
            title: '4. Listas de Entregas y Gastos Rápidos',
            description: 'Organiza tus entregas universitarias, exámenes y notas con fechas y subtareas. Además, puedes anotar compras sobre la marcha pulsando <kbd class="px-1 py-0.5 rounded border text-[9px] font-mono">N</kbd> o tocando en la pastilla flotante.'
          },
          {
            tab: 2,
            targetId: 'tab2',
            title: '5. Pestaña 02: Metas, Horario y Módulos',
            description: 'Configura tu semana ideal: define tus metas de estudio, activa o desactiva módulos enteros (incluso los predeterminados), crea nuevos hábitos con iconos SVG y asigna tu horario de clases.'
          },
          {
            tab: 3,
            targetId: 'tab3',
            title: '6. Pestaña 03: Finanzas Pro y la Hucha',
            description: 'Control financiero de precisión: presupuesto semanal automático, recibos fijos mensuales que se desmarcan cada mes y tu <strong>Hucha</strong> con metas de ahorro individuales y simulación de compras.'
          },
          {
            tab: 4,
            targetId: 'tab4',
            title: '7. Pestaña 04: Estadísticas & Laboratorio',
            description: 'Analiza tu rendimiento: mapa de calor anatómico por grupos musculares, evolución histórica del Score (0-100) y comparador de métricas entre semanas pasadas.'
          },
          {
            tab: 1,
            targetId: 'dockPomoPill',
            title: '8. Modo Zen & Temporizador Pomodoro',
            description: 'Inicia sesiones de estudio profundo desde la pastilla flotante o pulsando <kbd class="px-1 py-0.5 rounded border text-[9px] font-mono">Z</kbd>. En iPad la pantalla no se apaga y el reloj nunca se congela.'
          }
        ],

        startGuidedTour() {
          this.closeModal('modalWelcomeIntro');
          this.guidedTourStep = 0;
          const overlay = document.getElementById('tourOverlay');
          if (overlay) overlay.classList.remove('hidden');
          this.renderGuidedTourStep();
        },

        endGuidedTour() {
          const overlay = document.getElementById('tourOverlay');
          if (overlay) overlay.classList.add('hidden');
          localStorage.setItem('centro_onboarding_shown', 'true');
          this.showToast('¡Has completado el tour interactivo! Ya tienes el control total.', 'success', 3500);
        },

        nextTourStep() {
          if (this.guidedTourStep < this.guidedTourSteps.length - 1) {
            this.guidedTourStep++;
            this.renderGuidedTourStep();
          } else {
            this.endGuidedTour();
          }
        },

        prevTourStep() {
          if (this.guidedTourStep > 0) {
            this.guidedTourStep--;
            this.renderGuidedTourStep();
          }
        },

        renderGuidedTourStep() {
          const stepData = this.guidedTourSteps[this.guidedTourStep];
          if (!stepData) return;

          // 1. Cambiar de pestaña si el paso lo requiere
          if (state.activeTab !== stepData.tab) {
            this.switchTab(stepData.tab);
          }

          const badge = document.getElementById('tourStepBadge');
          const title = document.getElementById('tourTargetTitle');
          const desc = document.getElementById('tourDescriptionText');
          const nextBtn = document.getElementById('tourNextBtn');
          const prevBtn = document.getElementById('tourPrevBtn');
          const finishBtn = document.getElementById('tourFinishBtn');

          if (badge) badge.textContent = `Paso ${this.guidedTourStep + 1} de ${this.guidedTourSteps.length}`;
          if (title) title.textContent = stepData.title;
          if (desc) desc.innerHTML = stepData.description;

          if (prevBtn) {
            if (this.guidedTourStep === 0) prevBtn.classList.add('opacity-40', 'pointer-events-none');
            else prevBtn.classList.remove('opacity-40', 'pointer-events-none');
          }

          if (nextBtn && finishBtn) {
            if (this.guidedTourStep === this.guidedTourSteps.length - 1) {
              nextBtn.classList.add('hidden');
              finishBtn.classList.remove('hidden');
            } else {
              nextBtn.classList.remove('hidden');
              finishBtn.classList.add('hidden');
            }
          }

          // 2. Localizar y resaltar el elemento objetivo con scroll suave
          setTimeout(() => {
            let el = document.getElementById(stepData.targetId);
            if (!el && stepData.targetId === 'quickExpensesSection') {
              el = document.getElementById('quickExpensesCard') || document.getElementById('tab1');
            }
            if (!el && stepData.targetId === 'kpiGridContainer') {
              el = document.getElementById('kpiCard1')?.parentElement || document.getElementById('kpiCard1');
            }
            if (!el) el = document.getElementById('tab1');

            if (el) {
              el.scrollIntoView({ behavior: 'smooth', block: 'center' });

              setTimeout(() => {
                const rect = el.getBoundingClientRect();
                const hlBox = document.getElementById('tourHighlightBox');
                const ttBox = document.getElementById('tourTooltipBox');

                if (hlBox) {
                  hlBox.style.top = `${rect.top - 6}px`;
                  hlBox.style.left = `${rect.left - 6}px`;
                  hlBox.style.width = `${rect.width + 12}px`;
                  hlBox.style.height = `${rect.height + 12}px`;
                }

                // Posicionar tooltip inteligentemente
                if (ttBox) {
                  const ttHeight = ttBox.offsetHeight || 190;
                  const ttWidth = ttBox.offsetWidth || 340;
                  const spaceBelow = window.innerHeight - (rect.bottom + 12);
                  const spaceAbove = rect.top - 12;

                  let topPos = 0;
                  if (spaceBelow >= ttHeight || spaceBelow >= spaceAbove) {
                    topPos = Math.min(window.innerHeight - ttHeight - 16, rect.bottom + 14);
                  } else {
                    topPos = Math.max(16, rect.top - ttHeight - 14);
                  }

                  let leftPos = Math.max(16, Math.min(window.innerWidth - ttWidth - 16, rect.left + (rect.width - ttWidth) / 2));

                  ttBox.style.top = `${topPos}px`;
                  ttBox.style.left = `${leftPos}px`;
                }
              }, 250);
            }
          }, 60);
        },

        openWelcomeIntroModal() {
          this.welcomeTourStep = 0;
          const home = document.getElementById('welcomeStepHome');
          const tour = document.getElementById('welcomeStepTour');
          if (home) home.classList.remove('hidden');
          if (tour) tour.classList.add('hidden');
          this.openModal('modalWelcomeIntro');
        },
        startWelcomeTour() {
          this.startGuidedTour();
        },
        skipWelcomeIntro() {
          localStorage.setItem('centro_onboarding_shown', 'true');
          this.closeModal('modalWelcomeIntro');
        },
        welcomeConnectDrive() {
          this.skipWelcomeIntro();
          this.syncGoogleDriveNow();
        },
        nextWelcomeTourStep() {
          if (this.welcomeTourStep < 3) {
            this.welcomeTourStep++;
            this.renderWelcomeTourStep();
          } else {
            this.finishWelcomeTour();
          }
        },
        prevWelcomeTourStep() {
          if (this.welcomeTourStep > 0) {
            this.welcomeTourStep--;
            this.renderWelcomeTourStep();
          } else {
            // Volver a la pantalla de bienvenida inicial
            const home = document.getElementById('welcomeStepHome');
            const tour = document.getElementById('welcomeStepTour');
            if (home) home.classList.remove('hidden');
            if (tour) tour.classList.add('hidden');
          }
        },
        finishWelcomeTour() {
          this.skipWelcomeIntro();
          this.showToast('¡Tour completado! Ya puedes personalizar tu semana 🚀', 'success', 3500);
        },
        renderWelcomeTourStep() {
          const step = this.welcomeTourStep;
          const badge = document.getElementById('welcomeTourStepBadge');
          const title = document.getElementById('welcomeTourCategoryTitle');
          const body = document.getElementById('welcomeTourCardBody');
          const nextBtn = document.getElementById('welcomeTourNextBtn');
          const finishBtn = document.getElementById('welcomeTourFinishBtn');

          if (badge) badge.textContent = `Paso ${step + 1} de 4`;

          // Actualizar dots
          for (let i = 0; i < 4; i++) {
            const dot = document.getElementById(`welcomeDot_${i}`);
            if (dot) {
              if (i === step) {
                dot.className = 'w-5 h-2 rounded-full bg-theme-main transition-all duration-300';
              } else {
                dot.className = 'w-2 h-2 rounded-full bg-stone-300 dark:bg-slate-700 transition-all duration-300';
              }
            }
          }

          if (nextBtn && finishBtn) {
            if (step === 3) {
              nextBtn.classList.add('hidden');
              finishBtn.classList.remove('hidden');
            } else {
              nextBtn.classList.remove('hidden');
              finishBtn.classList.add('hidden');
            }
          }

          const tourStepsData = [
            {
              category: 'Panel Diario (Pestaña 01)',
              title: 'Hábitos diarios, entrenamientos y Score',
              html: `
                <div class="flex items-start gap-3">
                  <div class="text-3xl shrink-0 p-2 rounded-xl bg-theme-soft border border-theme-main/30">📊</div>
                  <div class="space-y-1">
                    <h5 class="font-bold text-xs text-stone-900 dark:text-white">Tu seguimiento diario en un solo vistazo</h5>
                    <p class="text-[11px] text-stone-600 dark:text-slate-300 leading-relaxed">
                      Registra tus calorías, sesiones de gimnasio (pierna, torso, etc.), kilómetros de carrera y horas de estudio. Todo calcula un <strong>Score de 0 a 100</strong> diario y mantiene tus <strong>rachas vivas</strong>.
                    </p>
                    <div class="text-[10px] text-stone-500 font-mono pt-1">Tip: Pulsa en las tarjetas de hábitos para registrar con un solo toque.</div>
                  </div>
                </div>
              `
            },
            {
              category: 'Plantilla Modular (Pestaña 02)',
              title: 'Horario semanal y hábitos a tu medida',
              html: `
                <div class="flex items-start gap-3">
                  <div class="text-3xl shrink-0 p-2 rounded-xl bg-theme-soft border border-theme-main/30">⚙️</div>
                  <div class="space-y-1">
                    <h5 class="font-bold text-xs text-stone-900 dark:text-white">Adapta el Centro a tu estilo de vida</h5>
                    <p class="text-[11px] text-stone-600 dark:text-slate-300 leading-relaxed">
                      En <strong>Metas y Horario</strong> puedes activar o desactivar módulos (gym, run, estudio, notas...), crear tus propios hábitos con iconos SVG y configurar tu horario de clases universitarias.
                    </p>
                    <div class="text-[10px] text-stone-500 font-mono pt-1">Tip: Los cambios que hagas en una semana no alteran las semanas pasadas archivadas.</div>
                  </div>
                </div>
              `
            },
            {
              category: 'Finanzas Pro (Pestaña 03)',
              title: 'Presupuesto semanal, gastos y la hucha',
              html: `
                <div class="flex items-start gap-3">
                  <div class="text-3xl shrink-0 p-2 rounded-xl bg-theme-soft border border-theme-main/30">💰</div>
                  <div class="space-y-1">
                    <h5 class="font-bold text-xs text-stone-900 dark:text-white">Control total de tu dinero sin esfuerzo</h5>
                    <p class="text-[11px] text-stone-600 dark:text-slate-300 leading-relaxed">
                      Establece tu presupuesto semanal, añade gastos al instante pulsando <kbd class="px-1 py-0.5 rounded border text-[9px] font-mono">N</kbd> y transfiere tus ahorros semanales a la <strong>Hucha</strong> para alcanzar tus metas.
                    </p>
                    <div class="text-[10px] text-stone-500 font-mono pt-1">Tip: Aprende automáticamente tus categorías más frecuentes según lo que escribas.</div>
                  </div>
                </div>
              `
            },
            {
              category: 'Modo Zen & iPad PWA',
              title: 'Pomodoro concentrado y sincronización nube',
              html: `
                <div class="flex items-start gap-3">
                  <div class="text-3xl shrink-0 p-2 rounded-xl bg-theme-soft border border-theme-main/30">⏱️</div>
                  <div class="space-y-1">
                    <h5 class="font-bold text-xs text-stone-900 dark:text-white">Estudio profundo y sincronización multidispositivo</h5>
                    <p class="text-[11px] text-stone-600 dark:text-slate-300 leading-relaxed">
                      Usa el <strong>Modo Zen</strong> (o pulsa <kbd class="px-1 py-0.5 rounded border text-[9px] font-mono">Z</kbd>) para concentrarte. Si usas iPad, la pantalla no se apaga y el temporizador no se congela. Además, sincroniza en tiempo real con <strong>Google Drive</strong>.
                    </p>
                    <div class="text-[10px] text-stone-500 font-mono pt-1">Tip: Pulsa "Cerrar Semana" cada domingo para archivar y consolidar estadísticas.</div>
                  </div>
                </div>
              `
            }
          ];

          const cur = tourStepsData[step];
          if (title) title.textContent = cur.category;
          if (body) body.innerHTML = cur.html;
        },

        openBackupModal() {
          updateGdriveUI();
          document.getElementById('backupModal').classList.remove('hidden');
        },
        openUserGuideModal() {
          const el = document.getElementById('userGuideModal');
          if (el) el.classList.remove('hidden');
          this.switchGuideTab('devices');
        },
        switchGuideTab(tabKey) {
          const tabs = ['devices', 'drive', 'autosave', 'workflow'];
          tabs.forEach(t => {
            const btn = document.getElementById('guideTabBtn_' + t);
            const sec = document.getElementById('guideSection_' + t);
            if (btn) {
              if (t === tabKey) {
                btn.className = 'px-3 py-1.5 rounded-lg bg-theme-main text-white shadow-xs whitespace-nowrap font-bold';
              } else {
                btn.className = 'px-3 py-1.5 rounded-lg text-slate-400 hover:text-white whitespace-nowrap font-bold transition';
              }
            }
            if (sec) sec.classList.toggle('hidden', t !== tabKey);
          });
        },
        async connectGoogleDrive(forceSelectAccount = false) {
          if (window.resetGdriveSyncLock) window.resetGdriveSyncLock();
          if (!window.google || !window.google.accounts || !window.google.accounts.oauth2) {
            return this.showToast('Cargando servicios de Google... Revisa tu conexión a internet.', 'warning');
          }
          const tokenFn = window.ensureGdriveToken || (typeof ensureGdriveToken === 'function' ? ensureGdriveToken : null);
          if (!tokenFn) {
            return this.showToast('El módulo de autenticación no está listo.', 'error');
          }
          this.showToast('Iniciando conexión con Google Drive...', 'info', 2000);
          const token = await tokenFn(true, forceSelectAccount);
          if (token) {
            const syncFn = window.syncGdriveCloud || (typeof syncGdriveCloud === 'function' ? syncGdriveCloud : null);
            if (syncFn) await syncFn(true, false, false);
          }
        },
        async syncGoogleDriveNow() {
          if (!gdriveUserEmail) {
            const connect = await this.showConfirm({
              title: 'Conectar con Google Drive',
              message: 'Para sincronizar tu móvil, iPad y tu PC automáticamente, necesitas vincular tu cuenta de Google una vez.\n\n¿Deseas iniciar sesión con Google ahora?',
              confirmText: 'Iniciar Sesión',
              cancelText: 'Cancelar',
              isDanger: false
            });
            if (connect) this.connectGoogleDrive();
            return;
          }
          this.showToast('Sincronizando con Google Drive...', 'info', 2500);
          const syncFn = window.syncGdriveCloud || (typeof syncGdriveCloud === 'function' ? syncGdriveCloud : null);
          const res = syncFn ? await syncFn(true, false, false) : null;
          if (res && res.success) {
            if (res.action === 'downloaded') {
              this.showToast('¡Datos actualizados desde Google Drive!', 'success', 3000);
            } else if (res.action === 'uploaded') {
              this.showToast('¡Datos locales subidos a Google Drive!', 'success', 3000);
            } else if (res.action === 'conflict') {
              // Ya se muestra el modal de conflicto
            } else {
              this.showToast('Datos sincronizados y al día.', 'success', 2500);
            }
          } else {
            const reason = res ? res.reason : 'desconocida';
            if (reason === 'token_expired') {
              this.showToast('Tu sesión de Google expiró. Haz clic en Renovar Sesión.', 'warning', 4500);
            } else if (reason !== 'throttled') {
              this.showToast('No se pudo completar la sincronización (' + reason + '). Revisa tu conexión.', 'error', 4500);
            }
          }
        },

        async forceUploadToDrive() {
          if (window.resetGdriveSyncLock) window.resetGdriveSyncLock();
          if (!gdriveUserEmail) return this.connectGoogleDrive();
          const ok = await this.showConfirm({
            title: 'Forzar Subida a Google Drive',
            message: 'Esta acción SOBREESCRIBIRÁ el archivo en Google Drive con la versión que tienes en este dispositivo.\n\n¿Deseas continuar?',
            confirmText: 'Forzar Subida',
            cancelText: 'Cancelar',
            isDanger: true
          });
          if (!ok) return;
          this.showToast('Subiendo copia local forzada a Drive...', 'info', 3000);
          const syncFn = window.syncGdriveCloud || (typeof syncGdriveCloud === 'function' ? syncGdriveCloud : null);
          const res = syncFn ? await syncFn(false, true, false) : null;
          if (res && res.success) {
            // Éxito ya notificado en syncGdriveCloud
          } else {
            const reason = res ? res.reason : 'desconocida';
            if (reason !== 'token_expired') {
              this.showToast('Error al forzar subida a Drive: ' + reason, 'error', 4500);
            }
          }
        },

        async forceDownloadFromDrive() {
          if (window.resetGdriveSyncLock) window.resetGdriveSyncLock();
          if (!gdriveUserEmail) return this.connectGoogleDrive();
          const ok = await this.showConfirm({
            title: 'Forzar Descarga de Google Drive',
            message: 'Esta acción SOBREESCRIBIRÁ tus datos locales con la copia que está guardada en Google Drive.\n\n¿Deseas continuar?',
            confirmText: 'Forzar Bajada',
            cancelText: 'Cancelar',
            isDanger: true
          });
          if (!ok) return;
          this.showToast('Descargando archivo desde Google Drive...', 'info', 3000);
          const syncFn = window.syncGdriveCloud || (typeof syncGdriveCloud === 'function' ? syncGdriveCloud : null);
          const res = syncFn ? await syncFn(true, false, true) : null;
          if (res && res.success) {
            // applyCloudDownload ya emite el toast y actualiza UI
          } else {
            const reason = res ? res.reason : 'desconocida';
            if (reason === 'file_not_found') {
              // Toast descriptivo ya emitido
            } else if (reason !== 'token_expired') {
              this.showToast('Error al forzar bajada de Drive: ' + reason, 'error', 4500);
            }
          }
        },

        disconnectGoogleDrive() {
          gdriveAccessToken = null;
          gdriveTokenExpiry = 0;
          gdriveUserEmail = null;
          gdriveFileId = null;
          localStorage.removeItem('gdrive_access_token');
          localStorage.removeItem('gdrive_token_expiry');
          localStorage.removeItem('gdrive_user_email');
          localStorage.removeItem('gdrive_file_id');
          updateGdriveUI();
          this.showToast('Sesión de Google Drive cerrada.', 'info');
        },

        async refreshAppAndSync() {
          const icon = document.getElementById('headerSyncRefreshIcon');
          if (icon) icon.classList.add('rotate-180');
          this.showToast('Sincronizando con Drive y comprobando versión...', 'info', 2000);

          // 1. Comprobar actualización de Service Worker (código de la app)
          if ('serviceWorker' in navigator) {
            try {
              const reg = await navigator.serviceWorker.getRegistration();
              if (reg) {
                await reg.update();
                if (reg.waiting) {
                  const banner = document.getElementById('pwaUpdateBanner');
                  if (banner) banner.classList.remove('hidden');
                  this.showToast('¡Nueva versión del Centro de Control lista!', 'blue', 4000);
                }
              }
            } catch (swErr) {
              console.log('No se pudo verificar actualización de Service Worker:', swErr);
            }
          }

          // 2. Sincronizar con Google Drive
          if (!gdriveUserEmail) {
            // Si no está conectado, pedir vincular de inmediato
            const connect = await this.showConfirm({
              title: 'Conectar con Google Drive',
              message: 'Para sincronizar tu móvil, tableta y ordenador automáticamente en la nube, necesitas vincular tu cuenta de Google.\n\n¿Deseas iniciar sesión con Google ahora?',
              confirmText: 'Iniciar Sesión',
              cancelText: 'Cancelar',
              isDanger: false
            });
            if (connect) this.connectGoogleDrive(true);
            if (icon) icon.classList.remove('rotate-180');
            return;
          }

          // Si el token ha expirado, solicitar renovación interactiva
          if (typeof isGdriveConnected === 'function' && !isGdriveConnected()) {
            this.showToast('Renovando sesión de Google Drive...', 'info', 2000);
            const token = await ensureGdriveToken(true);
            if (!token) {
              this.showToast('Sesión de Google no renovada. Pulsa Sincronizar para volver a intentar.', 'warning', 3500);
              if (icon) icon.classList.remove('rotate-180');
              return;
            }
          }

          try {
            const res = await syncGdriveCloud(true);
            if (res && res.success) {
              if (res.action === 'downloaded') {
                this.showToast('¡Actualizado con los cambios más recientes de Google Drive!', 'success', 3000);
              } else if (res.action === 'uploaded') {
                this.showToast('¡Cambios locales sincronizados con Google Drive!', 'success', 3000);
              } else if (res.action === 'conflict') {
                // Ya se abrió el modal de conflicto
              } else {
                this.showToast('Centro de Control sincronizado y al día.', 'success', 2500);
              }
            } else {
              const reason = res ? res.reason : 'error';
              if (reason === 'token_expired') {
                this.showToast('Sesión expirada. Intentando reconectar...', 'warning', 2500);
                this.connectGoogleDrive(false);
              } else {
                this.showToast('No se pudo completar la sincronización (' + reason + ').', 'error', 3500);
              }
            }
          } catch (gErr) {
            console.warn('Error sincronizando con Drive:', gErr);
            this.showToast('Error de comunicación con Google Drive.', 'error', 3500);
          }

          setTimeout(() => {
            if (icon) icon.classList.remove('rotate-180');
          }, 600);
        },
                applyPwaUpdate() {
          if ('serviceWorker' in navigator) {
            navigator.serviceWorker.getRegistrations().then(registrations => {
              for (let reg of registrations) {
                if (reg.waiting) {
                  reg.waiting.postMessage({ type: 'SKIP_WAITING' });
                }
              }
            });
          }
          // Limpiar caché de navegador y recargar
          if ('caches' in window) {
            caches.keys().then(keys => {
              keys.forEach(k => caches.delete(k));
              window.location.reload(true);
            }).catch(() => {
              window.location.reload(true);
            });
          } else {
            window.location.reload(true);
          }
        },
        openModal(id) {
          const el = document.getElementById(id);
          if (el) el.classList.remove('hidden');
        },
        closeModal(id) {
          const el = document.getElementById(id);
          if (el) el.classList.add('hidden');
          if (id === 'modalMuscleInspector') {
            state.ui.selectedMuscle = null;
            const container = document.getElementById('anatomySvgContainer');
            if (container) container.innerHTML = renderSvgAnatomy();
          }
        },

        // METAS DE AHORRO INDIVIDUALES
        openAddSavingsGoalModal() {
          const tInp = document.getElementById('newGoalTitleInput');
          const tgInp = document.getElementById('newGoalTargetInput');
          const initInp = document.getElementById('newGoalInitialInput');
          if (tInp) tInp.value = '';
          if (tgInp) tgInp.value = '';
          if (initInp) initInp.value = '0';
          this.openModal('modalAddSavingsGoal');
          setTimeout(() => tInp && tInp.focus(), 60);
        },

        saveNewSavingsGoal() {
          const title = (document.getElementById('newGoalTitleInput')?.value || '').trim();
          const target = parseFloat(document.getElementById('newGoalTargetInput')?.value || '0');
          const initial = parseFloat(document.getElementById('newGoalInitialInput')?.value || '0');

          if (!title) return this.showToast('Por favor escribe un nombre para la meta.', 'error');
          if (isNaN(target) || target <= 0) return this.showToast('Introduce un importe objetivo mayor que 0 €.', 'error');

          pushUndo('Crear meta de ahorro');
          if (!Array.isArray(state.savingsGoals)) state.savingsGoals = [];
          state.savingsGoals.push({
            id: 'goal_' + Date.now(),
            title,
            target,
            saved: Math.max(0, isNaN(initial) ? 0 : initial),
            createdAt: new Date().toISOString()
          });

          this.closeModal('modalAddSavingsGoal');
          this.showToast(`¡Meta "${title}" creada con éxito!`, 'success');
          renderTab3();
          saveState();
        },

        openContributeSavingsGoalModal(id) {
          const goal = (state.savingsGoals || []).find(g => g.id === id);
          if (!goal) return;
          this.activeContributingGoalId = id;

          const titleEl = document.getElementById('contributeGoalName');
          const savedEl = document.getElementById('contributeGoalCurrentSaved');
          const amtInp = document.getElementById('contributeGoalAmountInput');

          if (titleEl) titleEl.textContent = goal.title;
          if (savedEl) savedEl.textContent = `${Number(goal.saved || 0).toFixed(2)} € (de ${Number(goal.target || 0).toFixed(2)} €)`;
          if (amtInp) amtInp.value = '';

          this.openModal('modalContributeSavingsGoal');
          setTimeout(() => amtInp && amtInp.focus(), 60);
        },

        confirmContributeSavingsGoal() {
          const id = this.activeContributingGoalId;
          const goal = (state.savingsGoals || []).find(g => g.id === id);
          if (!goal) return;

          const amt = parseFloat(document.getElementById('contributeGoalAmountInput')?.value || '0');
          if (isNaN(amt) || amt === 0) return this.showToast('Introduce un importe diferente de 0.', 'error');

          pushUndo('Movimiento en meta de ahorro');
          const cur = Number(goal.saved) || 0;
          goal.saved = Math.max(0, cur + amt);

          this.closeModal('modalContributeSavingsGoal');
          this.showToast(amt > 0 ? `+${amt.toFixed(2)} € aportados a "${goal.title}".` : `${amt.toFixed(2)} € retirados de "${goal.title}".`, 'success');
          renderTab3();
          saveState();
        },

        async deleteSavingsGoal(id) {
          const goal = (state.savingsGoals || []).find(g => g.id === id);
          if (!goal) return;

          const confirmed = await this.showConfirm({
            title: 'Eliminar Meta de Ahorro',
            message: `¿Deseas eliminar definitivamente la meta "${goal.title}"?`,
            confirmText: 'Eliminar Meta',
            cancelText: 'Cancelar',
            isDanger: true
          });
          if (!confirmed) return;

          pushUndo('Eliminar meta de ahorro');
          state.savingsGoals = (state.savingsGoals || []).filter(g => g.id !== id);
          this.showToast(`Meta "${goal.title}" eliminada.`, 'info');
          renderTab3();
          saveState();
        },

        async setupFileAutoSave() {
          try {
            if (!('showSaveFilePicker' in window) && !('showOpenFilePicker' in window)) {
              return this.showToast('Navegador sin File System Access API. Se mantiene guardado en localStorage.', 'warning');
            }
            if (fileHandle) {
              const change = await this.showConfirm({
                title: 'Autoguardado en disco / Drive',
                message: 'El autoguardado ya está configurado en tu PC.\n\n¿Deseas vincular otro archivo o desactivarlo?',
                confirmText: 'Cambiar archivo',
                cancelText: 'Desactivar',
                isDanger: false
              });
              if (!change) {
                fileHandle = null;
                await clearStoredFileHandleFromDB();
                updateAutoSaveUI(false);
                this.showToast('Autoguardado en disco desactivado.', 'info');
                return;
              }
            }

            // Preguntar si desea seleccionar un archivo existente o crear uno nuevo
            const openExisting = await this.showConfirm({
              title: 'Vincular con Archivo de Drive / Disco',
              message: '¿Qué deseas hacer?\n\n• Seleccionar archivo existente: Carga y vincula un archivo previo de tu Drive (ideal para un nuevo dispositivo).\n• Crear nuevo archivo: Empieza un archivo nuevo y guarda el estado actual.',
              confirmText: 'Seleccionar Existente',
              cancelText: 'Crear Archivo Nuevo',
              isDanger: false
            });

            if (openExisting && ('showOpenFilePicker' in window)) {
              const [handle] = await window.showOpenFilePicker({
                types: [{ description: 'Archivo de Datos JSON', accept: { 'application/json': ['.json'] } }],
                multiple: false
              });
              if (!handle) return;
              fileHandle = handle;
              await storeFileHandleInDB(fileHandle);

              // Leer y restaurar los datos del archivo seleccionado
              try {
                const file = await fileHandle.getFile();
                const text = await file.text();
                if (text && text.trim()) {
                  pushUndo('Cargar datos de archivo vinculado');
                  state = sanitizeState(JSON.parse(text));
                  renderApp();
                  saveState(true);
                }
              } catch (_) {}

              updateAutoSaveUI(true);
              this.showToast('¡Archivo vinculado y datos cargados con éxito!', 'success');
            } else {
              fileHandle = await window.showSaveFilePicker({
                suggestedName: 'centro_control_datos.json',
                types: [{ description: 'Archivo de Datos JSON', accept: { 'application/json': ['.json'] } }]
              });
              await storeFileHandleInDB(fileHandle);
              await syncDiskFile();
              updateAutoSaveUI(true);
              this.showToast('¡Autoguardado continuo en PC / Drive activado y guardado!', 'success');
            }
          } catch (err) {
            if (err && err.name !== 'AbortError') {
              this.showToast('No se pudo activar el autoguardado en disco.', 'error');
            }
          }
        },

        async selectExistingAutoSaveFile() {
          try {
            if (!('showOpenFilePicker' in window)) {
              return this.showToast('Tu navegador no soporta selector de archivos con autoguardado continuo.', 'warning');
            }
            const [handle] = await window.showOpenFilePicker({
              types: [{ description: 'Archivo de Datos JSON', accept: { 'application/json': ['.json'] } }],
              multiple: false
            });
            if (!handle) return;
            fileHandle = handle;
            await storeFileHandleInDB(fileHandle);

            // Leer y cargar datos
            const file = await fileHandle.getFile();
            const text = await file.text();
            if (text && text.trim()) {
              pushUndo('Vincular archivo existente');
              state = sanitizeState(JSON.parse(text));
              renderApp();
              saveState(true);
            }

            updateAutoSaveUI(true);
            this.showToast('¡Archivo de Drive vinculado y cargado!', 'success');
          } catch (err) {
            if (err && err.name !== 'AbortError') {
              this.showToast('No se pudo seleccionar el archivo.', 'error');
            }
          }
        },

        async resumeAutoSavePermission() {
          if (gdriveUserEmail) {
            return this.syncGoogleDriveNow();
          }
          const hasFSA = ('showSaveFilePicker' in window) || ('showOpenFilePicker' in window);
          const isMobileDevice = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '') || (navigator.maxTouchPoints > 1 && window.innerWidth < 1024);
          if (!hasFSA || isMobileDevice) {
            return this.connectGoogleDrive();
          }
          if (!fileHandle) {
            const stored = await getStoredFileHandleFromDB();
            if (stored) fileHandle = stored;
          }
          if (!fileHandle) return this.setupFileAutoSave();
          try {
            const perm = await fileHandle.requestPermission({ mode: 'readwrite' });
            if (perm === 'granted') {
              updateAutoSaveUI(true);
              await syncDiskFile();
              this.showToast('Â¡Permiso concedido! Autoguardado en disco activo.', 'success');
            } else {
              this.showToast('Permiso no concedido para escribir en el archivo.', 'warning');
            }
          } catch (_) {
            this.setupFileAutoSave();
          }
        },


        async unbindLocalFile() {
          const conf = await this.showConfirm({
            title: 'Desvincular Archivo Local',
            message: '¿Deseas desvincular el archivo local de este dispositivo?\n\nEsto detendrá las peticiones de permiso al guardar y no afectará tus datos ni a Google Drive.',
            confirmText: 'Desvincular',
            cancelText: 'Cancelar',
            isDanger: false
          });
          if (!conf) return;
          fileHandle = null;
          await clearStoredFileHandleFromDB();
          updateAutoSaveUI(false);
          this.showToast('Archivo local desvinculado con éxito.', 'info');
        },
        openShortcutsModal() {
          const m = document.getElementById('modalShortcuts');
          if (m) m.classList.remove('hidden');
          const wsList = document.getElementById('modalShortcutsWorkspacesList');
          if (wsList && window.WorkspacesManager) {
            const workspaces = window.WorkspacesManager.getWorkspaces();
            wsList.innerHTML = workspaces.map((ws, idx) => `
              <div class="flex items-center justify-between py-1 border-b border-stone-200/50 dark:border-slate-800/50">
                <span class="text-stone-700 dark:text-slate-300 truncate max-w-[200px] font-medium flex items-center gap-1.5">
                  <span class="w-3.5 h-3.5 text-theme-main">${ws.iconSvg || ''}</span>
                  <span>${ws.name}</span>
                </span>
                <kbd class="kbd px-1.5 py-0.5 rounded font-mono text-[10px] font-bold">${idx + 1}</kbd>
              </div>
            `).join('');
          }
        },
        downloadBackupJson() {
          const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `centro_control_backup_S${state.currentWeek}.json`;
          a.click();
          URL.revokeObjectURL(url);
          this.showToast('Copia de seguridad JSON descargada.', 'success');
        },
        importBackupJson(event) {
          const file = event.target.files[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = (e) => {
            try {
              pushUndo('Restaurar respaldo JSON');
              state = sanitizeState(JSON.parse(e.target.result));
              renderApp();
              saveState();
              app.closeModal('backupModal');
              app.showToast('¡Copia de seguridad restaurada correctamente!', 'success');
            } catch (_) { app.showToast('Archivo JSON inválido.', 'error'); }
          };
          reader.readAsText(file);
        },
        copyStateToClipboard() {
          navigator.clipboard.writeText(JSON.stringify(state))
            .then(() => this.showToast('¡Datos copiados al portapapeles!', 'success'))
            .catch(() => this.showToast('No se pudo acceder al portapapeles.', 'error'));
        },
        async pasteStateFromClipboard() {
          try {
            const txt = await navigator.clipboard.readText();
            if (txt && txt.trim().startsWith('{')) {
              pushUndo('Restaurar datos desde portapapeles');
              state = sanitizeState(JSON.parse(txt));
              renderApp();
              saveState();
              app.closeModal('backupModal');
              this.showToast('¡Datos restaurados desde el portapapeles!', 'success');
              return;
            }
          } catch (_) {}

          const raw = await this.showPrompt({
            title: 'Pegar copia de seguridad JSON',
            message: 'Pega aquí el código JSON para restaurar tus datos:',
            placeholder: '{"weeks": ...}'
          });
          if (raw) {
            try {
              pushUndo('Restaurar datos desde JSON');
              state = sanitizeState(JSON.parse(raw));
              renderApp();
              saveState();
              app.closeModal('backupModal');
              this.showToast('¡Datos restaurados con éxito!', 'success');
            } catch (_) {
              this.showToast('Formato JSON inválido.', 'error');
            }
          }
        },

        async factoryReset() {
          const confirm1 = await this.showConfirm({
            title: 'Restablecer Centro de Control',
            message: '¿Estás completamente seguro de que deseas restablecer TODOS los datos a estado de fábrica?\n\nEsta acción borrará todas tus semanas, gastos, hucha y listas para empezar de cero.',
            confirmText: 'Continuar',
            isDanger: true
          });
          if (!confirm1) return;

          const confirm2 = await this.showPrompt({
            title: 'Confirmación Definitiva',
            message: 'Para confirmar el reinicio completo, escribe la palabra "BORRAR":',
            placeholder: 'BORRAR'
          });
          if (confirm2 !== 'BORRAR') return this.showToast('Reinicio cancelado.', 'info');

          pushUndo('Reinicio a estado de fábrica');
          localStorage.removeItem(STORAGE_KEY);
          state = sanitizeState({});
          renderApp();
          saveState();
          app.closeModal('backupModal');
          this.showToast('¡Aplicación reiniciada a valores de fábrica!', 'success');
        },

        triggerUndo() {
          if (undoStack.length === 0) {
            if (lastDeletedItem) {
              if (lastDeletedItem.type === 'expense') getActiveWeek().expenses.push(lastDeletedItem.item);
              else if (lastDeletedItem.type === 'list') state.lists[lastDeletedItem.cat].push(lastDeletedItem.item);
              lastDeletedItem = null;
              document.getElementById('undoToast').classList.add('hidden');
              renderApp();
              saveState();
              this.showToast('Elemento restaurado', 'info');
              return;
            }
            this.showToast('No hay acciones recientes para deshacer.', 'info');
            return;
          }
          const { actionName, snapshot } = undoStack.pop();
          state = sanitizeState(snapshot);
          renderApp();
          if (window.WorkspacesManager) window.WorkspacesManager.mountActiveWorkspace();
          if (typeof app.applyGridLayout === 'function') app.applyGridLayout();
          renderListsTree();
          saveState();
          const undoToastEl = document.getElementById('undoToast');
          if (undoToastEl) undoToastEl.classList.add('hidden');
          this.showToast(`Deshecho: ${actionName}`, 'info');
        },

        // --- CONFLICTO DE GOOGLE DRIVE ---
        showSyncConflictModal(cloudJson) {
          const localTimeEl = document.getElementById('conflictLocalTime');
          const localWeeksEl = document.getElementById('conflictLocalWeeks');
          const cloudTimeEl = document.getElementById('conflictCloudTime');
          const cloudWeeksEl = document.getElementById('conflictCloudWeeks');
          const badgeEl = document.getElementById('conflictDiffCountBadge');
          const listEl = document.getElementById('conflictDiffsList');

          const lDate = state.updatedAt ? new Date(state.updatedAt).toLocaleString() : 'Reciente';
          const cDate = cloudJson.updatedAt ? new Date(cloudJson.updatedAt).toLocaleString() : 'Reciente';

          const getWeeksArray = (wks) => {
            if (!wks) return [];
            return Array.isArray(wks) ? wks : Object.values(wks);
          };

          const localWeeksArr = getWeeksArray(state.weeks);
          const cloudWeeksArr = getWeeksArray(cloudJson.weeks);

          if (localTimeEl) localTimeEl.textContent = lDate;
          if (localWeeksEl) localWeeksEl.textContent = `${localWeeksArr.length} semanas guardadas`;
          if (cloudTimeEl) cloudTimeEl.textContent = cDate;
          if (cloudWeeksEl) cloudWeeksEl.textContent = `${cloudWeeksArr.length} semanas guardadas`;

          // Generación de vista previa de diferencias clave
          if (listEl) {
            const curWkNum = state.currentWeek || 1;
            const findWeek = (wks, num) => {
              if (!wks) return null;
              if (!Array.isArray(wks)) return wks[num] || null;
              return wks.find(w => w && w.weekNum === num) || null;
            };

            const lw = findWeek(state.weeks, curWkNum) || (localWeeksArr.length > 0 ? localWeeksArr[localWeeksArr.length - 1] : null);
            const cw = findWeek(cloudJson.weeks, curWkNum) || (cloudWeeksArr.length > 0 ? cloudWeeksArr[cloudWeeksArr.length - 1] : null);

            const diffs = [];

            if (localWeeksArr.length !== cloudWeeksArr.length) {
              diffs.push({
                day: 'General',
                concept: 'Total de Semanas',
                localVal: `${localWeeksArr.length} semanas`,
                cloudVal: `${cloudWeeksArr.length} semanas`
              });
            }

            if (lw && cw) {
              const weekLabel = `Semana #${lw.weekNum || curWkNum}`;

              // Comparar días de la semana activa
              const daysLocal = Array.isArray(lw.days) ? lw.days : [];
              const daysCloud = Array.isArray(cw.days) ? cw.days : [];

              DAY_FULL.forEach((dayName, idx) => {
                const ld = daysLocal[idx] || {};
                const cd = daysCloud[idx] || {};

                // 1. Calorías / Nutrición
                const lKcal = Number(ld.nutritionKcal) || 0;
                const cKcal = Number(cd.nutritionKcal) || 0;
                if (lKcal !== cKcal) {
                  diffs.push({
                    day: `${dayName} (${weekLabel})`,
                    concept: 'Calorías (Nutrición)',
                    localVal: lKcal > 0 ? `${lKcal} kcal` : 'Sin registrar (0)',
                    cloudVal: cKcal > 0 ? `${cKcal} kcal` : 'Sin registrar (0)'
                  });
                }

                // 2. Gimnasio
                const lGymSess = Number(ld.gym?.sessions) || 0;
                const cGymSess = Number(cd.gym?.sessions) || 0;
                const lGymType = ld.gym?.s1?.type || (lGymSess > 0 ? `${lGymSess} ses.` : 'Descanso');
                const cGymType = cd.gym?.s1?.type || (cGymSess > 0 ? `${cGymSess} ses.` : 'Descanso');
                if (lGymSess !== cGymSess || (lGymSess > 0 && cGymSess > 0 && lGymType !== cGymType)) {
                  diffs.push({
                    day: `${dayName} (${weekLabel})`,
                    concept: 'Entreno Gimnasio',
                    localVal: lGymSess > 0 ? `${lGymType} (${lGymSess}s)` : 'Descanso',
                    cloudVal: cGymSess > 0 ? `${cGymType} (${cGymSess}s)` : 'Descanso'
                  });
                }

                // 3. Running
                const lKm = Number(ld.run?.km) || 0;
                const cKm = Number(cd.run?.km) || 0;
                const lRunType = ld.run?.s1?.type || '';
                const cRunType = cd.run?.s1?.type || '';
                if (lKm !== cKm || (lKm > 0 && cKm > 0 && lRunType !== cRunType)) {
                  diffs.push({
                    day: `${dayName} (${weekLabel})`,
                    concept: 'Running',
                    localVal: lKm > 0 ? `${lKm} km${lRunType ? ' (' + lRunType + ')' : ''}` : 'Sin carrera',
                    cloudVal: cKm > 0 ? `${cKm} km${cRunType ? ' (' + cRunType + ')' : ''}` : 'Sin carrera'
                  });
                }

                // 4. Estudio
                const lStudy = (Array.isArray(lw.studyRealHours) ? Number(lw.studyRealHours[idx]) : 0) || 0;
                const cStudy = (Array.isArray(cw.studyRealHours) ? Number(cw.studyRealHours[idx]) : 0) || 0;
                if (lStudy !== cStudy) {
                  diffs.push({
                    day: `${dayName} (${weekLabel})`,
                    concept: 'Horas de Estudio',
                    localVal: `${lStudy}h`,
                    cloudVal: `${cStudy}h`
                  });
                }

                // 5. Hábitos personalizados
                const allCustomHabits = [...(state.customHabits || []), ...(cloudJson.customHabits || [])];
                const seenHabits = new Set();
                allCustomHabits.forEach(h => {
                  if (!h || !h.id || seenHabits.has(h.id)) return;
                  seenHabits.add(h.id);
                  const lHabVal = (lw.customHabitsData && Array.isArray(lw.customHabitsData[h.id])) ? lw.customHabitsData[h.id][idx] : null;
                  const cHabVal = (cw.customHabitsData && Array.isArray(cw.customHabitsData[h.id])) ? cw.customHabitsData[h.id][idx] : null;

                  if (lHabVal !== cHabVal) {
                    const fmtVal = (v) => {
                      if (v === true) return '✓ Hecho';
                      if (v === null || v === undefined || v === '') return '—';
                      return `${v} ${h.unit || ''}`.trim();
                    };
                    diffs.push({
                      day: `${dayName} (${weekLabel})`,
                      concept: `Hábito: ${h.name || 'Personalizado'}`,
                      localVal: fmtVal(lHabVal),
                      cloudVal: fmtVal(cHabVal)
                    });
                  }
                });
              });

              // 6. Gastos de la semana
              const lExpenses = Array.isArray(lw.expenses) ? lw.expenses : [];
              const cExpenses = Array.isArray(cw.expenses) ? cw.expenses : [];
              const lExpSum = lExpenses.reduce((s, it) => s + (Number(it.amount) || 0), 0);
              const cExpSum = cExpenses.reduce((s, it) => s + (Number(it.amount) || 0), 0);
              if (lExpenses.length !== cExpenses.length || Math.abs(lExpSum - cExpSum) > 0.01) {
                diffs.push({
                  day: weekLabel,
                  concept: 'Gastos de la Semana',
                  localVal: `${lExpenses.length} gastos (${lExpSum.toFixed(2)}€)`,
                  cloudVal: `${cExpenses.length} gastos (${cExpSum.toFixed(2)}€)`
                });
              }
            }

            // Actualizar badge de conteo
            if (badgeEl) {
              badgeEl.textContent = diffs.length === 1 ? '1 diferencia' : `${diffs.length} diferencias`;
              if (diffs.length === 0) {
                badgeEl.className = 'text-[9.5px] font-mono px-2 py-0.5 rounded-full font-bold bg-emerald-950 text-emerald-300 border border-emerald-800';
              } else {
                badgeEl.className = 'text-[9.5px] font-mono px-2 py-0.5 rounded-full font-bold bg-theme-accent-soft text-theme-accent border border-theme-accent/30';
              }
            }

            // Renderizar lista de diferencias
            if (diffs.length === 0) {
              listEl.innerHTML = `
                <div class="p-3 rounded-xl border text-center subpanel-bg space-y-1">
                  <div class="text-emerald-500 font-bold text-xs">✓ Datos de la semana activa idénticos</div>
                  <div class="text-[10px] text-stone-500 dark:text-slate-400">Las diferencias corresponden a sellos de tiempo, metadatos u otras configuraciones. Puedes usar <em>Fusión Inteligente</em> con seguridad.</div>
                </div>
              `;
            } else {
              listEl.innerHTML = diffs.map(d => `
                <div class="p-2.5 rounded-xl border subpanel-bg space-y-1.5 transition hover:border-theme-main/40">
                  <div class="flex items-center justify-between text-[11px] font-bold">
                    <span class="text-stone-800 dark:text-slate-200 flex items-center gap-1.5">
                      <span class="w-1.5 h-1.5 rounded-full bg-theme-accent inline-block"></span>
                      <span>${d.day}</span>
                    </span>
                    <span class="text-[9.5px] font-mono px-1.5 py-0.5 rounded bg-stone-200 dark:bg-slate-800 text-stone-600 dark:text-slate-400 font-normal">${d.concept}</span>
                  </div>
                  <div class="grid grid-cols-2 gap-2 text-[10.5px] pt-0.5">
                    <div class="p-1.5 rounded-lg bg-stone-100 dark:bg-slate-900/60 border border-stone-200 dark:border-slate-800">
                      <span class="text-[9px] uppercase tracking-wider block font-bold text-theme-main">En este equipo:</span>
                      <span class="font-medium text-stone-800 dark:text-slate-200 break-words">${d.localVal}</span>
                    </div>
                    <div class="p-1.5 rounded-lg bg-stone-100 dark:bg-slate-900/60 border border-stone-200 dark:border-slate-800">
                      <span class="text-[9px] uppercase tracking-wider block font-bold text-theme-accent">En Google Drive:</span>
                      <span class="font-medium text-stone-800 dark:text-slate-200 break-words">${d.cloudVal}</span>
                    </div>
                  </div>
                </div>
              `).join('');
            }
          }

          // Resetear vista al abrir el modal de conflicto
          const compView = document.getElementById('conflictComparisonMainView');
          const mergeView = document.getElementById('conflictMergePreviewView');
          const mainActs = document.getElementById('conflictMainActions');
          const mergeActs = document.getElementById('conflictMergeActions');
          if (compView) compView.classList.remove('hidden');
          if (mergeView) mergeView.classList.add('hidden');
          if (mainActs) mainActs.classList.remove('hidden');
          if (mergeActs) mergeActs.classList.add('hidden');

          this.openModal('modalSyncConflict');
        },

        async resolveSyncConflict(action) {
          if (window.resetGdriveSyncLock) window.resetGdriveSyncLock();
          this.closeModal('modalSyncConflict');
          const conflictModal = document.getElementById('modalSyncConflict');
          if (conflictModal) conflictModal.classList.add('hidden');

          if (action === 'upload') {
            if (window.clearPendingCloudConflictJson) window.clearPendingCloudConflictJson();
            this.showToast('Subiendo cambios locales a Google Drive...', 'info');
            const syncFn = (typeof syncGdriveCloud === 'function') ? syncGdriveCloud : window.syncGdriveCloud;
            const res = syncFn ? await syncFn(false, true, false) : null;
            if (res && res.success) {
              this.showToast('Versión local subida a Drive con éxito.', 'success');
            } else {
              this.showToast('Error subiendo a Drive: ' + (res ? res.reason : 'desconocido'), 'error');
            }
          } else if (action === 'download') {
            this.showToast('Cargando versión de Google Drive...', 'info');
            const cloudData = window.getPendingCloudConflictJson ? window.getPendingCloudConflictJson() : (typeof pendingCloudConflictJson !== 'undefined' ? pendingCloudConflictJson : null);
            if (cloudData) {
              const myDevId = (window.getLocalDeviceId) ? window.getLocalDeviceId() : ((typeof getLocalDeviceId === 'function') ? getLocalDeviceId() : (state.deviceId || 'dev_local'));
              const fn = window.applyCloudDownload || (typeof applyCloudDownload === 'function' ? applyCloudDownload : null);
              if (fn) {
                fn(cloudData, Number(cloudData.updatedAt) || Date.now(), myDevId);
              }
              if (window.WorkspacesManager && window.WorkspacesManager.mountActiveWorkspace) {
                try { window.WorkspacesManager.mountActiveWorkspace(); } catch (_) {}
              }
              if (typeof window !== 'undefined' && typeof window.renderApp === 'function') {
                try { window.renderApp(); } catch (_) {}
              }
              this.showToast('Versión de Google Drive cargada correctamente.', 'success');
            } else {
              const syncFn = window.syncGdriveCloud || (typeof syncGdriveCloud === 'function' ? syncGdriveCloud : null);
              const res = syncFn ? await syncFn(true, false, true) : null;
              if (res && res.success) {
                if (window.WorkspacesManager && window.WorkspacesManager.mountActiveWorkspace) {
                  try { window.WorkspacesManager.mountActiveWorkspace(); } catch (_) {}
                }
                if (typeof window !== 'undefined' && typeof window.renderApp === 'function') {
                  try { window.renderApp(); } catch (_) {}
                }
                this.showToast('Versión de Google Drive cargada correctamente.', 'success');
              } else {
                this.showToast('Error cargando versión de Drive: ' + (res ? res.reason : 'desconocido'), 'error');
              }
            }
          } else if (action === 'merge') {
            const conflictJson = window.getPendingCloudConflictJson ? window.getPendingCloudConflictJson() : (typeof pendingCloudConflictJson !== 'undefined' ? pendingCloudConflictJson : null);
            if (!conflictJson) return;
            pushUndo('Fusión inteligente de semanas');
            try {
              localStorage.setItem('centro_control_pre_sync_backup', JSON.stringify(state));
            } catch (_) {}

            const getWeeksArray = (wks) => {
              if (!wks) return [];
              return Array.isArray(wks) ? wks : Object.values(wks);
            };

            const cloudWeeks = getWeeksArray(conflictJson.weeks);
            const localWeeks = getWeeksArray(state.weeks);
            const mergedMap = new Map();

            // Mapear semanas locales
            localWeeks.forEach(w => {
              if (w && w.weekNum !== undefined) mergedMap.set(w.weekNum, w);
            });

            // Comparar con semanas de la nube
            cloudWeeks.forEach(cw => {
              if (!cw || cw.weekNum === undefined) return;
              if (!mergedMap.has(cw.weekNum)) {
                mergedMap.set(cw.weekNum, cw);
              } else {
                const lw = mergedMap.get(cw.weekNum);
                const cTime = cw.closedAt ? new Date(cw.closedAt).getTime() : 0;
                const lTime = lw.closedAt ? new Date(lw.closedAt).getTime() : 0;
                if (cTime > lTime) {
                  mergedMap.set(cw.weekNum, cw);
                }
              }
            });

            const weeksObj = {};
            Array.from(mergedMap.values()).forEach(w => {
              if (w && w.weekNum !== undefined) {
                weeksObj[w.weekNum] = w;
              }
            });
            state.weeks = weeksObj;
            pendingCloudConflictJson = null;
            renderApp();
            saveState();
            await syncGdriveCloud(false, true, false);
            this.showToast('Semanas fusionadas y sincronizadas con éxito.', 'success');
          }
        },

        // --- RESUMEN Y VISTA PREVIA DE FUSIÓN DE DRIVE ---
        previewMergeResult() {
          const conflictData = window.getPendingCloudConflictJson ? window.getPendingCloudConflictJson() : (typeof pendingCloudConflictJson !== 'undefined' ? pendingCloudConflictJson : null);
          if (!conflictData) return;

          const getWeeksArray = (wks) => {
            if (!wks) return [];
            return Array.isArray(wks) ? wks : Object.values(wks);
          };

          const cloudWeeks = getWeeksArray(conflictData.weeks);
          const localWeeks = getWeeksArray(state.weeks);
          const mergedList = [];
          const mergedMap = new Map();

          // Semanas locales
          localWeeks.forEach(w => {
            if (w && w.weekNum !== undefined) {
              mergedMap.set(w.weekNum, { week: w, source: 'local', reason: 'Semana en este equipo' });
            }
          });

          // Semanas de la nube
          cloudWeeks.forEach(cw => {
            if (!cw || cw.weekNum === undefined) return;
            if (!mergedMap.has(cw.weekNum)) {
              mergedMap.set(cw.weekNum, { week: cw, source: 'cloud', reason: 'Nueva (solo existía en Drive)' });
            } else {
              const current = mergedMap.get(cw.weekNum);
              const lw = current.week;
              const cTime = cw.closedAt ? new Date(cw.closedAt).getTime() : 0;
              const lTime = lw.closedAt ? new Date(lw.closedAt).getTime() : 0;
              if (cTime > lTime) {
                mergedMap.set(cw.weekNum, { week: cw, source: 'cloud', reason: 'Versión de Drive más reciente / cerrada' });
              } else {
                current.reason = 'Versión local conservada (más reciente)';
              }
            }
          });

          const sortedWeeks = Array.from(mergedMap.entries()).sort((a, b) => a[0] - b[0]);
          let countLocal = 0;
          let countCloud = 0;

          const listEl = document.getElementById('conflictMergeWeeksList');
          if (listEl) {
            listEl.innerHTML = sortedWeeks.map(([wNum, info]) => {
              const isCloud = info.source === 'cloud';
              if (isCloud) countCloud++; else countLocal++;
              const wObj = info.week;
              const isClosed = !!wObj.isClosed;

              return `
                <div class="p-2 rounded-xl border subpanel-bg flex items-center justify-between gap-2">
                  <div class="flex items-center gap-2 min-w-0">
                    <span class="font-bold text-xs ${isCloud ? 'text-theme-accent' : 'text-theme-main'} shrink-0">Semana #${wNum}</span>
                    <span class="text-[9px] px-1.5 py-0.2 rounded font-mono ${isClosed ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' : 'bg-stone-200 dark:bg-slate-800 text-stone-600 dark:text-slate-300'} shrink-0">${isClosed ? 'Cerrada' : 'Abierta'}</span>
                    <span class="text-[10px] text-stone-500 dark:text-slate-400 truncate">${info.reason}</span>
                  </div>
                  <div class="shrink-0">
                    <span class="text-[9.5px] px-2 py-0.5 rounded-full font-bold ${isCloud ? 'bg-theme-accent-soft text-theme-accent border border-theme-accent/30' : 'bg-theme-soft text-theme-main border border-theme-main/30'}">
                      ${isCloud ? 'Origen: Drive ☁️' : 'Origen: Local 💻'}
                    </span>
                  </div>
                </div>
              `;
            }).join('');
          }

          const badgeEl = document.getElementById('conflictMergeTotalBadge');
          if (badgeEl) {
            badgeEl.textContent = `${sortedWeeks.length} semanas (${countLocal} locales, ${countCloud} de nube)`;
          }

          // Cambiar a la vista de vista previa de fusión
          const compView = document.getElementById('conflictComparisonMainView');
          const mergeView = document.getElementById('conflictMergePreviewView');
          const mainActs = document.getElementById('conflictMainActions');
          const mergeActs = document.getElementById('conflictMergeActions');
          if (compView) compView.classList.add('hidden');
          if (mergeView) mergeView.classList.remove('hidden');
          if (mainActs) mainActs.classList.add('hidden');
          if (mergeActs) mergeActs.classList.remove('hidden');
        },

        cancelMergePreview() {
          const compView = document.getElementById('conflictComparisonMainView');
          const mergeView = document.getElementById('conflictMergePreviewView');
          const mainActs = document.getElementById('conflictMainActions');
          const mergeActs = document.getElementById('conflictMergeActions');
          if (compView) compView.classList.remove('hidden');
          if (mergeView) mergeView.classList.add('hidden');
          if (mainActs) mainActs.classList.remove('hidden');
          if (mergeActs) mergeActs.classList.add('hidden');
        },

        async confirmMergeResult() {
          await this.resolveSyncConflict('merge');
        },
        toggleModule(moduleKey) {
          pushUndo('Alternar módulo nativo');
          if (!state.enabledModules) {
            state.enabledModules = { gym: true, run: true, study: true, academic: true, nutri: true, budget: true };
          }
          const nextVal = !state.enabledModules[moduleKey];
          state.enabledModules[moduleKey] = nextVal;

          // Impactar también en la semana activa actual para reflejo inmediato en el presente
          const curWk = state.weeks[state.currentWeek];
          if (curWk) {
            if (!curWk.enabledModules || typeof curWk.enabledModules !== 'object') {
              curWk.enabledModules = Object.assign({}, state.enabledModules);
            }
            curWk.enabledModules[moduleKey] = nextVal;
          }

          // Si el usuario está viendo otra semana futura abierta, actualizarla también
          const viewWk = state.weeks[state.viewingWeek];
          if (viewWk && viewWk !== curWk && !viewWk.isClosed && viewWk.weekNum > state.currentWeek) {
            if (!viewWk.enabledModules || typeof viewWk.enabledModules !== 'object') {
              viewWk.enabledModules = Object.assign({}, state.enabledModules);
            }
            viewWk.enabledModules[moduleKey] = nextVal;
          }

          renderTab2();
          renderDailyHabits();
          renderHeaderAndKPIs();
          saveState();
          this.showToast(`Módulo ${nextVal ? 'activado' : 'pausado'}.`, 'info');
        },

        async deleteBaseModule(moduleKey, moduleLabel) {
          const confirmed = await this.showConfirm({
            title: 'Quitar Módulo Base',
            message: `¿Deseas quitar el módulo "${moduleLabel}" de la plantilla?\n\nSe pausará y no contará en los KPIs de la semana activa. Siempre podrás restaurarlo cuando quieras.`,
            confirmText: 'Quitar Módulo',
            cancelText: 'Cancelar',
            isDanger: true
          });
          if (!confirmed) return;

          pushUndo(`Quitar módulo base ${moduleLabel}`);
          if (!Array.isArray(state.deletedBaseModules)) state.deletedBaseModules = [];
          if (!state.deletedBaseModules.includes(moduleKey)) {
            state.deletedBaseModules.push(moduleKey);
          }

          if (state.enabledModules) state.enabledModules[moduleKey] = false;
          const curWk = state.weeks[state.currentWeek];
          if (curWk && curWk.enabledModules) curWk.enabledModules[moduleKey] = false;

          renderTab2();
          renderDailyHabits();
          renderHeaderAndKPIs();
          saveState();
          this.showToast(`Módulo "${moduleLabel}" quitado de la plantilla.`, 'info');
        },

        restoreBaseModules() {
          pushUndo('Restaurar módulos base');
          state.deletedBaseModules = [];
          renderTab2();
          renderDailyHabits();
          renderHeaderAndKPIs();
          saveState();
          this.showToast('Módulos base restaurados en la plantilla.', 'success');
        },

        manualQuickSave() {
          saveState();
          if (isGdriveConnected()) {
            this.showToast('💾 Guardando en disco y sincronizando con Google Drive...', 'info', 1800);
            syncGdriveCloud(false, true, false).then(res => {
              if (res && res.success) {
                this.showToast('✓ ¡Datos guardados y subidos a Google Drive!', 'success', 2500);
              } else {
                this.showToast('✓ Guardado local listo (revisa la sesión con Drive).', 'info', 2500);
              }
            });
          } else {
            this.showToast('💾 ¡Datos guardados localmente con éxito! (Ctrl+S)', 'success', 2000);
          }
        },

        onHabitSlotsCountChange(count, existingLabels = []) {
          const container = document.getElementById('habitSlotLabelsContainer');
          const modeLbl = document.getElementById('habitSlotsModeLabel');
          if (!container) return;
          const num = parseInt(count, 10);
          if (isNaN(num) || num <= 1) {
            if (modeLbl) modeLbl.textContent = 'Check Tradicional (1 toma)';
            const singleHourBox = document.getElementById('habitSingleHourBox');
            if (singleHourBox) singleHourBox.classList.remove('hidden');
            container.innerHTML = '';
            return;
          }
          if (modeLbl) modeLbl.textContent = 'Multi-casillas (' + num + ' tomas/día)';
          const singleHourBox = document.getElementById('habitSingleHourBox');
          if (singleHourBox) singleHourBox.classList.add('hidden');

          const currentTyped = [];
          const existingInps = container.querySelectorAll('input[id^="habitSlotLabel_"]');
          existingInps.forEach((inp, idx) => {
            currentTyped[idx] = inp.value;
          });

          const defaultHours = ['09:00', '14:00', '21:00', '18:00', '23:00', '08:00', '12:00', '16:00', '20:00', '22:00'];
          let inputsHtml = '<div class="p-2.5 rounded-xl bg-theme-soft/50 border border-theme space-y-1.5">' +
            '<div class="flex items-center justify-between text-[10.5px] font-bold text-theme-main">' +
              '<span>Horas o Avisos Fijos por Casilla (' + num + ' tomas diarias):</span>' +
              '<span class="text-[9.5px] text-stone-400 font-normal">Sin límite de tomas</span>' +
            '</div>' +
            '<div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">';
          for (let i = 0; i < num; i++) {
            const val = (currentTyped[i] !== undefined && currentTyped[i] !== '') 
              ? currentTyped[i] 
              : ((existingLabels[i] !== undefined && existingLabels[i] !== '') ? existingLabels[i] : (defaultHours[i] || ('Toma ' + (i + 1))));
            inputsHtml += '<div class="space-y-0.5">' +
              '<label class="block text-[9px] font-bold text-stone-500">Casilla #' + (i + 1) + ':</label>' +
              '<input type="text" id="habitSlotLabel_' + i + '" value="' + escapeHtml(val) + '" placeholder="ej: 09:00" class="w-full px-2 py-1 input-bg border rounded-lg font-mono text-center font-bold text-xs focus:border-theme outline-none" />' +
            '</div>';
          }
          inputsHtml += '</div></div>';
          container.innerHTML = inputsHtml;
        },

        toggleHabitActiveDay(dIdx) {
          const inp = document.getElementById('habitActiveDaysInput');
          if (!inp) return;
          let days = [];
          try { days = JSON.parse(inp.value); } catch (_) { days = [0, 1, 2, 3, 4, 5, 6]; }
          if (days.includes(dIdx)) {
            if (days.length > 1) {
              days = days.filter(x => x !== dIdx);
            } else {
              this.showToast('Debe haber al menos 1 día activo.', 'warning');
              return;
            }
          } else {
            days.push(dIdx);
            days.sort((a, b) => a - b);
          }
          inp.value = JSON.stringify(days);

          const btn = document.getElementById('habitDayBtn_' + dIdx);
          if (btn) {
            const isActive = days.includes(dIdx);
            btn.className = 'flex-1 py-1 rounded-lg border font-mono font-bold text-[11px] text-center transition cursor-pointer ' + (isActive ? 'bg-theme-main text-white border-theme shadow-xs' : 'subpanel-bg text-stone-400 hover:border-theme');
          }

          const summaryEl = document.getElementById('habitActiveDaysSummary');
          if (summaryEl) {
            if (days.length === 7) summaryEl.textContent = 'Todos los días (7/7)';
            else if (days.length === 5 && !days.includes(5) && !days.includes(6)) summaryEl.textContent = 'Lunes a Viernes (5/7)';
            else if (days.length === 2 && days.includes(5) && days.includes(6)) summaryEl.textContent = 'Fines de semana (2/7)';
            else {
              const labels = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
              summaryEl.textContent = days.map(d => labels[d]).join(', ') + ' (' + days.length + '/7)';
            }
          }

          const targetDaysInput = document.getElementById('habitTargetWeeklyDays');
          if (targetDaysInput) {
            targetDaysInput.value = days.length;
          }
        },

        toggleCustomHabitCheck(habitId, dayIdx, slotIdx = 0) {
          return this.toggleHabitSlotCheck(dayIdx, habitId, slotIdx);
        },

        toggleHabitSlotCheck(arg1, arg2, slotIdx = 0) {
          let dayIdx, habitId;
          if (typeof arg1 === 'number') {
            dayIdx = arg1;
            habitId = arg2;
          } else {
            habitId = arg1;
            dayIdx = Number(arg2);
          }
          slotIdx = Number(slotIdx) || 0;

          if (state.isReadOnlyLocked) return this.showToast('Semana bloqueada en modo solo lectura.', 'warning');
          playTickSound();
          const w = getActiveWeek();
          if (!w.customHabitsData) w.customHabitsData = {};
          if (!w.customHabitsData[habitId]) w.customHabitsData[habitId] = [null, null, null, null, null, null, null];

          const h = (state.customHabits || []).find(x => x.id === habitId);
          const daySlotsCount = (h && h.dailySlots && Array.isArray(h.dailySlots) && h.dailySlots[dayIdx] !== undefined)
            ? Number(h.dailySlots[dayIdx])
            : (h && Number(h.slotsCount) > 1 ? Number(h.slotsCount) : 1);
          const slotsCount = Math.max(1, daySlotsCount);

          let cur = w.customHabitsData[habitId][dayIdx];
          if (slotsCount <= 1) {
            const isCurrentlyChecked = (cur === true || cur === 1 || cur === 'true' || (Array.isArray(cur) && cur[0]));
            w.customHabitsData[habitId][dayIdx] = isCurrentlyChecked ? null : true;
          } else {
            let slotsArr;
            if (Array.isArray(cur)) {
              slotsArr = [...cur];
            } else if (cur === true || cur === 1 || cur === 'true') {
              slotsArr = Array(slotsCount).fill(true);
            } else {
              slotsArr = Array(slotsCount).fill(false);
            }
            while (slotsArr.length < slotsCount) slotsArr.push(false);
            slotsArr[slotIdx] = !slotsArr[slotIdx];
            w.customHabitsData[habitId][dayIdx] = slotsArr;
          }

          pushUndo('Marcar toma de hábito');
          renderDailyHabits();
          const todayIdx = (new Date().getDay() + 6) % 7;
          const m = calculateWeekMetrics(w);
          const streaks = calculateStreaks(w.weekNum);
          const isOverdue = isWeekOverdue(w.weekNum) && !w.isClosed;
          renderFullWeekTable(isOverdue ? -1 : todayIdx, m, streaks);
          renderHeaderAndKPIs();
          updateHeaderDailyProgress();
          saveState();
        },

        openViewCustomizerModal() {
          this.applyUiPreferences();
          this.openModal('modalViewCustomizer');
        },

        switchViewCustomizerTab(tabKey) {
          const tabs = ['tab1', 'tab2', 'tab3', 'tab4'];
          tabs.forEach(t => {
            const btn = document.getElementById('viewCustomizerTabBtn_' + t);
            const pane = document.getElementById('viewCustomizerPane_' + t);
            const active = (t === tabKey);
            if (btn) {
              if (active) {
                btn.className = 'flex-1 py-1.5 px-1 rounded-lg transition bg-theme-main text-white shadow-xs font-bold text-[11px]';
              } else {
                btn.className = 'flex-1 py-1.5 px-1 rounded-lg transition text-stone-500 hover:text-stone-800 dark:hover:text-white font-bold text-[11px]';
              }
            }
            if (pane) pane.classList.toggle('hidden', !active);
          });
        },

        // ========================================================

        applyUiPreferences() {
          if (!state.uiPreferences) {
            state.uiPreferences = {
              activePreset: 'balanced',
              showSystemBanners: true,
              showOverdueAlert: true,
              showUpcomingMilestone: true,
              showKpis: true,
              showDailyCards: true,
              showWeekMatrix: true,
              showRecentExpenses: true,
              showListsPanel: true,
              showMiniCalendar: true,
              showDocks: true,
              tab2ShowGoals: true,
              tab2ShowSchedule: true,
              tab2ShowAttendance: true,
              tab3ShowBudget: true,
              tab3ShowSavingsGoals: true,
              tab3ShowPiggy: true,
              tab3ShowFixedExpenses: true,
              tab3ShowExpensesTable: true,
              tab3ShowExpenseCharts: true,
              tab4ShowStudyAudit: true,
              tab4ShowCustomHabits: true,
              tab4ShowBiometrics: true,
              tab4ShowEvolution: true,
              density: 'cozy',
              kpisCollapsed: true,
              welcomeDismissed: false
            };
          }
          const p = state.uiPreferences;

          // ---------------------------------------------------------
          // BANNERS SUPERIORES CON COMPROBACIÓN DE SESIÓN Y PREFERENCIAS
          // ---------------------------------------------------------
          const allowSysBanners = (p.showSystemBanners !== false);
          const histBanner = document.getElementById('historicalBanner');
          if (histBanner) {
            if (!allowSysBanners || app.isBannerDismissed('historicalBanner') || !state.isHistoricalMode) {
              histBanner.classList.add('hidden');
            }
          }

          const pendBanner = document.getElementById('pendingWeekCloseBanner');
          if (pendBanner) {
            if (!allowSysBanners || app.isBannerDismissed('pendingWeekCloseBanner')) {
              pendBanner.classList.add('hidden');
            }
          }

          const welcBanner = document.getElementById('welcomeNewUserBanner');
          if (welcBanner) {
            if (!allowSysBanners || p.welcomeDismissed === true || app.isBannerDismissed('welcomeNewUserBanner')) {
              welcBanner.classList.add('hidden');
            }
          }

          const overdueBanner = document.getElementById('overdueMilestonesAlertBanner');
          if (overdueBanner) {
            if (p.showOverdueAlert === false || app.isBannerDismissed('overdueMilestonesAlertBanner')) {
              overdueBanner.classList.add('hidden');
            }
          }

          const featBanner = document.getElementById('featuredMilestoneBanner');
          if (featBanner) {
            if (p.showUpcomingMilestone === false || app.isBannerDismissed('featuredMilestoneBanner')) {
              featBanner.classList.add('hidden');
            }
          }

          const bannersWrap = document.getElementById('topBannersWrapper');
          if (bannersWrap) {
            if (!allowSysBanners && p.showOverdueAlert === false && p.showUpcomingMilestone === false) {
              bannersWrap.classList.add('hidden');
            } else {
              bannersWrap.classList.remove('hidden');
            }
          }

          // ---------------------------------------------------------
          // TAB 1: KPIS SUPERIORES & BARRA FINA
          // ---------------------------------------------------------
          const kpisWrap = document.getElementById('topKpisWrapper');
          if (kpisWrap) {
            kpisWrap.classList.toggle('hidden', p.showKpis === false);
          }
          const kpisBody = document.getElementById('kpisCollapsibleBody');
          const kpisTxt = document.getElementById('kpisSlimStatusText');
          const kpisArrow = document.getElementById('kpisSlimArrow');
          if (kpisBody) {
            const isColl = p.kpisCollapsed !== false;
            kpisBody.classList.toggle('hidden', isColl);
            if (kpisTxt) kpisTxt.textContent = isColl ? 'Mostrar' : 'Plegar';
            if (kpisArrow) kpisArrow.textContent = isColl ? '▼' : '▲';
          }

          // ---------------------------------------------------------
          // TAB 1: REEQUILIBRIO DINÁMICO DE PANELES Y COLUMNAS
          // ---------------------------------------------------------
          this.rebalanceTab1Layout();

          // ---------------------------------------------------------
          // TAB 1 / GLOBAL: DOCKS FLOTANTES
          // ---------------------------------------------------------
          const floatingDock = document.getElementById('floatingDock');
          if (floatingDock) {
            floatingDock.classList.toggle('hidden', p.showDocks === false);
            floatingDock.style.display = (p.showDocks === false) ? 'none' : '';
          }

          // ---------------------------------------------------------
          // TAB 2: SECCIONES DE METAS Y HORARIO (100% ANCHO FLUIDO)
          // ---------------------------------------------------------
          const t2Goals = document.getElementById('tab2ModularHabitsSection');
          if (t2Goals) t2Goals.classList.toggle('hidden', p.tab2ShowGoals === false);

          const t2Schedule = document.getElementById('tab2ScheduleSection');
          if (t2Schedule) t2Schedule.classList.toggle('hidden', p.tab2ShowSchedule === false);

          const t2Att = document.getElementById('tab2AttendanceRulesSection');
          if (t2Att) t2Att.classList.toggle('hidden', p.tab2ShowAttendance === false);

          // ---------------------------------------------------------
          // TAB 3: SECCIONES DE FINANZAS CON AUTO-EXPANSIÓN 100% (SIN HUECOS BLANCOS)
          // ---------------------------------------------------------
          const t3Budget = document.getElementById('tab3BudgetConfigCard');
          const t3Savings = document.getElementById('tab3SavingsGoalsCard');

          const bVisible = (p.tab3ShowBudget !== false);
          const sVisible = (p.tab3ShowSavingsGoals !== false);

          if (t3Budget) {
            t3Budget.classList.toggle('hidden', !bVisible);
            t3Budget.classList.remove('lg:col-span-6', 'lg:col-span-12');
            t3Budget.classList.add(!sVisible ? 'lg:col-span-12' : 'lg:col-span-6');
          }
          if (t3Savings) {
            t3Savings.classList.toggle('hidden', !sVisible);
            t3Savings.classList.remove('lg:col-span-6', 'lg:col-span-12');
            t3Savings.classList.add(!bVisible ? 'lg:col-span-12' : 'lg:col-span-6');
          }

          const t3Fixed = document.getElementById('tab3FixedExpensesCard');
          const t3Table = document.getElementById('tab3ExpensesTableCard');

          const fVisible = (p.tab3ShowFixedExpenses !== false);
          const expTVisible = (p.tab3ShowExpensesTable !== false);

          if (t3Fixed) {
            t3Fixed.classList.toggle('hidden', !fVisible);
            t3Fixed.classList.remove('lg:col-span-6', 'lg:col-span-12');
            t3Fixed.classList.add(!expTVisible ? 'lg:col-span-12' : 'lg:col-span-6');
          }
          if (t3Table) {
            t3Table.classList.toggle('hidden', !expTVisible);
            t3Table.classList.remove('lg:col-span-6', 'lg:col-span-12');
            t3Table.classList.add(!fVisible ? 'lg:col-span-12' : 'lg:col-span-6');
          }

          const t3Piggy = document.getElementById('tab3PiggyCard');
          if (t3Piggy) t3Piggy.classList.toggle('hidden', p.tab3ShowPiggy === false);

          const t3Charts = document.getElementById('tab3ExpenseChartsSection');
          if (t3Charts) t3Charts.classList.toggle('hidden', p.tab3ShowExpenseCharts === false);

          // ---------------------------------------------------------
          // TAB 4: SECCIONES DE ESTADÍSTICAS
          // ---------------------------------------------------------
          const t4Study = document.getElementById('tab4StudyAuditSection');
          if (t4Study) t4Study.classList.toggle('hidden', p.tab4ShowStudyAudit === false);

          const t4Habits = document.getElementById('tab4CustomHabitsSection');
          if (t4Habits) t4Habits.classList.toggle('hidden', p.tab4ShowCustomHabits === false);

          const t4Anat = document.getElementById('tab4AnatomyCard');
          if (t4Anat) t4Anat.classList.toggle('hidden', p.tab4ShowBiometrics === false);
          const t4Radar = document.getElementById('tab4RunningRadarCard');
          if (t4Radar) t4Radar.classList.toggle('hidden', p.tab4ShowBiometrics === false);

          const t4Evol = document.getElementById('tab4EvolutionSection');
          if (t4Evol) t4Evol.classList.toggle('hidden', p.tab4ShowEvolution === false);

          // ---------------------------------------------------------
          // APLICAR CUADRÍCULA TETRIS 12×H AL TABLERO ACTIVO
          // ---------------------------------------------------------
          this.applyGridLayout('tab' + (state.activeTab || 1));
          this.initGridAutoObservers();

          // ---------------------------------------------------------
          // DENSIDAD VISUAL
          // ---------------------------------------------------------
          if (p.density === 'compact') {
            document.documentElement.classList.add('density-compact');
          } else {
            document.documentElement.classList.remove('density-compact');
          }
          const btnCozy = document.getElementById('densityBtnCozy');
          const btnCompact = document.getElementById('densityBtnCompact');
          if (btnCozy && btnCompact) {
            if (p.density === 'compact') {
              btnCompact.className = 'p-2 rounded-lg border-2 border-theme bg-theme-soft font-bold text-center text-xs text-theme-main shadow-xs';
              btnCozy.className = 'p-2 rounded-lg border subpanel-bg font-semibold text-center text-xs text-stone-500 hover:border-theme';
            } else {
              btnCozy.className = 'p-2 rounded-lg border-2 border-theme bg-theme-soft font-bold text-center text-xs text-theme-main shadow-xs';
              btnCompact.className = 'p-2 rounded-lg border subpanel-bg font-semibold text-center text-xs text-stone-500 hover:border-theme';
            }
          }

          // Highlight active preset button
          const activePre = p.activePreset || 'balanced';
          ['focus', 'balanced', 'pro'].forEach(pre => {
            const el = document.getElementById('presetBtn_' + pre);
            if (el) {
              if (pre === activePre) {
                el.className = 'p-2 rounded-xl border-2 border-theme bg-theme-soft font-bold text-center transition flex flex-col items-center justify-center gap-1 cursor-pointer shadow-xs text-theme-main';
              } else {
                el.className = 'p-2 rounded-xl border subpanel-bg text-center transition flex flex-col items-center justify-center gap-1 cursor-pointer hover:border-theme opacity-80';
              }
            }
          });

          // ---------------------------------------------------------
          // SINCRONIZAR CHECKBOXES DEL MODAL
          // ---------------------------------------------------------
          const syncCheck = (id, val) => {
            const chk = document.getElementById(id);
            if (chk) chk.checked = (val !== false);
          };
          syncCheck('prefShowSystemBanners', p.showSystemBanners);
          syncCheck('prefShowOverdueAlert', p.showOverdueAlert);
          syncCheck('prefShowUpcomingMilestone', p.showUpcomingMilestone);

          syncCheck('prefShowKpis', p.showKpis);
          syncCheck('prefShowDailyCards', p.showDailyCards);
          syncCheck('prefShowWeekMatrix', p.showWeekMatrix);
          syncCheck('prefShowRecentExpenses', p.showRecentExpenses);
          syncCheck('prefShowListsPanel', p.showListsPanel);
          syncCheck('prefShowMiniCalendar', p.showMiniCalendar);
          syncCheck('prefShowDocks', p.showDocks);

          syncCheck('prefTab2ShowGoals', p.tab2ShowGoals);
          syncCheck('prefTab2ShowSchedule', p.tab2ShowSchedule);
          syncCheck('prefTab2ShowAttendance', p.tab2ShowAttendance);

          syncCheck('prefTab3ShowBudget', p.tab3ShowBudget);
          syncCheck('prefTab3ShowSavingsGoals', p.tab3ShowSavingsGoals);
          syncCheck('prefTab3ShowPiggy', p.tab3ShowPiggy);
          syncCheck('prefTab3ShowFixedExpenses', p.tab3ShowFixedExpenses);
          syncCheck('prefTab3ShowExpensesTable', p.tab3ShowExpensesTable);
          syncCheck('prefTab3ShowExpenseCharts', p.tab3ShowExpenseCharts);

          syncCheck('prefTab4ShowStudyAudit', p.tab4ShowStudyAudit);
          syncCheck('prefTab4ShowCustomHabits', p.tab4ShowCustomHabits);
          syncCheck('prefTab4ShowBiometrics', p.tab4ShowBiometrics);
          syncCheck('prefTab4ShowEvolution', p.tab4ShowEvolution);
        },

        scrollToToday() {
          const el = document.getElementById('todayFocusContainer');
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            this.showToast('Enfocando panel de hoy.', 'info', 1200);
          }
        },

        openManageHabitsModal() {
          this.resetHabitForm();
          this.renderCustomHabitsList();
          this.openModal('modalManageHabits');
        },



        toggleDailySlotsCustom(isChecked) {
          const row = document.getElementById('habitDailySlotsInputsRow');
          const actDaysBox = document.getElementById('habitActiveDaysStandardBox');
          const hourBox = document.getElementById('habitSingleHourBox');
          const modeLabel = document.getElementById('habitSlotsModeLabel');

          if (row) row.classList.toggle('hidden', !isChecked);
          if (actDaysBox) actDaysBox.classList.toggle('hidden', isChecked);
          if (hourBox) hourBox.classList.toggle('hidden', isChecked);

          if (modeLabel) {
            modeLabel.textContent = isChecked ? 'Casillas Variables por Día (L – D)' : 'Check Tradicional (1 toma)';
          }

          if (isChecked) {
            const slotsCount = Math.max(1, parseInt(document.getElementById('habitSlotsCount')?.value, 10) || 1);
            for (let d = 0; d < 7; d++) {
              const inp = document.getElementById('habitDailySlot_' + d);
              if (inp && (!inp.value || inp.value === '0')) {
                inp.value = slotsCount;
              }
            }
          }
        },

        onHabitTypeChange(type, currentValues = {}) {
          const box = document.getElementById('habitParamsBox');
          if (!box) return;

          if (type === 'max_limit') {
            box.innerHTML = `
              <div class="space-y-1">
                <label class="block text-[10px] font-bold text-slate-400 uppercase">Tope Diario Máximo:</label>
                <input id="habitTargetDaily" type="number" step="0.1" value="${currentValues.targetDaily !== undefined ? currentValues.targetDaily : '1.0'}" required class="w-full px-2.5 py-1.5 input-bg border rounded-xl font-bold font-mono focus:border-theme outline-none" />
              </div>
              <div class="space-y-1">
                <label class="block text-[10px] font-bold text-slate-400 uppercase">Tope Semanal Máximo:</label>
                <input id="habitTargetWeekly" type="number" step="0.5" value="${currentValues.targetWeekly !== undefined ? currentValues.targetWeekly : '7.0'}" required class="w-full px-2.5 py-1.5 input-bg border rounded-xl font-bold font-mono focus:border-theme outline-none" />
              </div>
              <div class="space-y-1">
                <label class="block text-[10px] font-bold text-slate-400 uppercase">Unidad de Medida:</label>
                <input id="habitUnit" type="text" value="${currentValues.unit !== undefined ? currentValues.unit : 'h'}" placeholder="ej: h, min, veces" class="w-full px-2.5 py-1.5 input-bg border rounded-xl font-bold focus:border-theme outline-none" />
              </div>
            `;
          } else if (type === 'min_accum') {
            box.innerHTML = `
              <div class="space-y-1">
                <label class="block text-[10px] font-bold text-slate-400 uppercase">Meta Mínima Semanal:</label>
                <input id="habitTargetWeekly" type="number" step="0.5" value="${currentValues.targetWeekly !== undefined ? currentValues.targetWeekly : '15'}" required class="w-full px-2.5 py-1.5 input-bg border rounded-xl font-bold font-mono focus:border-theme outline-none" />
              </div>
              <div class="space-y-1">
                <label class="block text-[10px] font-bold text-slate-400 uppercase">Unidad de Medida:</label>
                <input id="habitUnit" type="text" value="${currentValues.unit !== undefined ? currentValues.unit : 'págs'}" placeholder="ej: págs, min, L" class="w-full px-2.5 py-1.5 input-bg border rounded-xl font-bold focus:border-theme outline-none" />
              </div>
              <div class="space-y-1">
                <label class="block text-[10px] font-bold text-slate-400 uppercase">Meta Diaria Ref.:</label>
                <input id="habitTargetDaily" type="number" step="0.5" value="${currentValues.targetDaily !== undefined ? currentValues.targetDaily : '20'}" class="w-full px-2.5 py-1.5 input-bg border rounded-xl font-bold font-mono focus:border-theme outline-none" />
              </div>
            `;
          } else if (type === 'binary_check') {
            const currentSlots = (currentValues.slotsCount !== undefined && currentValues.slotsCount !== null) ? Math.max(1, Number(currentValues.slotsCount)) : 1;
            const currentDays = currentValues.targetWeeklyDays !== undefined ? currentValues.targetWeeklyDays : '7';
            const currentHour = currentValues.fixedHour || (currentValues.slotLabels && currentValues.slotLabels[0]) || '';
            const activeDays = Array.isArray(currentValues.activeDays) ? currentValues.activeDays : [0, 1, 2, 3, 4, 5, 6];
            const daysLetters = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
            const daysNames = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
            const hasCustomDaily = !!(currentValues.dailySlots && Array.isArray(currentValues.dailySlots));
            const rawDailySlots = hasCustomDaily ? currentValues.dailySlots : [currentSlots, currentSlots, currentSlots, currentSlots, currentSlots, currentSlots, currentSlots];

            box.innerHTML = `
              <div class="space-y-1">
                <label class="block text-[10px] font-bold text-slate-400 uppercase">Tomas habituales / día:</label>
                <input id="habitSlotsCount" type="number" min="1" step="1" value="${currentSlots}" oninput="app.onHabitSlotsCountChange(this.value)" onchange="app.onHabitSlotsCountChange(this.value)" class="w-full px-2.5 py-1.5 input-bg border rounded-xl font-bold font-mono focus:border-theme outline-none" placeholder="1 = Sí/No tradicional" />
              </div>
              <div class="space-y-1">
                <label class="block text-[10px] font-bold text-slate-400 uppercase">Días Meta por Semana:</label>
                <input id="habitTargetWeeklyDays" type="number" min="1" max="7" step="1" value="${currentDays}" required class="w-full px-2.5 py-1.5 input-bg border rounded-xl font-bold font-mono focus:border-theme outline-none" />
              </div>
              <div class="space-y-1">
                <label class="block text-[10px] font-bold text-slate-400 uppercase">Modalidad:</label>
                <div id="habitSlotsModeLabel" class="py-2 text-[11px] font-semibold text-theme-main">${currentSlots > 1 ? `Multi-casillas (${currentSlots} tomas)` : 'Check Tradicional (1 toma)'}</div>
              </div>

              <!-- Selector de Casillas Personalizadas por Día (L, M, X, J, V, S, D) -->
              <div class="col-span-1 sm:col-span-3 p-3 rounded-xl bg-theme-soft/30 border border-theme space-y-2">
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-1.5">
                    <span class="text-xs">💊</span>
                    <span class="text-[11px] font-bold text-stone-900 dark:text-white">Casillas Variables por Día (L - D):</span>
                  </div>
                  <label class="inline-flex items-center gap-1.5 text-[10px] text-stone-600 dark:text-slate-300 font-bold cursor-pointer">
                    <input type="checkbox" id="habitUseDailySlots" onchange="app.toggleDailySlotsCustom(this.checked)" ${hasCustomDaily ? 'checked' : ''} class="w-3.5 h-3.5 accent-theme" />
                    <span>Personalizar por día</span>
                  </label>
                </div>
                
                <div id="habitDailySlotsInputsRow" class="${hasCustomDaily ? '' : 'hidden'} pt-1">
                  <div class="grid grid-cols-7 gap-1 text-center">
                    ${daysLetters.map((d, dIdx) => `
                      <div class="p-1 rounded-lg subpanel-bg border space-y-1">
                        <span class="block text-[10px] font-bold text-stone-500 font-mono">${d}</span>
                        <input type="number" min="0" max="20" id="habitDailySlot_${dIdx}" value="${rawDailySlots[dIdx] !== undefined ? rawDailySlots[dIdx] : currentSlots}" class="w-full py-1 text-center font-mono font-bold text-xs input-bg border rounded-lg focus:border-theme outline-none" title="${daysNames[dIdx]}" />
                      </div>
                    `).join('')}
                  </div>
                  <span class="block text-[9.5px] text-stone-500 dark:text-slate-400 mt-1.5 italic">Define cuántas casillas tendrá cada día (0 = día de descanso sin tomas).</span>
                </div>
              </div>

              <!-- Días de la Semana Activos -->
              <div id="habitActiveDaysStandardBox" class="${hasCustomDaily ? 'hidden' : ''} col-span-1 sm:col-span-3 p-2.5 rounded-xl bg-theme-soft/40 border border-theme space-y-1.5">
                <div class="flex items-center justify-between text-[10px] font-bold text-stone-700 dark:text-slate-200">
                  <span>📅 Días de la semana en que aplica:</span>
                  <span id="habitActiveDaysSummary" class="text-[9.5px] font-mono text-theme-main font-bold">${activeDays.length === 7 ? 'Todos los días (7/7)' : activeDays.length + ' días seleccionados'}</span>
                </div>
                <div class="flex items-center gap-1.5">
                  ${daysLetters.map((d, dIdx) => {
                    const isActive = activeDays.includes(dIdx);
                    return `
                      <button type="button" onclick="app.toggleHabitActiveDay(${dIdx})" id="habitDayBtn_${dIdx}" class="flex-1 py-1 rounded-lg border font-mono font-bold text-[11px] text-center transition cursor-pointer ${isActive ? 'bg-theme-main text-white border-theme shadow-xs' : 'subpanel-bg text-stone-400 hover:border-theme'}">
                        ${d}
                      </button>
                    `;
                  }).join('')}
                </div>
                <input type="hidden" id="habitActiveDaysInput" value='${JSON.stringify(activeDays)}' />
              </div>

              <!-- Hora / Aviso Fijo para Check Tradicional (si slotsCount === 1) -->
              <div id="habitSingleHourBox" class="${currentSlots > 1 || hasCustomDaily ? 'hidden' : ''} col-span-1 sm:col-span-3 p-2.5 rounded-xl subpanel-bg border space-y-1">
                <div class="flex items-center justify-between">
                  <label class="block text-[10px] font-bold text-stone-700 dark:text-slate-200 uppercase">⏰ Hora o Aviso Fijo (Opcional):</label>
                  <span class="text-[9.5px] text-stone-400">Visible fijo en la matriz cada día</span>
                </div>
                <input type="text" id="habitFixedHour" value="${currentHour}" placeholder="ej: 08:30 o En ayunas" class="w-full px-2.5 py-1.5 input-bg border rounded-xl font-bold text-xs focus:border-theme outline-none" />
              </div>

              <!-- Etiquetas / Horas individuales por Casilla (si slotsCount > 1) -->
              <div id="habitMultiSlotLabelsBox" class="${currentSlots > 1 ? '' : 'hidden'} col-span-1 sm:col-span-3 p-2.5 rounded-xl subpanel-bg border space-y-2">
                <div class="flex items-center justify-between">
                  <label class="block text-[10px] font-bold text-stone-700 dark:text-slate-200 uppercase">⏰ Horas o Notas fijas por casilla:</label>
                  <span class="text-[9.5px] text-stone-400">Fijas cada día en cada casilla</span>
                </div>
                <div id="habitSlotsLabelsInputs" class="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  ${Array.from({ length: currentSlots }).map((_, sIdx) => {
                    const labelVal = (currentValues.slotLabels && currentValues.slotLabels[sIdx]) || '';
                    return `
                      <div class="space-y-0.5">
                        <label class="block text-[9px] font-mono text-stone-500 dark:text-slate-400 uppercase">Casilla #${sIdx + 1}:</label>
                        <input type="text" id="habitSlotLabel_${sIdx}" value="${labelVal}" placeholder="ej: ${sIdx === 0 ? '08:00' : (sIdx === 1 ? '14:00' : '21:00')}" class="w-full px-2 py-1 input-bg border rounded-lg font-bold text-xs focus:border-theme outline-none" />
                      </div>
                    `;
                  }).join('')}
                </div>
              </div>
            `;
          } else if (type === 'target_range') {
            box.innerHTML = `
              <div class="space-y-1">
                <label class="block text-[10px] font-bold text-slate-400 uppercase">Valor Diana Óptimo:</label>
                <input id="habitTargetCenter" type="number" step="1" value="${currentValues.targetCenter !== undefined ? currentValues.targetCenter : '8'}" required class="w-full px-2.5 py-1.5 input-bg border rounded-xl font-bold font-mono focus:border-theme outline-none" />
              </div>
              <div class="space-y-1">
                <label class="block text-[10px] font-bold text-slate-400 uppercase">Margen Aceptable (±):</label>
                <input id="habitTargetMargin" type="number" step="0.5" value="${currentValues.targetMargin !== undefined ? currentValues.targetMargin : '0.5'}" required class="w-full px-2.5 py-1.5 input-bg border rounded-xl font-bold font-mono focus:border-theme outline-none" />
              </div>
              <div class="space-y-1">
                <label class="block text-[10px] font-bold text-slate-400 uppercase">Días Meta Semanales:</label>
                <input id="habitTargetWeeklyDays" type="number" min="1" max="7" step="1" value="${currentValues.targetWeeklyDays !== undefined ? currentValues.targetWeeklyDays : '6'}" required class="w-full px-2.5 py-1.5 input-bg border rounded-xl font-bold font-mono focus:border-theme outline-none" />
              </div>
            `;
          }
        },

        saveCustomHabit() {
          const editId = document.getElementById('habitEditId')?.value || '';
          const name = document.getElementById('habitNameInput')?.value.trim();
          if (!name) return;
          const type = document.getElementById('habitTypeSelect')?.value || 'max_limit';
          const icon = document.getElementById('habitIconInput')?.value || 'star';
          const emoji = document.getElementById('habitEmojiInput')?.value || '⭐';
          const isReminderOnly = !!document.getElementById('habitIsReminderOnly')?.checked;

          if (!state.customHabits) state.customHabits = [];

          let habitData = {
            id: editId || 'h_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
            name,
            type,
            icon,
            iconId: icon,
            emoji,
            active: true,
            isReminderOnly
          };

          if (type === 'max_limit') {
            habitData.targetDaily = Number(document.getElementById('habitTargetDaily')?.value) || 1.0;
            habitData.targetWeekly = Number(document.getElementById('habitTargetWeekly')?.value) || 7.0;
            habitData.unit = document.getElementById('habitUnit')?.value.trim() || 'h';
          } else if (type === 'min_accum') {
            habitData.targetWeekly = Number(document.getElementById('habitTargetWeekly')?.value) || 10;
            habitData.targetDaily = Number(document.getElementById('habitTargetDaily')?.value) || 1.0;
            habitData.unit = document.getElementById('habitUnit')?.value.trim() || 'u';
          } else if (type === 'binary_check') {
            const useDailySlots = !!document.getElementById('habitUseDailySlots')?.checked;
            if (useDailySlots) {
              const dSlots = [];
              for (let d = 0; d < 7; d++) {
                const el = document.getElementById('habitDailySlot_' + d);
                dSlots.push(el ? Math.max(0, parseInt(el.value, 10) || 0) : 1);
              }
              habitData.dailySlots = dSlots;
              habitData.slotsCount = Math.max(...dSlots, 1);
              habitData.activeDays = dSlots.map((s, idx) => s > 0 ? idx : -1).filter(idx => idx !== -1);
            } else {
              habitData.slotsCount = Math.max(1, parseInt(document.getElementById('habitSlotsCount')?.value, 10) || 1);
              try {
                const activeDaysStr = document.getElementById('habitActiveDaysInput')?.value;
                habitData.activeDays = activeDaysStr ? JSON.parse(activeDaysStr) : [0, 1, 2, 3, 4, 5, 6];
              } catch (e) {
                habitData.activeDays = [0, 1, 2, 3, 4, 5, 6];
              }
            }
            habitData.targetWeeklyDays = Math.max(1, parseInt(document.getElementById('habitTargetWeeklyDays')?.value, 10) || 7);
            
            if (habitData.slotsCount > 1) {
              const labels = [];
              for (let i = 0; i < habitData.slotsCount; i++) {
                const lEl = document.getElementById('habitSlotLabel_' + i);
                labels.push(lEl ? lEl.value.trim() : '');
              }
              habitData.slotLabels = labels;
              habitData.fixedHour = labels[0] || '';
            } else {
              habitData.fixedHour = document.getElementById('habitFixedHour')?.value.trim() || '';
              habitData.slotLabels = [habitData.fixedHour];
            }
          } else if (type === 'target_range') {
            habitData.targetCenter = Number(document.getElementById('habitTargetCenter')?.value) || 8.0;
            habitData.targetMargin = Number(document.getElementById('habitTargetMargin')?.value) || 1.0;
            habitData.targetWeeklyDays = Math.max(1, parseInt(document.getElementById('habitTargetWeeklyDays')?.value, 10) || 6);
            habitData.unit = document.getElementById('habitUnit')?.value.trim() || 'h';
          }

          if (editId) {
            const idx = state.customHabits.findIndex(h => h.id === editId);
            if (idx !== -1) {
              state.customHabits[idx] = Object.assign({}, state.customHabits[idx], habitData);
            }
            this.showToast('Hábito actualizado correctamente.', 'success', 1500);
          } else {
            state.customHabits.push(habitData);
            this.showToast('Nuevo hábito creado correctamente.', 'success', 1500);
          }

          this.resetHabitForm();
          this.renderCustomHabitsList();
          renderDailyHabits();
          renderTab2();
          renderHeaderAndKPIs();
          updateHeaderDailyProgress();
          saveState();
        },

        editCustomHabit(id) {
          const h = (state.customHabits || []).find(item => item.id === id);
          if (!h) return;
          const editIdEl = document.getElementById('habitEditId');
          const nameEl = document.getElementById('habitNameInput');
          const typeEl = document.getElementById('habitTypeSelect');
          const cancelBtn = document.getElementById('habitCancelEditBtn');
          const submitBtn = document.getElementById('habitSubmitBtn');
          const remChk = document.getElementById('habitIsReminderOnly');

          if (editIdEl) editIdEl.value = h.id;
          if (nameEl) nameEl.value = h.name;
          if (typeEl) typeEl.value = h.type;
          if (cancelBtn) cancelBtn.classList.remove('hidden');
          if (submitBtn) submitBtn.textContent = 'Actualizar Hábito';
          if (remChk) remChk.checked = !!h.isReminderOnly;

          const iconInput = document.getElementById('habitIconInput');
          const emojiInput = document.getElementById('habitEmojiInput');
          const previewEl = document.getElementById('habitIconPreview');
          if (iconInput) iconInput.value = h.icon || 'star';
          if (emojiInput) emojiInput.value = h.emoji || '⭐';
          if (previewEl) previewEl.innerHTML = typeof renderItemIcon === 'function' ? renderItemIcon(h.icon || 'star', 'w-5 h-5 text-theme-main') : (h.emoji || '⭐');

          this.onHabitTypeChange(h.type, h);
          const form = document.getElementById('customHabitForm');
          if (form) form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        },

        resetHabitForm() {
          const form = document.getElementById('customHabitForm');
          if (form) form.reset();
          const editIdEl = document.getElementById('habitEditId');
          const titleEl = document.getElementById('habitModalTitle');
          const cancelBtn = document.getElementById('habitCancelEditBtn');
          const submitBtn = document.getElementById('habitSubmitBtn');
          const remChk = document.getElementById('habitIsReminderOnly');
          const nameInp = document.getElementById('habitNameInput');
          if (editIdEl) editIdEl.value = '';
          if (titleEl) titleEl.textContent = 'Nuevo Hábito Personalizado';
          if (cancelBtn) cancelBtn.classList.add('hidden');
          if (submitBtn) submitBtn.textContent = 'Guardar Hábito';
          if (remChk) remChk.checked = false;
          if (nameInp) nameInp.value = '';

          const iconInput = document.getElementById('habitIconInput');
          const emojiInput = document.getElementById('habitEmojiInput');
          const previewEl = document.getElementById('habitIconPreview');
          if (iconInput) iconInput.value = 'star';
          if (emojiInput) emojiInput.value = '⭐';
          if (previewEl) previewEl.innerHTML = typeof renderItemIcon === 'function' ? renderItemIcon('star', 'w-5 h-5 text-theme-main') : '⭐';

          const typeEl = document.getElementById('habitTypeSelect');
          if (typeEl) {
            typeEl.value = 'max_limit';
            this.onHabitTypeChange('max_limit');
          }
        },

        async deleteCustomHabit(id) {
          const habit = (state.customHabits || []).find(h => h.id === id);
          if (!habit) return;

          const confirmed = await this.showConfirm({
            title: 'Eliminar Hábito',
            message: `¿Deseas eliminar definitivamente el hábito "${habit.name}"?\n(Los registros de semanas archivadas se conservarán en el historial).`,
            confirmText: 'Eliminar Hábito',
            cancelText: 'Cancelar',
            isDanger: true
          });
          if (!confirmed) return;

          pushUndo('Eliminar hábito personalizado');
          state.customHabits = (state.customHabits || []).filter(h => h.id !== id);
          this.resetHabitForm();
          this.renderCustomHabitsList();
          renderTab2();
          renderDailyHabits();
          renderHeaderAndKPIs();
          saveState();
          this.showToast(`Hábito "${habit.name}" eliminado.`, 'info');
        },

        renderManageHabitsList() {
          return this.renderCustomHabitsList();
        },

        renderCustomHabitsList() {
          const listEl = document.getElementById('customHabitsManagerList');
          if (!listEl) return;
          const habits = state.customHabits || [];
          if (habits.length === 0) {
            listEl.innerHTML = `<span class="text-[11px] text-stone-400 dark:text-slate-500 italic block py-2 text-center">— Sin hábitos personalizados creados aún —</span>`;
            return;
          }

          listEl.innerHTML = habits.map(h => {
            const isActive = h.active !== false;
            let typeLabel = 'Tipo A: Límite Máximo';
            let detail = `Tope: ${h.targetDaily || 1}${h.unit || 'h'}/día`;
            if (h.type === 'min_accum') {
              typeLabel = 'Tipo B: Meta Acumulativa';
              detail = `Meta: ${h.targetWeekly || 10} ${h.unit || ''}/sem`;
            } else if (h.type === 'binary_check') {
              typeLabel = 'Tipo C: Check Diario';
              detail = `Meta: ${h.targetWeeklyDays || 7} días/sem`;
            } else if (h.type === 'target_range') {
              typeLabel = 'Tipo D: Diana Óptima';
              detail = `Diana: ${h.targetCenter || 0} ± ${h.targetMargin || 0} (${h.targetWeeklyDays || 6}d)`;
            }

            return `
              <div data-habit-id="${h.id}" oncontextmenu="app.openCustomHabitActionsMenu(event, '${h.id}'); return false;" class="flex items-center justify-between p-2 rounded-xl subpanel-bg border ${isActive ? 'border-stone-300 dark:border-slate-700' : 'opacity-60 border-dashed'} cursor-pointer">
                <div class="flex items-center gap-2.5 truncate min-w-0">
                  <span class="w-8 h-8 rounded-lg subpanel-bg border border-theme/20 flex items-center justify-center text-theme-main shrink-0">
                    ${renderItemIcon(h.iconId || h.icon || h.emoji || 'star', 'w-4 h-4 text-theme-main')}
                  </span>
                  <div class="truncate">
                    <span class="font-bold block truncate text-stone-900 dark:text-white">${escapeHtml(h.name)}</span>
                    <span class="text-[9.5px] text-stone-500 dark:text-slate-400">${typeLabel} • ${detail}</span>
                  </div>
                </div>
                <div class="flex items-center gap-1 shrink-0 ml-2">
                  <button type="button" onclick="app.toggleCustomHabit('${h.id}')" class="px-2 py-1 rounded-lg text-[10px] font-bold ${isActive ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30' : 'bg-stone-200 dark:bg-slate-800 text-stone-500'}">
                    ${isActive ? 'Activo' : 'Pausado'}
                  </button>
                  <button type="button" onclick="app.editCustomHabit('${h.id}')" class="p-1 rounded-lg hover:bg-stone-200 dark:hover:bg-slate-800 text-stone-500" title="Editar">
                    <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  </button>
                  <button type="button" onclick="app.deleteCustomHabit('${h.id}')" class="p-1 rounded-lg hover:bg-stone-200 dark:hover:bg-slate-800 text-rose-500" title="Eliminar">
                    <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                  </button>
                  <button type="button" onclick="app.openCustomHabitActionsMenu(event, '${h.id}')" oncontextmenu="app.openCustomHabitActionsMenu(event, '${h.id}'); return false;" class="w-6 h-6 rounded-lg subpanel-bg border border-stone-300/60 dark:border-slate-700/60 hover:border-theme-main text-stone-600 dark:text-slate-300 hover:text-stone-900 dark:hover:text-white flex items-center justify-center font-bold text-xs transition shadow-xs" title="Más opciones">•••</button>
                </div>
              </div>
            `;
          }).join('');
        },

        // --- REGISTRO DE DATOS DE HÁBITOS PERSONALIZADOS EN EL DÍA ---
        setHabitDayValue(dayIdx, habitId, val) {
          if (state.viewingWeek !== state.currentWeek && state.isReadOnlyLocked) return;
          const w = getActiveWeek();
          if (!w.customHabitsData) w.customHabitsData = {};
          if (!Array.isArray(w.customHabitsData[habitId])) {
            w.customHabitsData[habitId] = [null, null, null, null, null, null, null];
          }
          w.customHabitsData[habitId][dayIdx] = val === '' ? null : (isNaN(val) ? val : parseFloat(val));
          renderDailyHabits();
          renderHeaderAndKPIs();
          saveState();
        },

        toggleHabitDayCheck(dayIdx, habitId) {
          if (state.viewingWeek !== state.currentWeek && state.isReadOnlyLocked) return;
          playTickSound();
          const w = getActiveWeek();
          if (!w.customHabitsData) w.customHabitsData = {};
          if (!Array.isArray(w.customHabitsData[habitId])) {
            w.customHabitsData[habitId] = [null, null, null, null, null, null, null];
          }
          const cur = w.customHabitsData[habitId][dayIdx];
          w.customHabitsData[habitId][dayIdx] = cur ? null : true;
          renderDailyHabits();
          renderHeaderAndKPIs();
          saveState();
        },

        toggleWidgetPin(cardId) {
          if (window.GridEngine && window.GridEngine.toggleWidgetPin) return window.GridEngine.toggleWidgetPin(cardId);
          if (window.WorkspacesManager) return window.WorkspacesManager.toggleWidgetPin(cardId);
        },
        toggleCompactMode(cardId) {
          if (window.GridEngine && window.GridEngine.toggleCompactMode) return window.GridEngine.toggleCompactMode(cardId);
          if (window.PolymorphicCards) return window.PolymorphicCards.toggleCompactMode(cardId);
        },
        snapCardToIdeal(cardId) {
          if (window.GridEngine && window.GridEngine.snapCardToIdeal) return window.GridEngine.snapCardToIdeal(cardId);
        },
        sendWidgetToDrawer(cardId) {
          if (window.GridEngine && window.GridEngine.sendWidgetToDrawer) return window.GridEngine.sendWidgetToDrawer(cardId);
        },
        sendWidgetToDock(cardId) {
          if (window.GridEngine && window.GridEngine.sendWidgetToDock) return window.GridEngine.sendWidgetToDock(cardId);
        }
      };

      function showUndoToast(msg) {
        const toast = document.getElementById('undoToast');
        document.getElementById('undoToastMessage').textContent = msg;
        toast.classList.remove('hidden');
        clearTimeout(undoTimeout);
        undoTimeout = setTimeout(() => toast.classList.add('hidden'), 5000);
      }

      // ATAJOS DE TECLADO
      window.addEventListener('keydown', (e) => {
        const tag = (e.target.tagName || '').toLowerCase();
        const id = e.target.id || '';

        // Global Ctrl+S / Cmd+S (Guardado manual instantáneo)
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
          e.preventDefault();
          app.manualQuickSave();
          return;
        }

        // Global Ctrl+Z / Cmd+Z (Deshacer)
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
          const isTyping = tag === 'input' || tag === 'textarea';
          if (!isTyping) {
            e.preventDefault();
            app.triggerUndo();
            return;
          }
        }

        if (tag === 'input' || tag === 'select' || tag === 'textarea') {
          if (e.key === 'Escape') {
            e.target.blur();
            app.toggleDockPomo(false);
            app.toggleDockExpense(false);
            app.closeModal('modalEditExpense');
            app.closeModal('modalEditListItem');
            app.closeModal('modalMuscleInspector');
            app.closeModal('modalAddClassSchedule');
            app.closeModal('modalCustomRun');
            app.closeModal('modalSubjectPrompt');
            app.closeModal('modalSubtaskPrompt');
            app.closeModal('modalSubtaskSeriesPrompt');
            app.closeModal('modalSmartDuplicate');
            app.closeModal('modalShortcuts');
          } else if (e.key === 'Enter') {
            if (id === 'quickAmount' || id === 'quickConcept') {
              e.preventDefault();
              app.submitQuickExpense();
            } else if (id === 'dockExpenseAmount' || id === 'dockExpenseConcept') {
              e.preventDefault();
              app.submitDockExpense();
            } else if (id === 'tab3InlineAmount' || id === 'tab3InlineConcept') {
              e.preventDefault();
              app.submitTab3InlineExpense();
            } else if (id === 'newListItemInput' || id === 'newListItemNote') {
              e.preventDefault();
              app.addNewListItem();
            } else if (id.startsWith('editExpense')) {
              e.preventDefault();
              app.saveEditedExpense();
            } else if (id.startsWith('editListItem')) {
              e.preventDefault();
              app.saveEditedListItem();
            }
          }
          return;
        }

        const shortcutsModal = document.getElementById('modalShortcuts');
        const isShortcutsOpen = shortcutsModal && !shortcutsModal.classList.contains('hidden');

        if (!e.ctrlKey && !e.altKey && !e.metaKey && e.key >= '1' && e.key <= '9') {
          if (isShortcutsOpen) app.closeModal('modalShortcuts');
          const targetIdx = parseInt(e.key, 10) - 1;
          if (window.WorkspacesManager && window.WorkspacesManager.switchWorkspaceByIndex) {
            window.WorkspacesManager.switchWorkspaceByIndex(targetIdx);
          } else {
            app.switchTab(targetIdx + 1);
          }
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          app.navWeek(-1);
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          app.navWeek(1);
        } else if (e.key.toLowerCase() === 't' && !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          if (isShortcutsOpen) app.closeModal('modalShortcuts');
          app.returnToActiveWeek();
          app.scrollToToday();
        } else if (e.key.toLowerCase() === 'b' && !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          if (isShortcutsOpen) app.closeModal('modalShortcuts');
          app.toggleSidebar();
        } else if (e.key.toLowerCase() === 'e' && !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          if (isShortcutsOpen) app.closeModal('modalShortcuts');
          app.toggleBoardEdit();
        } else if (e.key.toLowerCase() === 'p' && !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          if (isShortcutsOpen) app.closeModal('modalShortcuts');
          app.togglePomo();
        } else if (e.key.toLowerCase() === 'g' && !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          if (isShortcutsOpen) app.closeModal('modalShortcuts');
          app.openManageHabitsModal();
        } else if (e.key.toLowerCase() === 'n' && !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          if (isShortcutsOpen) app.closeModal('modalShortcuts');
          app.toggleDockExpense();
        } else if (e.key.toLowerCase() === 'd' && !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          app.toggleTheme();
        } else if (e.key.toLowerCase() === 'z' && !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          if (isShortcutsOpen) app.closeModal('modalShortcuts');
          if (e.shiftKey) {
            app.toggleDockPomo();
          } else {
            const zenModal = document.getElementById('zenModal');
            const isOpen = zenModal && !zenModal.classList.contains('hidden');
            app.toggleZen(!isOpen);
          }
        } else if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
          e.preventDefault();
          app.openShortcutsModal();
        } else if (e.code === 'Space') {
          if (!document.getElementById('zenModal').classList.contains('hidden')) {
            e.preventDefault();
            app.togglePomo();
          }
        } else if (e.key === 'Escape') {
          if (selectedListItemIds.size > 0 || selectionModeActive) {
            app.clearListSelection();
          }
          app.closeAllContextMenus();
          app.closePiggyModal();
          app.closeModal('modalShortcuts');
          app.closeModal('modalAddFixedItem');
          app.closeModal('modalCustomConfirm');
          app.closeModal('modalCustomPrompt');
          app.closeModal('modalSubjectStudyStats');
          app.closeModal('modalKpi1Blocks');
          app.closeModal('modalKpi3Attendance');
          app.closeModal('modalKpi4Budget');
          app.closeModal('modalBulkEditListItems');
          app.toggleZen(false);
          if (app.closeDockSidebar) app.closeDockSidebar();
          if (app.closeWidgetsDrawer) app.closeWidgetsDrawer();
          if (state.ui && state.ui.isBoardEditMode && app.toggleBoardEdit) {
            app.toggleBoardEdit();
          }
          app.closeModal('closeWeekModal');
          app.closeModal('backupModal');
          app.closeModal('customMuscleModal');
          app.closeModal('modalAddClassSchedule');
          app.closeModal('modalMuscleInspector');
          app.closeModal('modalEditExpense');
          app.closeModal('modalEditListItem');
          app.closeModal('calendarImportModal');
          app.closeModal('modalCustomRun');
          app.closeModal('modalSubjectPrompt');
          app.closeModal('modalSubtaskPrompt');
          app.closeModal('modalSubtaskSeriesPrompt');
          app.closeModal('modalSmartDuplicate');
          app.closePalettePicker();
        }
      });

      // CERRAR MENÚ CONTEXTUAL AL HACER CLIC FUERA
      document.addEventListener('click', (e) => {
        const isActionBtn = e.target.closest('[title="Más opciones"], [title="Más opciones de diseño"]');
        const isAnyMenu = e.target.closest('#listActionMenuPopover, #expenseActionMenuPopover, #habitActionMenuPopover, #classActionMenuPopover, #subjectActionMenuPopover, #workspaceTabActionMenuPopover, #boardCardMenuPopover');
        if (!isActionBtn && !isAnyMenu) {
          app.closeAllContextMenus();
        }

        const palettePopover = document.getElementById('palettePickerPopover');
        if (palettePopover && !palettePopover.classList.contains('hidden')) {
          if (!palettePopover.contains(e.target) && !e.target.closest('#palettePickerBtn')) {
            app.closePalettePicker();
          }
        }
      });

      // CERRAR MENÚS CONTEXTUALES AL HACER CLICK DERECHO FUERA DE ELEMENTOS CONTEXTUALES
      document.addEventListener('contextmenu', (e) => {
        const isContextCard = e.target.closest('[data-item-id], [data-expense-id], [data-habit-id], [data-class-id], [data-subject-id], #workspacesNavBar button, #listActionMenuPopover, #expenseActionMenuPopover, #habitActionMenuPopover, #classActionMenuPopover, #subjectActionMenuPopover, #workspaceTabActionMenuPopover');
        if (!isContextCard) {
          app.closeAllContextMenus();
        }
      });

      // SOPORTE DE RUEDA DE RATÓN EN INPUTS NUMÉRICOS (ENFOCADOS O EN MODO COMPACTO)
      document.addEventListener('wheel', (e) => {
        const target = e.target;
        if (target && target.tagName === 'INPUT' && target.type === 'number') {
          if (document.activeElement === target || target.closest('.card-mode-compact')) {
            e.preventDefault();
            const step = parseFloat(target.step) || 1;
            const min = target.min !== '' ? parseFloat(target.min) : -Infinity;
            const max = target.max !== '' ? parseFloat(target.max) : Infinity;
            let val = parseFloat(target.value) || 0;
            if (e.deltaY < 0) {
              val = Math.min(max, Math.round((val + step) * 100) / 100);
            } else {
              val = Math.max(min, Math.round((val - step) * 100) / 100);
            }
            target.value = val;
            target.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }
      }, { passive: false });

      // INICIALIZADOR ROBUSTO
      Object.assign(window, { app });

      function checkWeekRollover() {
        const curWk = state.weeks[state.currentWeek];
        const overdue = isWeekOverdue(state.currentWeek);
        if (overdue && (!curWk || !curWk.isClosed)) {
          // Si la semana activa ya venció, abrir el modal de cerrar semana
          setTimeout(() => {
            const closeModalEl = document.getElementById('closeWeekModal');
            if (closeModalEl && closeModalEl.classList.contains('hidden')) {
              app.openCloseWeekModal();
            }
          }, 450);
        }
      };
      Object.assign(app, GridEngine);
      window.app = app;

      function boot() {
        loadState();
        // Limpieza de banners cerrados persistidos en sesiones previas para que reaparezcan al recargar si hay tareas pendientes
        if (state && state.ui && state.ui.dismissedBanners) {
          delete state.ui.dismissedBanners;
        }
        try {
          sessionStorage.removeItem('dismissedBanner_overdueMilestonesAlertBanner');
          sessionStorage.removeItem('dismissedBanner_featuredMilestoneBanner');
        } catch(e) {}
        // Migración de iconos vectoriales SVG para hábitos personalizados
        if (state && Array.isArray(state.customHabits)) {
          state.customHabits.forEach(h => {
            if (!h.iconId && h.icon) h.iconId = h.icon;
            if (!h.icon && h.iconId) h.icon = h.iconId;
          });
        }
        applyAccentPalette(state.themePalette || 'emerald');
        app.switchTab(state.activeTab || 1);
        renderApp();
        app.applyUiPreferences();
        updateHeaderDailyProgress();
        app.applyUiPreferences();
        updateHeaderDailyProgress();
        initAutoSaveDrive();
        updateGdriveUI();
        if (gdriveUserEmail) {
          syncGdriveCloud(true);
        }
        if (typeof checkAndResumePomo === 'function') {
          checkAndResumePomo();
        } else if (state && state.pomo && state.pomo.isRunning) {
          pomoTimerInterval = setInterval(() => {
            syncPomoTime();
          }, 1000);
          syncPomoTime();
          requestPomoWakeLock();
        }
        registerServiceWorker();
        checkWeekRollover();

        // Widget mode removed

        // Mostrar introducción interactiva / onboarding si es un usuario o dispositivo nuevo
        const onboardingShown = localStorage.getItem('centro_onboarding_shown');
        const hasDriveSession = !!localStorage.getItem('gdrive_user_email');
        const weeksCount = Object.keys(state.weeks || {}).length;
        if (!onboardingShown && !hasDriveSession && weeksCount <= 1) {
          setTimeout(() => {
            app.openWelcomeIntroModal();
          }, 400);
        }
      }

      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          // Re-sincronizar el reloj del Pomodoro con el tiempo real transcurrido durante la inactividad / bloqueo
          if (state && state.pomo && state.pomo.isRunning) {
            syncPomoTime();
            requestPomoWakeLock();
          }
          checkWeekRollover();
          renderHeaderAndKPIs();
          if (gdriveUserEmail) {
            syncGdriveCloud(true);
          }
          // Comprobar activamente si hay una nueva versión del Service Worker en el servidor (iPad PWA)
          if ('serviceWorker' in navigator && swRegistration) {
            swRegistration.update().catch(() => {});
          }
        }
      });

      let swRegistration = null;
      function registerServiceWorker() {
        if ('serviceWorker' in navigator && (window.location.protocol === 'https:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
          navigator.serviceWorker.register('./sw.js').then((reg) => {
            swRegistration = reg;

            // Si ya hay un worker esperando ser activado
            if (reg.waiting && navigator.serviceWorker.controller) {
              const banner = document.getElementById('pwaUpdateBanner');
              if (banner) banner.classList.remove('hidden');
            }

            reg.addEventListener('updatefound', () => {
              const newWorker = reg.installing;
              if (newWorker) {
                newWorker.addEventListener('statechange', () => {
                  if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                    const banner = document.getElementById('pwaUpdateBanner');
                    if (banner) banner.classList.remove('hidden');
                  }
                });
              }
            });

            // Forzar comprobación de versión cada 30 minutos mientras la app esté abierta
            setInterval(() => {
              reg.update().catch(() => {});
            }, 30 * 60 * 1000);
          }).catch((err) => {
            console.log('Service Worker no activo en entorno actual:', err);
          });
        }
      }

      // AUTO-HIDE DE CABECERA AL DESLIZAR HACIA ABAJO Y REAPARICIÓN AL DESLIZAR HACIA ARRIBA EN MÓVIL
      let lastScrollY = window.scrollY;
      let scrollAccumulator = 0;
      window.addEventListener('scroll', () => {
        if (window.innerWidth >= 640) return; // Solo en móviles
        const currentScrollY = window.scrollY;
        const diff = currentScrollY - lastScrollY;
        const header = document.getElementById('mainAppHeader');
        if (!header) return;

        if (currentScrollY <= 20) {
          // Si estamos arriba del todo, siempre visible
          header.classList.remove('header-hidden');
          scrollAccumulator = 0;
        } else if (diff > 8) {
          // Deslizando hacia abajo: ocultar
          scrollAccumulator += diff;
          if (scrollAccumulator > 25) {
            header.classList.add('header-hidden');
          }
        } else if (diff < -6) {
          // Deslizando hacia arriba: reaparecer inmediatamente
          header.classList.remove('header-hidden');
          scrollAccumulator = 0;
        }
        lastScrollY = currentScrollY;
      }, { passive: true });

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
      } else {
        boot();
      }

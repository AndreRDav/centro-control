// CENTRO DE CONTROL - PERSISTENCE & STATE MODULE
// Auto-save, Google Drive Sync, Local Storage, DEFAULT_STATE & Migrations
'use strict';


      function escapeHtml(str) {
        if (str == null) return '';
        return String(str)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#039;');
      }

      const STORAGE_KEY = 'CENTRO_CONTROL_STATE';
      const DAYS = ['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM'];
      const DAY_FULL = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
      const GYM_TYPES = ['Pierna', 'Torso', 'Empuje', 'Tirón', 'Fullbody', 'Core/Movilidad', 'Personalizado...'];
      const RUN_TYPES = ['Rodaje', 'Series', 'Tirada Larga', 'Cross', 'Recuperación', 'Personalizado...'];

      const ALL_MUSCLE_GROUPS = [
        { id: 'chest', label: 'Pectoral / Pecho', icon: '🛡️', desc: 'Presión pectoral, flexiones, press con mancuerna o barra.' },
        { id: 'delts', label: 'Hombros / Deltoides', icon: '🏹', desc: 'Elevaciones laterales, press militar, pájaros.' },
        { id: 'biceps', label: 'Bíceps', icon: '💪', desc: 'Curl con barra, dominadas supinas, curl martillo.' },
        { id: 'triceps', label: 'Tríceps', icon: '⚡', desc: 'Fondos, press francés, extensiones en polea.' },
        { id: 'forearms', label: 'Antebrazos', icon: '✊', desc: 'Paseo del granjero, agarre de barra, flexión de muñeca.' },
        { id: 'abs', label: 'Abdomen / Core', icon: '🧱', desc: 'Planchas, elevaciones de piernas, rueda abdominal.' },
        { id: 'obliques', label: 'Oblicuos / Serratos', icon: '🌀', desc: 'Giros rusos, plancha lateral, leñador en polea.' },
        { id: 'lats', label: 'Dorsal / Espalda Alta', icon: '🦅', desc: 'Dominadas, remo con barra, jalón al pecho.' },
        { id: 'traps', label: 'Trapecio', icon: '🏔️', desc: 'Encogimientos con mancuernas, remo al mentón.' },
        { id: 'lower_back', label: 'Lumbar / Espalda Baja', icon: '🌲', desc: 'Hiperextensiones, peso muerto rumano, bird-dog.' },
        { id: 'glutes', label: 'Glúteos', icon: '🍑', desc: 'Hip thrust, sentadilla profunda, zancadas búlgaras.' },
        { id: 'quads', label: 'Cuádriceps', icon: '🦵', desc: 'Sentadilla, prensa de piernas, extensiones de cuádriceps.' },
        { id: 'hams', label: 'Isquiotibiales', icon: '🦿', desc: 'Curl femoral, peso muerto rumano, buenos días.' },
        { id: 'calves', label: 'Gemelos / Sóleo', icon: '👟', desc: 'Elevación de talones de pie y sentado, carrera de impacto.' }
      ];

      const ACCENT_PALETTES = {
        // --- GRUPO 1: ALTO CONTRASTE ---
        blue_red: {
          id: 'blue_red',
          name: 'Azul Ultramar & Bermellón',
          category: 'high_contrast',
          dot1: '#1D4ED8',
          dot2: '#D93829',
          light: {
            bg: '#F4F7FB',
            panel: '#FFFFFF',
            subpanel: '#EEF3F9',
            input: '#FFFFFF',
            theme900: '#0F172A',
            theme700: '#1D4ED8',
            theme500: '#3B82F6',
            theme100: 'rgba(29, 78, 216, 0.10)',
            themeBorder: 'rgba(29, 78, 216, 0.22)',
            accent: '#D93829',
            accentHover: '#B91C1C',
            accentSoft: 'rgba(217, 56, 41, 0.12)',
            positive: '#059669',
            positiveBg: 'rgba(5, 150, 105, 0.12)',
            positiveBorder: 'rgba(5, 150, 105, 0.35)',
            negative: '#D93829',
            negativeBg: 'rgba(217, 56, 41, 0.12)',
            negativeBorder: 'rgba(217, 56, 41, 0.35)',
            warning: '#D97706',
            warningBg: 'rgba(217, 119, 6, 0.12)',
            warningBorder: 'rgba(217, 119, 6, 0.35)'
          },
          dark: {
            bg: '#070B14',
            panel: 'rgba(13, 20, 36, 0.90)',
            subpanel: 'rgba(8, 14, 28, 0.85)',
            input: '#080F1E',
            theme900: '#0B152B',
            theme700: '#2563EB',
            theme500: '#60A5FA',
            theme100: 'rgba(59, 130, 246, 0.16)',
            themeBorder: 'rgba(59, 130, 246, 0.32)',
            accent: '#EF4444',
            accentHover: '#DC2626',
            accentSoft: 'rgba(239, 68, 68, 0.20)',
            positive: '#10B981',
            positiveBg: 'rgba(16, 185, 129, 0.18)',
            positiveBorder: 'rgba(16, 185, 129, 0.40)',
            negative: '#EF4444',
            negativeBg: 'rgba(239, 68, 68, 0.18)',
            negativeBorder: 'rgba(239, 68, 68, 0.40)',
            warning: '#F59E0B',
            warningBg: 'rgba(245, 158, 11, 0.18)',
            warningBorder: 'rgba(245, 158, 11, 0.40)'
          }
        },
        blue_yellow: {
          id: 'blue_yellow',
          name: 'Azul Cobalto & Amarillo Sol',
          category: 'high_contrast',
          dot1: '#1E40AF',
          dot2: '#EAB308',
          light: {
            bg: '#F6F8FC',
            panel: '#FFFFFF',
            subpanel: '#EDF2F9',
            input: '#FFFFFF',
            theme900: '#0A2540',
            theme700: '#1E40AF',
            theme500: '#3B82F6',
            theme100: 'rgba(30, 64, 175, 0.10)',
            themeBorder: 'rgba(30, 64, 175, 0.22)',
            accent: '#D97706',
            accentHover: '#B45309',
            accentSoft: 'rgba(217, 119, 6, 0.14)',
            positive: '#059669',
            positiveBg: 'rgba(5, 150, 105, 0.12)',
            positiveBorder: 'rgba(5, 150, 105, 0.35)',
            negative: '#DC2626',
            negativeBg: 'rgba(220, 38, 38, 0.12)',
            negativeBorder: 'rgba(220, 38, 38, 0.35)',
            warning: '#D97706',
            warningBg: 'rgba(217, 119, 6, 0.14)',
            warningBorder: 'rgba(217, 119, 6, 0.35)'
          },
          dark: {
            bg: '#060E1A',
            panel: 'rgba(10, 24, 44, 0.90)',
            subpanel: 'rgba(6, 17, 32, 0.85)',
            input: '#061222',
            theme900: '#081D38',
            theme700: '#2563EB',
            theme500: '#60A5FA',
            theme100: 'rgba(37, 99, 235, 0.18)',
            themeBorder: 'rgba(59, 130, 246, 0.32)',
            accent: '#FACC15',
            accentHover: '#EAB308',
            accentSoft: 'rgba(250, 204, 21, 0.20)',
            positive: '#10B981',
            positiveBg: 'rgba(16, 185, 129, 0.18)',
            positiveBorder: 'rgba(16, 185, 129, 0.40)',
            negative: '#EF4444',
            negativeBg: 'rgba(239, 68, 68, 0.18)',
            negativeBorder: 'rgba(239, 68, 68, 0.40)',
            warning: '#FACC15',
            warningBg: 'rgba(250, 204, 21, 0.20)',
            warningBorder: 'rgba(250, 204, 21, 0.40)'
          }
        },
        red_green: {
          id: 'red_green',
          name: 'Rojo Burdeos & Verde Bosque',
          category: 'high_contrast',
          dot1: '#991B1B',
          dot2: '#059669',
          light: {
            bg: '#FDF7F7',
            panel: '#FFFFFF',
            subpanel: '#FAECEC',
            input: '#FFFFFF',
            theme900: '#450A0A',
            theme700: '#991B1B',
            theme500: '#DC2626',
            theme100: 'rgba(153, 27, 27, 0.10)',
            themeBorder: 'rgba(153, 27, 27, 0.24)',
            accent: '#059669',
            accentHover: '#047857',
            accentSoft: 'rgba(5, 150, 105, 0.14)',
            // Roles Semánticos Corregidos: el verde es positivo, el burdeos es negativo
            positive: '#059669',
            positiveBg: 'rgba(5, 150, 105, 0.14)',
            positiveBorder: 'rgba(5, 150, 105, 0.35)',
            negative: '#991B1B',
            negativeBg: 'rgba(153, 27, 27, 0.12)',
            negativeBorder: 'rgba(153, 27, 27, 0.35)',
            warning: '#D97706',
            warningBg: 'rgba(217, 119, 6, 0.12)',
            warningBorder: 'rgba(217, 119, 6, 0.35)'
          },
          dark: {
            bg: '#120606',
            panel: 'rgba(32, 12, 12, 0.92)',
            subpanel: 'rgba(22, 8, 8, 0.88)',
            input: '#1A0808',
            theme900: '#2A0808',
            theme700: '#DC2626',
            theme500: '#F87171',
            theme100: 'rgba(220, 38, 38, 0.18)',
            themeBorder: 'rgba(239, 68, 68, 0.32)',
            accent: '#10B981',
            accentHover: '#059669',
            accentSoft: 'rgba(16, 185, 129, 0.20)',
            positive: '#10B981',
            positiveBg: 'rgba(16, 185, 129, 0.20)',
            positiveBorder: 'rgba(16, 185, 129, 0.40)',
            negative: '#EF4444',
            negativeBg: 'rgba(239, 68, 68, 0.20)',
            negativeBorder: 'rgba(239, 68, 68, 0.40)',
            warning: '#F59E0B',
            warningBg: 'rgba(245, 158, 11, 0.18)',
            warningBorder: 'rgba(245, 158, 11, 0.40)'
          }
        },
        navy_crimson: {
          id: 'navy_crimson',
          name: 'Azul Noche & Rojo Infierno',
          category: 'high_contrast',
          dot1: '#1E293B',
          dot2: '#EF4444',
          light: {
            bg: '#F6F8FB',
            panel: '#FFFFFF',
            subpanel: '#EDF1F7',
            input: '#FFFFFF',
            theme900: '#0F172A',
            theme700: '#1E293B',
            theme500: '#475569',
            theme100: 'rgba(30, 41, 59, 0.10)',
            themeBorder: 'rgba(30, 41, 59, 0.24)',
            accent: '#DC2626',
            accentHover: '#B91C1C',
            accentSoft: 'rgba(220, 38, 38, 0.14)',
            positive: '#059669',
            positiveBg: 'rgba(5, 150, 105, 0.12)',
            positiveBorder: 'rgba(5, 150, 105, 0.35)',
            negative: '#DC2626',
            negativeBg: 'rgba(220, 38, 38, 0.12)',
            negativeBorder: 'rgba(220, 38, 38, 0.35)',
            warning: '#D97706',
            warningBg: 'rgba(217, 119, 6, 0.12)',
            warningBorder: 'rgba(217, 119, 6, 0.35)'
          },
          dark: {
            bg: '#0A0D17',
            panel: 'rgba(18, 24, 42, 0.92)',
            subpanel: 'rgba(12, 16, 29, 0.88)',
            input: '#0F1424',
            theme900: '#111827',
            theme700: '#334155',
            theme500: '#94A3B8',
            theme100: 'rgba(71, 85, 105, 0.20)',
            themeBorder: 'rgba(148, 163, 184, 0.35)',
            accent: '#EF4444',
            accentHover: '#DC2626',
            accentSoft: 'rgba(239, 68, 68, 0.22)',
            positive: '#10B981',
            positiveBg: 'rgba(16, 185, 129, 0.18)',
            positiveBorder: 'rgba(16, 185, 129, 0.40)',
            negative: '#EF4444',
            negativeBg: 'rgba(239, 68, 68, 0.20)',
            negativeBorder: 'rgba(239, 68, 68, 0.40)',
            warning: '#F59E0B',
            warningBg: 'rgba(245, 158, 11, 0.18)',
            warningBorder: 'rgba(245, 158, 11, 0.40)'
          }
        },
        purple_amber: {
          id: 'purple_amber',
          name: 'Amatista & Mandarina',
          category: 'high_contrast',
          dot1: '#6D28D9',
          dot2: '#EA580C',
          light: {
            bg: '#FCF7FF',
            panel: '#FFFFFF',
            subpanel: '#F4EAFC',
            input: '#FFFFFF',
            theme900: '#2E1065',
            theme700: '#6D28D9',
            theme500: '#8B5CF6',
            theme100: 'rgba(109, 40, 217, 0.10)',
            themeBorder: 'rgba(109, 40, 217, 0.24)',
            accent: '#EA580C',
            accentHover: '#C2410C',
            accentSoft: 'rgba(234, 88, 12, 0.14)',
            positive: '#059669',
            positiveBg: 'rgba(5, 150, 105, 0.12)',
            positiveBorder: 'rgba(5, 150, 105, 0.35)',
            negative: '#DC2626',
            negativeBg: 'rgba(220, 38, 38, 0.12)',
            negativeBorder: 'rgba(220, 38, 38, 0.35)',
            warning: '#EA580C',
            warningBg: 'rgba(234, 88, 12, 0.14)',
            warningBorder: 'rgba(234, 88, 12, 0.35)'
          },
          dark: {
            bg: '#0F071A',
            panel: 'rgba(30, 14, 52, 0.92)',
            subpanel: 'rgba(20, 9, 36, 0.88)',
            input: '#170B2B',
            theme900: '#1F0B38',
            theme700: '#7C3AED',
            theme500: '#C4B5FD',
            theme100: 'rgba(124, 58, 237, 0.20)',
            themeBorder: 'rgba(196, 181, 253, 0.35)',
            accent: '#FB923C',
            accentHover: '#F97316',
            accentSoft: 'rgba(251, 146, 60, 0.22)',
            positive: '#10B981',
            positiveBg: 'rgba(16, 185, 129, 0.18)',
            positiveBorder: 'rgba(16, 185, 129, 0.40)',
            negative: '#EF4444',
            negativeBg: 'rgba(239, 68, 68, 0.20)',
            negativeBorder: 'rgba(239, 68, 68, 0.40)',
            warning: '#FB923C',
            warningBg: 'rgba(251, 146, 60, 0.20)',
            warningBorder: 'rgba(251, 146, 60, 0.40)'
          }
        },
        emerald_plum: {
          id: 'emerald_plum',
          name: 'Esmeralda & Ciruela',
          category: 'high_contrast',
          dot1: '#047857',
          dot2: '#9D174D',
          light: {
            bg: '#F3FAF6',
            panel: '#FFFFFF',
            subpanel: '#E8F6EE',
            input: '#FFFFFF',
            theme900: '#064E3B',
            theme700: '#047857',
            theme500: '#10B981',
            theme100: 'rgba(4, 120, 87, 0.10)',
            themeBorder: 'rgba(4, 120, 87, 0.24)',
            accent: '#9D174D',
            accentHover: '#831843',
            accentSoft: 'rgba(157, 23, 77, 0.14)',
            positive: '#047857',
            positiveBg: 'rgba(4, 120, 87, 0.12)',
            positiveBorder: 'rgba(4, 120, 87, 0.35)',
            negative: '#9D174D',
            negativeBg: 'rgba(157, 23, 77, 0.14)',
            negativeBorder: 'rgba(157, 23, 77, 0.35)',
            warning: '#D97706',
            warningBg: 'rgba(217, 119, 6, 0.12)',
            warningBorder: 'rgba(217, 119, 6, 0.35)'
          },
          dark: {
            bg: '#05140D',
            panel: 'rgba(10, 36, 24, 0.92)',
            subpanel: 'rgba(6, 24, 16, 0.88)',
            input: '#071A11',
            theme900: '#064E3B',
            theme700: '#10B981',
            theme500: '#6EE7B7',
            theme100: 'rgba(16, 185, 129, 0.18)',
            themeBorder: 'rgba(16, 185, 129, 0.35)',
            accent: '#F472B6',
            accentHover: '#EC4899',
            accentSoft: 'rgba(244, 114, 182, 0.22)',
            positive: '#34D399',
            positiveBg: 'rgba(52, 211, 153, 0.20)',
            positiveBorder: 'rgba(52, 211, 153, 0.40)',
            negative: '#F472B6',
            negativeBg: 'rgba(244, 114, 182, 0.20)',
            negativeBorder: 'rgba(244, 114, 182, 0.40)',
            warning: '#FBBF24',
            warningBg: 'rgba(251, 191, 36, 0.18)',
            warningBorder: 'rgba(251, 191, 36, 0.40)'
          }
        },

        // --- GRUPO 2: CONTRASTE SUAVE / EDITORIAL ---
        green_red: {
          id: 'green_red',
          name: 'Verde Salvia & Terracota',
          category: 'soft_contrast',
          dot1: '#1B4332',
          dot2: '#C84B31',
          light: {
            bg: '#F5F9F6',
            panel: '#FFFFFF',
            subpanel: '#ECF4EE',
            input: '#FFFFFF',
            theme900: '#0F291E',
            theme700: '#1B4332',
            theme500: '#2D6A4F',
            theme100: 'rgba(27, 67, 50, 0.10)',
            themeBorder: 'rgba(27, 67, 50, 0.24)',
            accent: '#C84B31',
            accentHover: '#B03A22',
            accentSoft: 'rgba(200, 75, 49, 0.14)',
            positive: '#2D6A4F',
            positiveBg: 'rgba(45, 106, 79, 0.12)',
            positiveBorder: 'rgba(45, 106, 79, 0.35)',
            negative: '#C84B31',
            negativeBg: 'rgba(200, 75, 49, 0.14)',
            negativeBorder: 'rgba(200, 75, 49, 0.35)',
            warning: '#D97706',
            warningBg: 'rgba(217, 119, 6, 0.12)',
            warningBorder: 'rgba(217, 119, 6, 0.35)'
          },
          dark: {
            bg: '#06110B',
            panel: 'rgba(14, 32, 22, 0.92)',
            subpanel: 'rgba(9, 22, 15, 0.88)',
            input: '#091810',
            theme900: '#0D271C',
            theme700: '#1B4D36',
            theme500: '#52B788',
            theme100: 'rgba(45, 106, 79, 0.20)',
            themeBorder: 'rgba(82, 183, 136, 0.35)',
            accent: '#F87171',
            accentHover: '#EF4444',
            accentSoft: 'rgba(248, 113, 113, 0.22)',
            positive: '#52B788',
            positiveBg: 'rgba(82, 183, 136, 0.20)',
            positiveBorder: 'rgba(82, 183, 136, 0.40)',
            negative: '#F87171',
            negativeBg: 'rgba(248, 113, 113, 0.20)',
            negativeBorder: 'rgba(248, 113, 113, 0.40)',
            warning: '#FBBF24',
            warningBg: 'rgba(251, 191, 36, 0.18)',
            warningBorder: 'rgba(251, 191, 36, 0.40)'
          }
        },
        orange_yellow: {
          id: 'orange_yellow',
          name: 'Terracota & Amarillo Cálido',
          category: 'soft_contrast',
          dot1: '#C2410C',
          dot2: '#D97706',
          light: {
            bg: '#FDFAF6',
            panel: '#FFFFFF',
            subpanel: '#F9F0E6',
            input: '#FFFFFF',
            theme900: '#431407',
            theme700: '#C2410C',
            theme500: '#F97316',
            theme100: 'rgba(194, 65, 12, 0.10)',
            themeBorder: 'rgba(194, 65, 12, 0.24)',
            accent: '#D97706',
            accentHover: '#B45309',
            accentSoft: 'rgba(217, 119, 6, 0.14)',
            positive: '#059669',
            positiveBg: 'rgba(5, 150, 105, 0.12)',
            positiveBorder: 'rgba(5, 150, 105, 0.35)',
            negative: '#C2410C',
            negativeBg: 'rgba(194, 65, 12, 0.12)',
            negativeBorder: 'rgba(194, 65, 12, 0.35)',
            warning: '#D97706',
            warningBg: 'rgba(217, 119, 6, 0.14)',
            warningBorder: 'rgba(217, 119, 6, 0.35)'
          },
          dark: {
            bg: '#140803',
            panel: 'rgba(34, 18, 10, 0.92)',
            subpanel: 'rgba(24, 12, 6, 0.88)',
            input: '#1A0B04',
            theme900: '#2E0E04',
            theme700: '#EA580C',
            theme500: '#FDBA74',
            theme100: 'rgba(234, 88, 12, 0.18)',
            themeBorder: 'rgba(249, 115, 22, 0.32)',
            accent: '#FBBF24',
            accentHover: '#F59E0B',
            accentSoft: 'rgba(251, 191, 36, 0.22)',
            positive: '#10B981',
            positiveBg: 'rgba(16, 185, 129, 0.18)',
            positiveBorder: 'rgba(16, 185, 129, 0.40)',
            negative: '#F87171',
            negativeBg: 'rgba(248, 113, 113, 0.20)',
            negativeBorder: 'rgba(248, 113, 113, 0.40)',
            warning: '#FBBF24',
            warningBg: 'rgba(251, 191, 36, 0.20)',
            warningBorder: 'rgba(251, 191, 36, 0.40)'
          }
        },
        petrol_coral: {
          id: 'petrol_coral',
          name: 'Azul Petróleo & Coral Suave',
          category: 'soft_contrast',
          dot1: '#0E7490',
          dot2: '#FB7185',
          light: {
            bg: '#F2F8F9',
            panel: '#FFFFFF',
            subpanel: '#E5F1F3',
            input: '#FFFFFF',
            theme900: '#155E75',
            theme700: '#0E7490',
            theme500: '#06B6D4',
            theme100: 'rgba(14, 116, 144, 0.10)',
            themeBorder: 'rgba(14, 116, 144, 0.24)',
            accent: '#E11D48',
            accentHover: '#BE123C',
            accentSoft: 'rgba(225, 29, 72, 0.14)',
            positive: '#059669',
            positiveBg: 'rgba(5, 150, 105, 0.12)',
            positiveBorder: 'rgba(5, 150, 105, 0.35)',
            negative: '#E11D48',
            negativeBg: 'rgba(225, 29, 72, 0.14)',
            negativeBorder: 'rgba(225, 29, 72, 0.35)',
            warning: '#D97706',
            warningBg: 'rgba(217, 119, 6, 0.12)',
            warningBorder: 'rgba(217, 119, 6, 0.35)'
          },
          dark: {
            bg: '#041014',
            panel: 'rgba(8, 28, 36, 0.92)',
            subpanel: 'rgba(5, 20, 26, 0.88)',
            input: '#07171E',
            theme900: '#083344',
            theme700: '#0891B2',
            theme500: '#67E8F9',
            theme100: 'rgba(8, 145, 178, 0.18)',
            themeBorder: 'rgba(8, 145, 178, 0.35)',
            accent: '#FB7185',
            accentHover: '#F43F5E',
            accentSoft: 'rgba(251, 113, 133, 0.22)',
            positive: '#34D399',
            positiveBg: 'rgba(52, 211, 153, 0.20)',
            positiveBorder: 'rgba(52, 211, 153, 0.40)',
            negative: '#FB7185',
            negativeBg: 'rgba(251, 113, 133, 0.20)',
            negativeBorder: 'rgba(251, 113, 133, 0.40)',
            warning: '#FBBF24',
            warningBg: 'rgba(251, 191, 36, 0.18)',
            warningBorder: 'rgba(251, 191, 36, 0.40)'
          }
        },
        charcoal_blue: {
          id: 'charcoal_blue',
          name: 'Monocromo Grafito & Azul Eléctrico',
          category: 'soft_contrast',
          dot1: '#27272A',
          dot2: '#2563EB',
          light: {
            bg: '#F7F7F8',
            panel: '#FFFFFF',
            subpanel: '#EDEDF0',
            input: '#FFFFFF',
            theme900: '#09090B',
            theme700: '#27272A',
            theme500: '#52525B',
            theme100: 'rgba(39, 39, 42, 0.10)',
            themeBorder: 'rgba(39, 39, 42, 0.24)',
            accent: '#2563EB',
            accentHover: '#1D4ED8',
            accentSoft: 'rgba(37, 99, 235, 0.14)',
            positive: '#059669',
            positiveBg: 'rgba(5, 150, 105, 0.12)',
            positiveBorder: 'rgba(5, 150, 105, 0.35)',
            negative: '#DC2626',
            negativeBg: 'rgba(220, 38, 38, 0.12)',
            negativeBorder: 'rgba(220, 38, 38, 0.35)',
            warning: '#D97706',
            warningBg: 'rgba(217, 119, 6, 0.12)',
            warningBorder: 'rgba(217, 119, 6, 0.35)'
          },
          dark: {
            bg: '#09090B',
            panel: 'rgba(24, 24, 27, 0.92)',
            subpanel: 'rgba(16, 16, 18, 0.90)',
            input: '#121214',
            theme900: '#18181B',
            theme700: '#3F3F46',
            theme500: '#A1A1AA',
            theme100: 'rgba(82, 82, 91, 0.20)',
            themeBorder: 'rgba(161, 161, 170, 0.35)',
            accent: '#3B82F6',
            accentHover: '#2563EB',
            accentSoft: 'rgba(59, 130, 246, 0.22)',
            positive: '#10B981',
            positiveBg: 'rgba(16, 185, 129, 0.18)',
            positiveBorder: 'rgba(16, 185, 129, 0.40)',
            negative: '#EF4444',
            negativeBg: 'rgba(239, 68, 68, 0.20)',
            negativeBorder: 'rgba(239, 68, 68, 0.40)',
            warning: '#F59E0B',
            warningBg: 'rgba(245, 158, 11, 0.18)',
            warningBorder: 'rgba(245, 158, 11, 0.40)'
          }
        }
      };

      function applyAccentPalette(paletteKey) {
        // Migración de paletas legacy a las nuevas claves
        const legacyMap = {
          emerald: 'green_red',
          sapphire: 'blue_red',
          crimson: 'navy_crimson',
          amber: 'orange_yellow',
          amethyst: 'purple_amber',
          nordic: 'blue_yellow'
        };
        const resolvedKey = legacyMap[paletteKey] || paletteKey;
        const key = ACCENT_PALETTES[resolvedKey] ? resolvedKey : 'blue_red';
        const pal = ACCENT_PALETTES[key];
        const isDark = (typeof state !== 'undefined' && state?.theme) ? (state.theme === 'dark') : document.documentElement.classList.contains('dark');
        const colors = isDark ? pal.dark : pal.light;

        const root = document.documentElement;
        // Inyección de Variables Globales del Motor Bicolor
        root.style.setProperty('--theme-bg', colors.bg);
        root.style.setProperty('--theme-panel', colors.panel);
        root.style.setProperty('--theme-subpanel', colors.subpanel);
        root.style.setProperty('--theme-input', colors.input);
        root.style.setProperty('--theme-900', colors.theme900);
        root.style.setProperty('--theme-700', colors.theme700);
        root.style.setProperty('--theme-main', colors.theme700);
        root.style.setProperty('--theme-500', colors.theme500);
        root.style.setProperty('--theme-100', colors.theme100);
        root.style.setProperty('--theme-soft', colors.theme100);
        root.style.setProperty('--theme-border', colors.themeBorder);
        root.style.setProperty('--theme-accent', colors.accent);
        root.style.setProperty('--theme-accent-hover', colors.accentHover);
        root.style.setProperty('--theme-accent-soft', colors.accentSoft);

        // Tokens Semánticos Universales (Éxito / Fallo / Advertencia)
        const pos = colors.positive || colors.theme700;
        const posBg = colors.positiveBg || colors.theme100;
        const posBorder = colors.positiveBorder || colors.themeBorder;
        const neg = colors.negative || colors.accent;
        const negBg = colors.negativeBg || colors.accentSoft;
        const negBorder = colors.negativeBorder || colors.accent;
        const warn = colors.warning || '#D97706';
        const warnBg = colors.warningBg || 'rgba(217, 119, 6, 0.14)';
        const warnBorder = colors.warningBorder || 'rgba(217, 119, 6, 0.35)';

        root.style.setProperty('--theme-positive', pos);
        root.style.setProperty('--theme-positive-bg', posBg);
        root.style.setProperty('--theme-positive-border', posBorder);
        root.style.setProperty('--theme-negative', neg);
        root.style.setProperty('--theme-negative-bg', negBg);
        root.style.setProperty('--theme-negative-border', negBorder);
        root.style.setProperty('--theme-warning', warn);
        root.style.setProperty('--theme-warning-bg', warnBg);
        root.style.setProperty('--theme-warning-border', warnBorder);

        // Retrocompatibilidad con selectores y botones existentes
        root.style.setProperty('--color-accent-green', pos);
        root.style.setProperty('--color-accent-green-hover', colors.theme500);
        root.style.setProperty('--color-accent-green-bg', posBg);

        const dot1 = document.getElementById('palettePickerActiveDot');
        const dot2 = document.getElementById('palettePickerActiveDot2');
        const nameEl = document.getElementById('palettePickerActiveName');
        if (dot1) dot1.style.backgroundColor = isDark ? pal.dark.theme700 : pal.light.theme700;
        if (dot2) dot2.style.backgroundColor = isDark ? pal.dark.accent : pal.light.accent;
        if (nameEl) nameEl.textContent = pal.name.split(' ')[0];

        // Asegurar contraste óptimo de texto según la luminosidad del color de acento
        const closeWeekBtn = document.getElementById('headerCloseWeekBtn');
        if (closeWeekBtn) {
          const hex = colors.accent.replace('#', '');
          const r = parseInt(hex.substring(0, 2), 16) || 0;
          const g = parseInt(hex.substring(2, 4), 16) || 0;
          const b = parseInt(hex.substring(4, 6), 16) || 0;
          const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
          closeWeekBtn.style.color = (yiq >= 150) ? '#090d16' : '#ffffff';
        }

        // 1. Logo dinámico en la cabecera de la aplicación (Plano: fondo un color y logo el otro de la paleta con máximo contraste)
        const headerLogo = document.getElementById('appHeaderLogo');
        if (headerLogo) {
          const bgCol = colors.theme700;
          headerLogo.style.background = bgCol;
          headerLogo.style.boxShadow = `0 3px 10px ${colors.themeBorder || 'rgba(0,0,0,0.2)'}`;

          // Calcular contraste relativo
          const getLuminance = (hex) => {
            const h = (hex || '#000000').replace('#', '');
            const r = parseInt(h.substring(0, 2), 16) || 0;
            const g = parseInt(h.substring(2, 4), 16) || 0;
            const b = parseInt(h.substring(4, 6), 16) || 0;
            return ((r * 299) + (g * 587) + (b * 114)) / 1000;
          };
          const bgLum = getLuminance(bgCol);
          const accentLum = getLuminance(colors.accent);
          const contrastDiff = Math.abs(bgLum - accentLum);

          // Si el color de acento contrasta fuertemente con el fondo (diff >= 90), usar el acento de la paleta.
          // De lo contrario, usar blanco puro para fondo oscuro o negro puro para fondo claro garantizando legibilidad total.
          let iconColor = (contrastDiff >= 90) ? colors.accent : (bgLum < 128 ? '#ffffff' : '#0a0a0c');

          headerLogo.innerHTML = `
            <svg class="w-5 h-5 drop-shadow-xs" viewBox="0 0 24 24" fill="${iconColor}">
              <polygon points="13 2 4 14 11 14 9 22 20 10 13 10 13 2"></polygon>
            </svg>
          `;
        }

        // 2. Favicon e icono de pestaña dinámicos según paleta activa (SVG Data URI en estilo plano y alto contraste)
        try {
          const bgCol = colors.theme700;
          const getLum = (hex) => {
            const h = (hex || '#000000').replace('#', '');
            const r = parseInt(h.substring(0, 2), 16) || 0;
            const g = parseInt(h.substring(2, 4), 16) || 0;
            const b = parseInt(h.substring(4, 6), 16) || 0;
            return ((r * 299) + (g * 587) + (b * 114)) / 1000;
          };
          const bgLum = getLum(bgCol);
          const accentLum = getLum(colors.accent);
          const contrastDiff = Math.abs(bgLum - accentLum);
          const iconColor = (contrastDiff >= 90) ? colors.accent : (bgLum < 128 ? '#ffffff' : '#0a0a0c');

          const svgIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="${bgCol}"/><polygon points="35 6 16 34 31 34 27 58 48 26 33 26 35 6" fill="${iconColor}"/></svg>`;
          const iconUri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgIcon)}`;
          
          let favEl = document.getElementById('favicon');
          if (!favEl) {
            favEl = document.createElement('link');
            favEl.id = 'favicon';
            favEl.rel = 'icon';
            document.head.appendChild(favEl);
          }
          favEl.type = 'image/svg+xml';
          favEl.href = iconUri;

          const appleTouch = document.querySelector('link[rel="apple-touch-icon"]');
          if (appleTouch) appleTouch.href = iconUri;
        } catch (e) {
          console.warn('No se pudo actualizar el favicon dinámico:', e);
        }
      }

      // ==========================================
      // BIBLIOTECA DE ICONOS VECTORIALES SVG CURADA
      // ==========================================
      const SVG_ICON_LIBRARY = {
        // --- 1. FITNESS & DEPORTE ---
        'dumbbell': { name: 'Pesas / Gym', cat: 'fitness', tags: 'pesas gym fitness entrenamiento fuerza gimnasio musculacion', svg: '<path d="M6 5v14M18 5v14M6 12h12M3 8v8M21 8v8"/>' },
        'run': { name: 'Running / Carrera', cat: 'fitness', tags: 'correr run running cardio trotar sprint zapatilla km maraton', svg: '<circle cx="17" cy="4" r="2"/><path d="M15 8h-3l-2.5 4.5 3 2.5v5"/><path d="m9 13.5-3 3.5v4"/><path d="M11 8 8 5 4 7"/>' },
        'bike': { name: 'Bicicleta / Ciclo', cat: 'fitness', tags: 'bici bicicleta ciclismo spinning cardio ruta paseo', svg: '<circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><path d="M15 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm-3 11.5L9 11l3-5 4 4h3M5.5 17.5l4-6.5"/>' },
        'waves': { name: 'Natación / Surf', cat: 'fitness', tags: 'nadar natacion olas mar piscina surf agua', svg: '<path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/>' },
        'shield': { name: 'Escudo / Disciplina', cat: 'fitness', tags: 'escudo defensa artes marciales seguridad proteccion disciplina', svg: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>' },
        'medal': { name: 'Medalla / Logro', cat: 'fitness', tags: 'medalla premio victoria podio honor merito record', svg: '<path d="M7.21 15 2.66 7.14a2 2 0 0 1 .13-2.2L4.4 2.8A2 2 0 0 1 6 2h12a2 2 0 0 1 1.6.8l1.6 2.14a2 2 0 0 1 .14 2.2L16.79 15"/><circle cx="12" cy="17" r="5"/>' },
        'flame': { name: 'Fuego / Calorías', cat: 'fitness', tags: 'fuego calorias quema energia intensidad racha', svg: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>' },
        'heart': { name: 'Corazón / Cardio', cat: 'fitness', tags: 'corazon cardio salud pulso vida esfuerzo', svg: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>' },
        'activity': { name: 'Pulso / Actividad', cat: 'fitness', tags: 'pulso actividad frecuencia cardio electrocardiograma', svg: '<path d="M22 12h-4l-3 9L9 3l-3 9H2"/>' },
        'target': { name: 'Diana / Puntería', cat: 'fitness', tags: 'diana objetivo meta foco punteria reto acierto', svg: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>' },
        'timer': { name: 'Cronómetro', cat: 'fitness', tags: 'cronometro tiempo series descansos ritmo reloj', svg: '<line x1="10" x2="14" y1="2" y2="2"/><line x1="12" x2="15" y1="14" y2="11"/><circle cx="12" cy="14" r="8"/>' },
        'trophy': { name: 'Trofeo / Victoria', cat: 'fitness', tags: 'trofeo copa ganador record meta victoria exito', svg: '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22M18 2H6v7a6 6 0 0 0 12 0V2Z"/>' },
        'footsteps': { name: 'Pasos / Caminata', cat: 'fitness', tags: 'pasos caminar paseo 10000 pasos actividad', svg: '<path d="M4 16v-2.38C4 11.5 6 9 8 9s4 2.5 4 4.62V16M12 21v-2.38C12 16.5 14 14 16 14s4 2.5 4 4.62V21"/>' },
        'zap': { name: 'Rayo / Energía', cat: 'fitness', tags: 'rayo energia potencia fuerza chispa rapido', svg: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>' },

        // --- 2. ESTUDIO & PRODUCTIVIDAD ---
        'book': { name: 'Libro / Lectura', cat: 'study', tags: 'libro lectura estudiar paginas leer cultura', svg: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 19.5A2.5 2.5 0 0 0 6.5 22H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15z"/>' },
        'graduation-cap': { name: 'Universidad / Clase', cat: 'study', tags: 'universidad clase carrera grado master examen birrete', svg: '<path d="M22 10v6M2 10l10-5 10 5-10 5zM6 12v5c0 2 3 3 6 3s6-1 6-3v-5"/>' },
        'pen': { name: 'Pluma / Apuntes', cat: 'study', tags: 'pluma boli escribir apuntes redaccion tarea', svg: '<path d="M12 19l7-7 3 3-7 7-3-3zM18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5zM2 2l7.586 7.586M11 11l-4 4"/>' },
        'check-circle': { name: 'Check / Tarea', cat: 'study', tags: 'check tarea completada ok exito listo deberes', svg: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>' },
        'clock': { name: 'Reloj / Pomodoro', cat: 'study', tags: 'reloj tiempo horas puntualidad pomodoro temporizador', svg: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>' },
        'lightbulb': { name: 'Bombilla / Ideas', cat: 'study', tags: 'bombilla idea creatividad proyecto ingenio foco', svg: '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5M9 18h6M10 22h4"/>' },
        'folder': { name: 'Carpeta / Archivo', cat: 'study', tags: 'carpeta archivo organizacion temario documentos', svg: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>' },
        'briefcase': { name: 'Maletín / Trabajo', cat: 'study', tags: 'maletin trabajo oficina profesional curro empleo', svg: '<rect width="20" height="14" x="2" y="7" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>' },
        'code': { name: 'Código / Dev', cat: 'study', tags: 'codigo programar software programacion web python dev', svg: '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>' },

        // --- 3. SALUD & NUTRICIÓN & HÁBITOS ---
        'droplet': { name: 'Agua / Hidratación', cat: 'health', tags: 'agua gota hidratacion sed botella beber', svg: '<path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>' },
        'apple': { name: 'Manzana / Nutrición', cat: 'health', tags: 'manzana fruta comida nutricion dieta sano saludable verdura', svg: '<path d="M12 20.94c1.5 0 2.75 1.06 4 1.06 3 0 6-8 6-12.22A4.91 4.91 0 0 0 17 5c-2.22 0-4 1.44-5 2-1-.56-2.78-2-5-2a4.9 4.9 0 0 0-5 4.78C2 14 5 22 8 22c1.25 0 2.5-1.06 4-1.06Z"/><path d="M10 2c1 .5 2 2 2 5"/>' },
        'pill': { name: 'Píldora / Creatina', cat: 'health', tags: 'pildora pastilla medicamento creatina suplementos vitaminas proteina', svg: '<path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z"/><path d="m8.5 8.5 7 7"/>' },
        'moon': { name: 'Luna / Sueño', cat: 'health', tags: 'luna sueno dormir descanso noche 8h descanso reparador', svg: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>' },
        'sun': { name: 'Sol / Despertar', cat: 'health', tags: 'sol manana despertar madrugar luz vitd vitalidad', svg: '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>' },
        'scale': { name: 'Báscula / Peso', cat: 'health', tags: 'peso bascula volumen definicion seguimiento kilos', svg: '<path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="M7 21h10"/><path d="M12 3v18"/><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/>' },
        'utensils': { name: 'Comida / Restaurante', cat: 'health', tags: 'cubiertos comida restaurante cenar almorzar taper plato', svg: '<path d="M18 2v20M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm-17 0h3a2 2 0 0 0 2-2V7a5 5 0 0 0-5-5v13ZM4 22V15"/>' },
        'coffee': { name: 'Café / Energía', cat: 'health', tags: 'cafe cafeina taza desayuno relax te infusion', svg: '<path d="M17 8h1a4 4 0 1 1 0 8h-1M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><line x1="6" y1="2" x2="6" y2="4"/><line x1="10" y1="2" x2="10" y2="4"/><line x1="14" y1="2" x2="14" y2="4"/>' },

        // --- 4. FINANZAS & CONSUMO ---
        'cart': { name: 'Supermercado / Compra', cat: 'finance', tags: 'compra carrito super supermercado mercadona viveres comida', svg: '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>' },
        'wallet': { name: 'Cartera / Efectivo', cat: 'finance', tags: 'cartera dinero billetes efectivo sueldo pagos presupuesto', svg: '<path d="M21 12V7H5a2 2 0 0 1 0-4h14v4M3 5v14a2 2 0 0 0 2 2h16v-5M18 12a2 2 0 0 0 0 4h4v-4Z"/>' },
        'piggy': { name: 'Hucha / Ahorro', cat: 'finance', tags: 'hucha cerdito ahorro sobrante guardar futuro cerdito monedas', svg: '<path d="M19 5c-1.5 0-2.8 1.4-3 2-3.5-1.5-11-.3-11 5 0 1.8 0 3 2 4.5V20h4v-2h3v2h4v-4c1-.5 1.5-1 2-2.5 1-3.5-.5-8.5-1-8.5Z"/><path d="M2 9v1c0 1.1.9 2 2 2h1"/><path d="M16 11h.01"/><path d="M10 5v2"/>' },
        'coins': { name: 'Monedas / Dinero', cat: 'finance', tags: 'monedas suelto cash dinero cambio ahorro', svg: '<circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18M7 6h1v4M17 12h1v4"/>' },
        'trending-up': { name: 'Inversión / Subida', cat: 'finance', tags: 'inversion bolsa finanzas grafico subida mejora rendimiento rentabilidad', svg: '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>' },
        'brain': { name: 'Cerebro / Mente', cat: 'health', tags: 'cerebro mente foco mental meditacion memoria concentracion salud', svg: '<path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-5.04zM14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-4.44-5.04z"/>' },
        'bed': { name: 'Cama / Sueño', cat: 'health', tags: 'cama dormir siesta descanso noche hotel relajacion 8h', svg: '<path d="M2 4v16M2 8h18a2 2 0 0 1 2 2v10M2 17h20M6 8v9"/>' },
        'smile': { name: 'Sonrisa / Ánimo', cat: 'health', tags: 'sonrisa animo humor felicidad psicologia positivo bienestar', svg: '<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01"/>' },
        'sparkles': { name: 'Brillo / Rutina', cat: 'lifestyle', tags: 'brillo magia habitos rutina exito inspiracion estrellas', svg: '<path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/>' },
        'calendar': { name: 'Calendario / Agenda', cat: 'study', tags: 'calendario fecha dia evento plan organizacion agenda', svg: '<rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/>' },
        'bookmark': { name: 'Marcador / Lectura', cat: 'study', tags: 'marcador guardar pagina libro capitulo lectura', svg: '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>' },
        'headphones': { name: 'Auriculares / Audio', cat: 'lifestyle', tags: 'auriculares musica podcast audio concentracion estudio canciones sonido', svg: '<path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3"/>' },
        'camera': { name: 'Cámara / Fotos', cat: 'lifestyle', tags: 'camara fotos recuerdos fotografia contenido video redes', svg: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>' },
        'users': { name: 'Gente / Social', cat: 'lifestyle', tags: 'amigos familia grupo personas comunidad reunion social amigos', svg: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>' },
        'credit-card': { name: 'Tarjeta / Banco', cat: 'finance', tags: 'tarjeta credito debito banco cuenta visa mastercard pago', svg: '<rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/>' },
        'receipt': { name: 'Ticket / Factura', cat: 'finance', tags: 'ticket recibo factura cuenta gasto desglose', svg: '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1Z"/><path d="M8 7h8M8 11h8M8 15h5"/>' },
        'fuel': { name: 'Gasolina / Transporte', cat: 'finance', tags: 'gasolina combustible coche moto repostar transporte diesel', svg: '<path d="M3 22h12M4 9h10M14 22V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v18M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 2 2 2 2 0 0 0 2-2V9.83a2 2 0 0 0-.59-1.42L18 5"/>' },
        'home': { name: 'Hogar / Alquiler', cat: 'finance', tags: 'casa hogar alquiler piso comunidad luz agua wifi gas', svg: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>' },
        'tag': { name: 'Ropa / Moda / Tag', cat: 'finance', tags: 'ropa compras zara moda estilo compras calzado', svg: '<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>' },
        'gift': { name: 'Regalo / Cumple', cat: 'finance', tags: 'regalo sorpresa fiesta detalle cumpleano amigo', svg: '<polyline points="20 12 20 22 4 22 4 12"/><rect width="20" height="5" x="2" y="7"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>' },
        'beer': { name: 'Ocio / Bares / Fiesta', cat: 'finance', tags: 'cerveza copa bar bares fiesta caña ocio salir noche amigos', svg: '<path d="M17 11h1a3 3 0 0 1 0 6h-1M9 12v6M13 12v6M5 8h12v11a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V8Z"/><path d="M5 8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2"/>' },

        // --- 5. ESTILO DE VIDA, TECNOLOGÍA & OCIO ---
        'smartphone': { name: 'Móvil / Pantalla', cat: 'lifestyle', tags: 'movil telefono redes instagram tiktok pantalla limite tiempo', svg: '<rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>' },
        'monitor': { name: 'Ordenador / Setup', cat: 'lifestyle', tags: 'pantalla monitor pc gaming tecnologia ordenador escritorio', svg: '<rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>' },
        'gamepad': { name: 'Videojuegos / Ocio', cat: 'lifestyle', tags: 'videojuegos play xbox switch jugar ocio diversion relax', svg: '<line x1="6" y1="12" x2="10" y2="12"/><line x1="8" y1="10" x2="8" y2="14"/><line x1="15" y1="13" x2="15.01" y2="13"/><line x1="18" y1="11" x2="18.01" y2="11"/><rect width="20" height="12" x="2" y="6" rx="6"/>' },
        'headphones': { name: 'Música / Podcast', cat: 'lifestyle', tags: 'musica auriculares cascos podcast spotify concentracion audio', svg: '<path d="M3 18v-6a9 9 0 0 1 18 0v6M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/>' },
        'film': { name: 'Cine / Películas', cat: 'lifestyle', tags: 'cine pelicula serie netflix cine filmin ver entretenimiento', svg: '<rect width="20" height="20" x="2" y="2" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/>' },
        'plane': { name: 'Viajes / Vacaciones', cat: 'lifestyle', tags: 'avion viaje viajar vacaciones vuelo escapada turismo', svg: '<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>' },
        'smile': { name: 'Sonrisa / Ánimo', cat: 'lifestyle', tags: 'sonrisa animo humor felicidad positividad bienestar', svg: '<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>' },
        'star': { name: 'Estrella / Prioridad', cat: 'lifestyle', tags: 'estrella favorito importante destacada clave exito', svg: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>' },
        'shield': { name: 'Escudo / Disciplina', cat: 'lifestyle', tags: 'escudo proteccion disciplina seguridad constancia autocontrol', svg: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>' },
        'sparkles': { name: 'Chispas / Hábitos', cat: 'lifestyle', tags: 'chispas magia brillo evolucion transformar nuevo', svg: '<path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/><path d="m5 3 1 2 2 1-2 1-1 2-1-2-2-1 2-1Z"/>' }
      };

      // Helper universal para renderizar el icono vectorial SVG o emoji según corresponda
      function renderItemIcon(iconIdOrEmoji, className = 'w-4 h-4', fallbackIcon = 'star') {
        if (!iconIdOrEmoji) {
          const fb = SVG_ICON_LIBRARY[fallbackIcon] || SVG_ICON_LIBRARY['star'];
          return `<svg class="${className} shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${fb.svg}</svg>`;
        }

        // Si es un ID de la biblioteca SVG
        if (SVG_ICON_LIBRARY[iconIdOrEmoji]) {
          const it = SVG_ICON_LIBRARY[iconIdOrEmoji];
          return `<svg class="${className} shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${it.svg}</svg>`;
        }

        // Si es un emoji antiguo o texto corto
        return `<span class="inline-flex items-center justify-center leading-none text-center shrink-0 ${className}">${iconIdOrEmoji}</span>`;
      }

      const DEFAULT_STATE = {
        deviceProfiles: {},
        activeDeviceProfileId: null,
        uiPreferences: {
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
          habitsSplitPercent: 38,
          welcomeDismissed: false,
          gridLayouts: {
            desktop: {
              tab1: {
                topKpisWrapper: { col: 1, colSpan: 12, row: 1, minRows: 2, manualRows: null, rowSpan: 2, name: 'Métricas & 4 KPIs Semanales' },
                todayFocusContainer: { col: 1, colSpan: 12, row: 3, minRows: 16, manualRows: null, rowSpan: 18, name: 'Hábitos: Hoy y Matriz Semanal' },
                notesMiniCalendarPanel: { col: 1, colSpan: 6, row: 21, minRows: 8, manualRows: null, rowSpan: 8, name: 'Calendario' },
                interactiveListsPanel: { col: 7, colSpan: 6, row: 21, minRows: 14, manualRows: null, rowSpan: 14, name: 'Listas y Tareas' },
                tab1RecentExpensesBar: { col: 1, colSpan: 6, row: 29, minRows: 4, manualRows: null, rowSpan: 4, name: 'Movimientos Recientes' }
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
            },
            mobile: {
              tab1: ['todayFocusContainer', 'interactiveListsPanel', 'tab1RecentExpensesBar', 'notesMiniCalendarPanel'],
              tab2: ['tab2ModularHabitsSection', 'tab2ScheduleSection', 'tab2AttendanceRulesSection'],
              tab3: ['tab3BudgetConfigCard', 'tab3SavingsGoalsCard', 'tab3PiggyCard', 'tab3ExpensesTableCard', 'tab3FixedExpensesCard'],
              tab4: ['tab4StudyAuditSection', 'tab4CustomHabitsSection', 'tab4AnatomyCard', 'tab4RunningRadarCard', 'tab4EvolutionSection']
            }
          }
        },
        version: 4,
        theme: 'dark',
        themePalette: 'emerald',
        currentWeek: 1,
        viewingWeek: 1,
        isReadOnlyLocked: false,
        activeTab: 1,
        activeWorkspaceId: 'ws-1',
        workspaces: [],
        globalSidebar: { isOpen: false, position: 'right', widgets: [] },
        globalDock: { widgets: ['dockPomoPill', 'dockExpensePill'] },
        startDate: new Date().toISOString().split('T')[0],
        piggyBank: { balance: 0.00, history: [] },
        savingsGoals: [],
        carryOverToCurrent: 0.00,
        deletedBaseModules: [],
        enabledModules: {
          gym: true,
          run: true,
          study: true,
          academic: true,
          nutri: true,
          budget: true
        },
        customHabits: [],
        goalsTemplate: {
          gymSessions: 4,
          runSessions: 3,
          runKm: 15.0,
          nutri: { phase: 'volumen', kcal: 2800, margin: 150, prot: 160, minDays: 6 },
          academic: { attMinPercent: 85, termWeeks: 15 },
          studyHoursDaily: [3.0, 3.0, 3.0, 3.0, 3.0, 0.0, 0.0]
        },
        scheduleTemplate: [
          [{ id: 's1', subject: 'Cálculo', type: 'T', time: '09:00 - 11:00' }],
          [{ id: 's2', subject: 'Física', type: 'P', time: '11:00 - 13:00' }],
          [{ id: 's3', subject: 'Programación', type: 'T', time: '09:00 - 11:00' }],
          [{ id: 's4', subject: 'Cálculo', type: 'P', time: '11:00 - 13:00' }],
          [{ id: 's5', subject: 'Física', type: 'T', time: '09:00 - 11:00' }],
          [],
          []
        ],
        subjectRules: {
          'Cálculo': { ruleType: 'percent', minPercent: 85, fixedMaxFails: 3 },
          'Física': { ruleType: 'percent', minPercent: 85, fixedMaxFails: 3 },
          'Programación': { ruleType: 'percent', minPercent: 85, fixedMaxFails: 3 }
        },
        customWorkoutMuscles: {
          'brazo': ['biceps', 'triceps', 'forearms'],
          'hombro': ['delts', 'traps'],
          'espalda': ['lats', 'traps', 'lower_back', 'biceps']
        },
        manualMuscleStimulus: {},
        financeSettings: {
          mode: 'manual',
          manualBudget: 60.00,
          monthlyIncome: 800.00,
          monthlySavingsGoal: 200.00,
          antThreshold: 5.00,
          customCategories: [
            { id: 'cat_super', name: 'Súper', emoji: '🛒' },
            { id: 'cat_cafe', name: 'Café', emoji: '☕' },
            { id: 'cat_ocio', name: 'Ocio', emoji: '🍻' },
            { id: 'cat_otros', name: 'Otros', emoji: '📦' }
          ]
        },
        lastFixedResetMonth: new Date().toISOString().slice(0, 7),
        monthlyFixedItems: [
          { id: 'f1', name: 'Gimnasio', amount: 35.00, paid: true },
          { id: 'f2', name: 'Móvil', amount: 15.00, paid: false },
          { id: 'f3', name: 'Transporte', amount: 20.00, paid: true }
        ],
        lists: {
          entregas: [
            { id: 'e1', title: 'Entrega Práctica Cálculo', note: 'Ejercicios 1 al 8', date: new Date(Date.now() + 86400000*3).toISOString().split('T')[0], pinned: true, status: 'pending', children: [] }
          ],
          notas: [],
          compras: [],
          objetivos: []
        },
        weeks: {},
        pomo: {
          preset: '25-5',
          studyMin: 25,
          restMin: 5,
          timeLeft: 1500,
          isRunning: false,
          targetEndTime: null,
          lastTick: null,
          phase: 'work',
          effectiveSeconds: 0,
          selectedSubject: 'Estudio General',
          sound: 'bowl',
          volume: 80
        },
        dictionary: {
          frequentConcepts: ['Mercadona', 'Café', 'Comedor', 'Metro', 'Copistería']
        },
        ui: {
          dailyViewMode: 'today', // 'week' | 'today'
          habitsSubView: 'today',
          habitsSplitPercent: 38,
          weekTableCollapsed: true,
          listTab: 'entregas',
          listSort: 'manual',
          labScope: 'week',
          evolMetric: 'score',
          selectedMuscle: null
        }
      };

      // ESTADO DEL MINI-CALENDARIO DE NOTAS
      let miniCalendarState = {
        year: new Date().getFullYear(),
        month: new Date().getMonth(),
        selectedDateStr: null,
        isCollapsed: false
      };

      // AUDIO API
      let audioCtx = null;

      // Helper de compatibilidad para iconos vectoriales
      function renderIcon(iconId, className, fallback) {
        return typeof renderItemIcon === 'function' ? renderItemIcon(iconId, className, fallback) : '';
      }
      window.renderIcon = renderIcon;

      function getAudioContext() {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (audioCtx.state === 'suspended') audioCtx.resume();
        return audioCtx;
      }

      function playTone(freq, duration, type = 'sine', gainVal = 0.15) {
        try {
          const volFactor = ((state && state.pomo && state.pomo.volume !== undefined) ? state.pomo.volume : 80) / 100;
          if (volFactor <= 0) return;
          const ctx = getAudioContext();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = type;
          osc.frequency.setValueAtTime(freq, ctx.currentTime);
          gain.gain.setValueAtTime(gainVal * volFactor, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start();
          osc.stop(ctx.currentTime + duration);
        } catch (_) {}
      }

      function playTickSound() { playTone(880, 0.04, 'sine', 0.08); }

      function playSoundAlarm(type = 'bowl') {
        try {
          const ctx = getAudioContext();
          if (type === 'silent') {
            return;
          } else if (type === 'bowl') {
            [261.63, 392.00, 523.25].forEach((f, i) => {
              setTimeout(() => playTone(f, 2.4, 'sine', 0.12), i * 180);
            });
          } else if (type === 'chord') {
            [440, 554.37, 659.25, 880].forEach((f, i) => {
              setTimeout(() => playTone(f, 0.65, 'triangle', 0.1), i * 85);
            });
          } else if (type === 'bell') {
            // Campana Cristalina: brillo limpio y resonancia cristalina
            [587.33, 880, 1174.66, 1760].forEach((f, i) => {
              setTimeout(() => playTone(f, 1.8, 'sine', 0.09 / (i + 1)), i * 60);
            });
          } else if (type === 'pulse') {
            // Pulso Digital: doble pulso moderno estilo smartwatch
            playTone(784, 0.08, 'square', 0.08);
            setTimeout(() => playTone(987.77, 0.12, 'square', 0.08), 120);
          } else {
            playTone(440, 0.5, 'sine', 0.2);
          }
        } catch (_) {}
      }

      let titleFlashInterval = null;
      let screenFlashTimeout = null;
      function triggerPomoAlert(phase, sound) {
        // 1. Sonido escalado por volumen (no sonará si está en 'silent')
        playSoundAlarm(sound || (state?.pomo?.sound) || 'bowl');

        // 2. Alerta visual perimetral de pantalla (#zenScreenFlash) con parpadeo de alta visibilidad
        const flashEl = document.getElementById('zenScreenFlash');
        if (flashEl) {
          if (screenFlashTimeout) clearTimeout(screenFlashTimeout);
          flashEl.classList.remove('hidden');
          flashEl.classList.add('zen-flash-active');
          screenFlashTimeout = setTimeout(() => {
            flashEl.classList.remove('zen-flash-active');
            flashEl.classList.add('hidden');
            screenFlashTimeout = null;
          }, 3500);
        }

        // 3. Destello de alerta dinámico en el título de la pestaña
        if (titleFlashInterval) clearInterval(titleFlashInterval);
        const originalTitle = document.title || 'Centro de Control';
        const alertTitle = phase === 'work' ? '¡ENFOQUE CUMPLIDO!' : '¡DESCANSO TERMINADO!';
        let flashStep = 0;
        titleFlashInterval = setInterval(() => {
          document.title = (flashStep % 2 === 0) ? alertTitle : originalTitle;
          flashStep++;
          if (flashStep >= 12) {
            clearInterval(titleFlashInterval);
            titleFlashInterval = null;
            document.title = originalTitle;
          }
        }, 500);

        // 4. Notificación de escritorio si está en segundo plano
        if ('Notification' in window && Notification.permission === 'granted') {
          try {
            new Notification('⏱️ Centro de Control - Pomodoro', {
              body: phase === 'work' ? '¡Bloque de enfoque completado! Tómate un respiro merecido.' : '¡Descanso terminado! Volvamos al bloque de enfoque.',
              icon: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"%3E%3Ccircle cx="12" cy="12" r="10" fill="%231D4ED8"/%3E%3C/svg%3E'
            });
          } catch (_) {}
        }
      }

      // Funciones de gestión de Wake Lock (evita que la pantalla se apague en iPad / tablets / móviles durante el Pomodoro)
      async function requestPomoWakeLock() {
        if ('wakeLock' in navigator) {
          try {
            if (!pomoWakeLock) {
              pomoWakeLock = await navigator.wakeLock.request('screen');
              pomoWakeLock.addEventListener('release', () => {
                pomoWakeLock = null;
              });
            }
          } catch (err) {
            // Wake Lock puede ser denegado por batería baja o configuración del sistema
            console.log('Wake Lock no disponible o denegado:', err);
          }
        }
      }

      async function releasePomoWakeLock() {
        if (pomoWakeLock) {
          try {
            await pomoWakeLock.release();
          } catch (_) {}
          pomoWakeLock = null;
        }
      }

      // Sincronización precisa de Pomodoro contra el reloj de la vida real (Date.now)
      // Resuelve la congelación del temporizador al apagarse o bloquearse la pantalla en iPad / iOS / Android
      function syncPomoTime(now = Date.now()) {
        const p = state?.pomo;
        if (!p || !p.isRunning) return;

        if (p.targetEndTime) {
          if (p.targetEndTime > now) {
            const remaining = Math.max(0, Math.round((p.targetEndTime - now) / 1000));
            const elapsedSec = p.timeLeft - remaining;
            if (elapsedSec > 0 && p.phase === 'work') {
              p.effectiveSeconds = (p.effectiveSeconds || 0) + elapsedSec;
            }
            p.timeLeft = remaining;
            p.lastTick = now;
            renderPomodoroUI();
            return;
          } else {
            // El tiempo objetivo se ha cumplido
            if (p.phase === 'work') {
              p.effectiveSeconds = (p.effectiveSeconds || 0) + p.timeLeft;
            }
            const expiredPhase = p.phase;
            p.isRunning = false;
            p.targetEndTime = null;
            p.lastTick = null;
            if (pomoTimerInterval) {
              clearInterval(pomoTimerInterval);
              pomoTimerInterval = null;
            }
            releasePomoWakeLock();
            triggerPomoAlert(expiredPhase, p.sound);

            // Avanzar a la siguiente fase
            p.phase = expiredPhase === 'work' ? 'rest' : 'work';
            p.timeLeft = (p.phase === 'work' ? p.studyMin : p.restMin) * 60;
            renderPomodoroUI();
            if (typeof app !== 'undefined' && app.showToast) {
              app.showToast(`¡Tiempo de ${p.phase === 'work' ? 'Enfoque' : 'Descanso'}!`, 'info', 5000);
            }
            saveState();
            return;
          }
        }

        const lastTick = p.lastTick || now;
        const elapsedSec = Math.floor((now - lastTick) / 1000);
        if (elapsedSec <= 0) return;

        p.lastTick = now;

        if (p.timeLeft > elapsedSec) {
          p.timeLeft -= elapsedSec;
          if (p.phase === 'work') {
            p.effectiveSeconds = (p.effectiveSeconds || 0) + elapsedSec;
          }
          renderPomodoroUI();
        } else {
          // El bloque actual ha expirado mientras la pantalla estaba bloqueada o en reposo
          const remainingInCurrent = p.timeLeft;
          if (p.phase === 'work') {
            p.effectiveSeconds = (p.effectiveSeconds || 0) + remainingInCurrent;
          }
          const expiredPhase = p.phase;
          p.isRunning = false;
          p.targetEndTime = null;
          p.lastTick = null;
          if (pomoTimerInterval) {
            clearInterval(pomoTimerInterval);
            pomoTimerInterval = null;
          }
          releasePomoWakeLock();
          triggerPomoAlert(expiredPhase, p.sound);

          // Avanzar a la siguiente fase
          p.phase = expiredPhase === 'work' ? 'rest' : 'work';
          p.timeLeft = (p.phase === 'work' ? p.studyMin : p.restMin) * 60;
          renderPomodoroUI();
          if (typeof app !== 'undefined' && app.showToast) {
            app.showToast(`¡Tiempo de ${p.phase === 'work' ? 'Enfoque' : 'Descanso'}!`, 'info', 5000);
          }
          saveState();
        }
      }

      function checkAndResumePomo() {
        const p = state?.pomo;
        if (!p) return;
        if (p.isRunning && p.targetEndTime) {
          const now = Date.now();
          if (p.targetEndTime > now) {
            const remaining = Math.max(0, Math.round((p.targetEndTime - now) / 1000));
            p.timeLeft = remaining;
            p.lastTick = now;
            if (pomoTimerInterval) clearInterval(pomoTimerInterval);
            requestPomoWakeLock();
            pomoTimerInterval = setInterval(() => {
              syncPomoTime();
            }, 1000);
          } else {
            p.timeLeft = 0;
            p.isRunning = false;
            p.targetEndTime = null;
            p.lastTick = null;
            if (pomoTimerInterval) {
              clearInterval(pomoTimerInterval);
              pomoTimerInterval = null;
            }
            releasePomoWakeLock();
            triggerPomoAlert(p.phase, p.sound);
          }
          renderPomodoroUI();
        }
      }
      window.checkAndResumePomo = checkAndResumePomo;

      // ESTADO GLOBAL Y PERSISTENCIA
var state = null;
var pomoTimerInterval = null;
var pomoWakeLock = null;
var lastDeletedItem = null;
var undoTimeout = null;
var fileHandle = null;
var activeCustomModalContext = null;
var activeScheduleAddContext = null; // { dayIdx, classType: 'T' }
var activeCustomRunContext = null; // { dayIdx, sIdx }
var activeSubjectPromptContext = null; // { mode: 'add'|'rename', oldName }
      let activeSubtaskPromptContext = null; // { cat, itemId }
      let activeSubtaskSeriesContext = null; // { cat, itemId }
      let manualSeriesDates = {}; // { [idx]: { date, time } }
      let activeSmartDuplicateContext = null; // { cat, id }
      let activeMoveContext = null; // { cat, id, sourceNode }
      let moveModalExpandedIds = new Set();
      let activeActionsMenuContext = null; // { cat, id, node, isContainer, pinned }
      let activeExpenseMenuContext = null; // { expenseId }
      let activeHabitMenuContext = null; // { habitId }
      let activeClassMenuContext = null; // { dIdx, cIdx }
      let activeSubjectMenuContext = null; // { subjectName }
      let activeWorkspaceTabContext = null; // { wsId }
      let piggyModalCurrentType = 'deposit'; // 'deposit' | 'withdraw'
      let piggyModalCalculatedValue = 0;
      let customConfirmResolve = null;
      let draggedItemData = null; // { cat, id }
      let touchDragTimer = null;
      let touchStartPos = { x: 0, y: 0 };
      let isTouchDragging = false;
      let currentTouchTargetEl = null;
      let datePickerState = {
        activeInput: null,
        year: new Date().getFullYear(),
        month: new Date().getMonth(),
        selectedDateStr: ''
      };

      // ESTADO DE SELECCIÓN MÚLTIPLE DE NOTAS
      let selectedListItemIds = new Set();
      let lastSelectedId = null;
      let visibleListItemIds = [];
      let selectionModeActive = false;
      
      // PILA DE DESHACER (HISTORIAL GLOBAL PARA CTRL+Z)
      const undoStack = [];
      const MAX_UNDO = 35;

      function pushUndo(actionName = 'Acción') {
        try {
          if (!state) return;
          const snapshot = JSON.parse(JSON.stringify(state));
          undoStack.push({ actionName, snapshot });
          if (undoStack.length > MAX_UNDO) undoStack.shift();
        } catch (_) {}
      }
      if (typeof window !== 'undefined') {
        window.pushUndo = pushUndo;
        window.undoStack = undoStack;
      }

      // PERSISTENCIA DE MANEJADOR DE ARCHIVO DISCO / DRIVE VÍA INDEXEDDB
      const IDB_NAME = 'CENTRO_CONTROL_IDB';
      const IDB_STORE = 'handles';

      function openHandlesDB() {
        return new Promise((resolve, reject) => {
          if (!window.indexedDB) return reject(new Error('IndexedDB no disponible'));
          const req = indexedDB.open(IDB_NAME, 1);
          req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(IDB_STORE)) {
              db.createObjectStore(IDB_STORE);
            }
          };
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
      }

      async function storeFileHandleInDB(handle) {
        try {
          const db = await openHandlesDB();
          return new Promise((resolve, reject) => {
            const tx = db.transaction(IDB_STORE, 'readwrite');
            tx.objectStore(IDB_STORE).put(handle, 'drive_file_handle');
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
          });
        } catch (_) {}
      }

      async function clearStoredFileHandleFromDB() {
        try {
          const db = await openHandlesDB();
          return new Promise((resolve) => {
            const tx = db.transaction(IDB_STORE, 'readwrite');
            tx.objectStore(IDB_STORE).delete('drive_file_handle');
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
          });
        } catch (_) {}
      }
      async function getStoredFileHandleFromDB() {
        try {
          const db = await openHandlesDB();
          return new Promise((resolve) => {
            const tx = db.transaction(IDB_STORE, 'readonly');
            const req = tx.objectStore(IDB_STORE).get('drive_file_handle');
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => resolve(null);
          });
        } catch (_) {
          return null;
        }
      }

      // ========================================================
      // GOOGLE DRIVE CLOUD REST API SYNC ENGINE (PC, IPAD, IPHONE)
      // ========================================================
      const GOOGLE_CLIENT_ID = '476175954573-hnkthgi1rogipd4q2999oid916virp25.apps.googleusercontent.com';
      const GOOGLE_DRIVE_FILENAME = 'centro_control_data.json';
      const GOOGLE_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
var gdriveAccessToken = localStorage.getItem('gdrive_access_token') || null;
var gdriveTokenExpiry = parseInt(localStorage.getItem('gdrive_token_expiry'), 10) || 0;
var gdriveUserEmail = localStorage.getItem('gdrive_user_email') || null;
var gdriveFileId = localStorage.getItem('gdrive_file_id') || null;
var tokenClient = null;
var isGdriveSyncing = false;
var isDriveRequestActive = false;
var lastDriveSyncTimestamp = 0;
var gdriveDebounceTimer = null;

      function logDriveDebug(message, isError = false) {
        const box = document.getElementById('driveLiveDebugBox');
        const timeStr = new Date().toLocaleTimeString();
        const colorClass = isError ? 'text-rose-500 font-semibold' : 'text-stone-600 dark:text-slate-300';
        console.log(`[Drive ${timeStr}] ${message}`);
        if (box) {
          if (box.querySelector('.italic')) {
            box.innerHTML = '';
          }
          const line = document.createElement('div');
          line.className = `leading-tight text-[9.5px] truncate ${colorClass}`;
          line.textContent = `[${timeStr}] ${message}`;
          box.prepend(line);
          while (box.children.length > 30) {
            box.removeChild(box.lastChild);
          }
        }
      }
      window.logDriveDebug = logDriveDebug;
      window.clearDriveDebug = () => {
        const box = document.getElementById('driveLiveDebugBox');
        if (box) box.innerHTML = '<div class="italic text-stone-400 dark:text-slate-500">Sin eventos registrados</div>';
      };

      let last401ToastTime = 0;
      function handleDrive401() {
        gdriveAccessToken = null;
        gdriveTokenExpiry = 0;
        localStorage.removeItem('gdrive_access_token');
        localStorage.removeItem('gdrive_token_expiry');
        updateGdriveUI('RENOVAR SESIÓN', 'bg-amber-950 text-amber-300 border border-amber-700');
        logDriveDebug('Error 401: Sesión de Google Drive expirada.', true);
        const now = Date.now();
        if (now - last401ToastTime > 15000) {
          last401ToastTime = now;
          if (window.renderSystemToast) {
            window.renderSystemToast('Sesión de Google Drive expirada. Pulsa Sincronizar para reconectar.', 'warning', 4000);
          }
        }
      }

      function getLocalDeviceId() {
        let devId = localStorage.getItem('cc_local_device_id');
        if (!devId) {
          devId = 'dev_' + Math.random().toString(36).substr(2, 9);
          localStorage.setItem('cc_local_device_id', devId);
        }
        return devId;
      }

      function isGdriveConnected() {
        return !!(gdriveAccessToken && Date.now() < gdriveTokenExpiry);
      }

      function formatSyncTime(ts) {
        if (!ts || isNaN(ts)) return 'Nunca';
        const d = new Date(Number(ts));
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const hours = String(d.getHours()).padStart(2, '0');
        const mins = String(d.getMinutes()).padStart(2, '0');
        const secs = String(d.getSeconds()).padStart(2, '0');
        return `${day}/${month} ${hours}:${mins}:${secs}`;
      }

      function updateGdriveUI(statusText, badgeClass = null) {
        const badge = document.getElementById('driveSyncStatusBadge');
        const emailSpan = document.getElementById('driveSyncUserEmail');
        const connectBtnTxt = document.getElementById('driveConnectBtnText');
        const loggedOutActions = document.getElementById('driveLoggedOutActions');
        const loggedInActions = document.getElementById('driveLoggedInActions');
        const descText = document.getElementById('driveSyncDescText');
        const changeAccountTxt = document.getElementById('driveAccountActionBtnText');
        
        const hasSession = !!gdriveUserEmail;
        const isOnline = isGdriveConnected();

        if (loggedOutActions && loggedInActions) {
          loggedOutActions.classList.toggle('hidden', hasSession);
          loggedInActions.classList.toggle('hidden', !hasSession);
        }

        if (hasSession) {
          if (emailSpan) {
            emailSpan.textContent = gdriveUserEmail;
            emailSpan.classList.remove('hidden');
          }
          if (descText) {
            descText.textContent = isOnline ? 'Sincronizado con Google Drive.' : 'Sesión pausada. Pulsa Sincronizar para reconectar.';
          }
          if (changeAccountTxt) {
            changeAccountTxt.textContent = 'Cuenta';
          }
        } else {
          if (emailSpan) emailSpan.classList.add('hidden');
          if (descText) {
            descText.textContent = 'Vincula tu cuenta de Google para guardar y sincronizar entre dispositivos.';
          }
          if (connectBtnTxt) connectBtnTxt.textContent = 'Iniciar Sesión con Google';
        }

        // Diagnóstico visual en el modal
        const lastSyncEl = document.getElementById('driveLastSyncTimeText');
        if (lastSyncEl) {
          const lastTs = localStorage.getItem('gdrive_last_synced_time');
          lastSyncEl.textContent = formatSyncTime(lastTs);
        }
        const localModEl = document.getElementById('driveLocalModTimeText');
        if (localModEl) {
          localModEl.textContent = formatSyncTime(state.updatedAt);
        }

        if (badge) {
          if (statusText) badge.textContent = statusText;
          if (badgeClass) {
            badge.className = `px-2 py-0.5 rounded font-mono text-[9px] font-bold ${badgeClass}`;
          } else if (isGdriveConnected()) {
            badge.className = 'px-2 py-0.5 rounded font-mono text-[9px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-700';
            badge.textContent = 'CONECTADO';
          } else if (gdriveUserEmail) {
            badge.className = 'px-2 py-0.5 rounded font-mono text-[9px] font-bold bg-amber-950 text-amber-300 border border-amber-700';
            badge.textContent = 'RENOVAR SESIÓN';
          } else {
            badge.className = 'px-2 py-0.5 rounded font-mono text-[9px] font-bold bg-slate-800 text-slate-400';
            badge.textContent = 'NO CONECTADO';
          }
        }

        const dot = document.getElementById('autoSaveIndicatorDot');
        if (dot) {
          if (isGdriveConnected()) {
            dot.className = 'w-2.5 h-2.5 rounded-full bg-theme-main animate-pulse cursor-pointer hover:scale-125 transition shrink-0';
            dot.title = `Sincronizado con Google Drive (${gdriveUserEmail || 'Activo'})`;
          } else if (gdriveUserEmail) {
            dot.className = 'w-2.5 h-2.5 rounded-full bg-theme-accent cursor-pointer hover:scale-125 transition shrink-0';
            dot.title = 'Sesión de Google Drive expirada (clic para renovar)';
          } else if (fileHandle) {
            dot.className = 'w-2.5 h-2.5 rounded-full bg-theme-main/80 cursor-pointer hover:scale-125 transition shrink-0';
            dot.title = 'Autoguardado en archivo local activo';
          } else {
            dot.className = 'w-2.5 h-2.5 rounded-full bg-stone-400 dark:bg-slate-600 cursor-pointer hover:scale-125 transition shrink-0';
            dot.title = 'Sin sincronización activa (clic para conectar Drive)';
          }
        }

        const reconnectChip = document.getElementById('headerGdriveReconnectChip');
        if (reconnectChip) {
          const needsReconnect = !!gdriveUserEmail && !isGdriveConnected();
          reconnectChip.classList.toggle('hidden', !needsReconnect);
        }
      }

      let pendingForceAction = null;

      function initGsiClient() {
        if (!window.google || !window.google.accounts || !window.google.accounts.oauth2) return;
        if (!tokenClient) {
          tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: GOOGLE_CLIENT_ID,
            scope: GOOGLE_DRIVE_SCOPE,
            prompt: '',
            callback: () => {}
          });
        }
      }

      async function ensureGdriveToken(interactive = false, forceSelectAccount = false) {
        if (!forceSelectAccount && isGdriveConnected()) return gdriveAccessToken;
        if (!window.google || !window.google.accounts || !window.google.accounts.oauth2) {
          logDriveDebug('Google Identity Services no está listo.', true);
          return null;
        }
        initGsiClient();
        if (!tokenClient) {
          logDriveDebug('No se pudo inicializar tokenClient.', true);
          return null;
        }

        if (!interactive) {
          updateGdriveUI();
          return null;
        }

        return new Promise((resolve) => {
          let hasResolved = false;
          tokenClient.callback = async (resp) => {
            if (resp.error) {
              logDriveDebug('Error OAuth: ' + (resp.error_description || resp.error), true);
              updateGdriveUI('ERROR', 'bg-rose-950 text-rose-300 border border-rose-700');
              if (!hasResolved) {
                hasResolved = true;
                resolve(null);
              }
              return;
            }
            if (resp.access_token) {
              gdriveAccessToken = resp.access_token;
              gdriveTokenExpiry = Date.now() + (parseInt(resp.expires_in, 10) - 120) * 1000;
              localStorage.setItem('gdrive_access_token', gdriveAccessToken);
              localStorage.setItem('gdrive_token_expiry', gdriveTokenExpiry);

              try {
                const userRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                  headers: { Authorization: `Bearer ${gdriveAccessToken}` }
                });
                if (userRes.ok) {
                  const uData = await userRes.json();
                  gdriveUserEmail = uData.email || 'Conectado';
                  localStorage.setItem('gdrive_user_email', gdriveUserEmail);
                }
              } catch (_) {}

              logDriveDebug('Token OAuth concedido para ' + (gdriveUserEmail || 'usuario'));
              updateGdriveUI();
              if (window.renderSystemToast) {
                window.renderSystemToast('¡Conectado a Google Drive!', 'success', 2500);
              }
              if (!hasResolved) {
                hasResolved = true;
                resolve(resp.access_token);
              }
            } else {
              if (!hasResolved) {
                hasResolved = true;
                resolve(null);
              }
            }
          };

          const requestOpts = {};
          if (forceSelectAccount || !gdriveUserEmail) {
            requestOpts.prompt = 'select_account';
          } else {
            requestOpts.prompt = '';
            requestOpts.hint = gdriveUserEmail;
          }

          logDriveDebug('Solicitando token a Google (' + (requestOpts.prompt || 'auto') + ')...');
          try {
            tokenClient.requestAccessToken(requestOpts);
          } catch (tokErr) {
            logDriveDebug('Fallo en requestAccessToken: ' + tokErr.message, true);
            if (!hasResolved) {
              hasResolved = true;
              resolve(null);
            }
          }
        });
      }

      async function findGdriveFileId(token, forceRefresh = false) {
        if (gdriveFileId && !forceRefresh) return gdriveFileId;
        logDriveDebug('Buscando archivo ' + GOOGLE_DRIVE_FILENAME + ' en Drive...');
        const q = encodeURIComponent(`name = '${GOOGLE_DRIVE_FILENAME}' and trashed = false`);
        try {
          const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id, name, modifiedTime)&orderBy=modifiedTime desc`, {
            cache: 'no-store',
            headers: { Authorization: `Bearer ${token}` }
          });
          if (!res.ok) {
            if (res.status === 401) {
              handleDrive401();
            } else {
              logDriveDebug(`Fallo búsqueda Drive HTTP ${res.status}`, true);
            }
            return null;
          }
          const data = await res.json();
          if (data.files && data.files.length > 0) {
            gdriveFileId = data.files[0].id;
            localStorage.setItem('gdrive_file_id', gdriveFileId);
            logDriveDebug(`Archivo encontrado: ${gdriveFileId.substr(0, 8)}... (${data.files[0].modifiedTime || ''})`);
            return gdriveFileId;
          } else {
            logDriveDebug('No se encontró archivo ' + GOOGLE_DRIVE_FILENAME + ' en Drive.');
            gdriveFileId = null;
            localStorage.removeItem('gdrive_file_id');
            return null;
          }
        } catch (err) {
          logDriveDebug('Error en búsqueda de archivo: ' + err.message, true);
          return null;
        }
      }
var pendingCloudConflictJson = null;

      function hasUserData(st) {
        if (!st) return false;
        try {
          if (st.weeks) {
            const wkList = Array.isArray(st.weeks) ? st.weeks : Object.values(st.weeks);
            if (wkList.some(w => Array.isArray(w?.expenses) && w.expenses.length > 0)) return true;
            if (wkList.some(w => Array.isArray(w?.studyRealHours) && w.studyRealHours.some(h => Number(h) > 0))) return true;
            if (wkList.some(w => Array.isArray(w?.days) && w.days.some(d =>
              (d?.gym && Number(d.gym.sessions) > 0) ||
              (d?.run && (Number(d.run.km) > 0 || Number(d.run.sessions) > 0)) ||
              (d?.nutrition && (d.nutrition === 'success' || d.nutrition === 'fail' || Number(d.nutritionKcal) > 0))
            ))) return true;
            if (wkList.some(w => w?.customHabitsData && Object.values(w.customHabitsData).some(arr =>
              Array.isArray(arr) && arr.some(v => v !== null && v !== false && v !== 0 && v !== '')
            ))) return true;
          }
          if (Array.isArray(st.customHabits) && st.customHabits.length > 0) return true;
          if (Array.isArray(st.savingsGoals) && st.savingsGoals.length > 0) return true;
          if (st.piggyBank && Array.isArray(st.piggyBank.history) && st.piggyBank.history.length > 0) return true;
          if (st.lists && typeof st.lists === 'object') {
            const listCats = Object.values(st.lists);
            if (listCats.some(arr => Array.isArray(arr) && arr.length > 0)) return true;
          }
        } catch (_) {}
        return false;
      }

      function applyCloudDownload(cloudJson, cloudTimestamp, myDeviceId) {
        logDriveDebug('Aplicando descarga de la nube...');
        try {
          localStorage.setItem('centro_control_pre_sync_backup', JSON.stringify(state));
        } catch (_) {}

        try {
          const conflictModal = document.getElementById('modalSyncConflict');
          if (conflictModal) conflictModal.classList.add('hidden');
          const backupModal = document.getElementById('backupModal');
          if (backupModal) backupModal.classList.add('hidden');
        } catch (_) {}

        state = sanitizeState(cloudJson);
        state.deviceId = myDeviceId;
        state.lastSyncedCloudUpdatedAt = cloudTimestamp;
        state.viewingWeek = state.currentWeek || 1;

        try {
          localStorage.setItem('CC_LOCAL_DEVICE_LAYOUT', JSON.stringify({
            workspaces: state.workspaces,
            gridLayouts: state.uiPreferences?.gridLayouts,
            globalSidebar: state.globalSidebar
          }));
        } catch (_) {}

        checkAndResumePomo();
        localStorage.setItem('gdrive_last_synced_time', String(cloudTimestamp));
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        pendingCloudConflictJson = null;

        if (window.WorkspacesManager) {
          try {
            window.WorkspacesManager.ensureWorkspaces();
            window.WorkspacesManager.mountActiveWorkspace();
          } catch (wmErr) {
            logDriveDebug('Error montando workspace: ' + wmErr.message, true);
          }
        }

        if (typeof window !== 'undefined' && typeof window.renderApp === 'function') {
          try { window.renderApp(); } catch (rErr) { console.warn('Error en renderApp tras descarga:', rErr); }
        } else if (typeof renderApp === 'function') {
          try { renderApp(); } catch (rErr) { console.warn('Error en renderApp tras descarga:', rErr); }
        }
        if (typeof app !== 'undefined' && app.applyGridLayout) {
          try { app.applyGridLayout(); } catch (_) {}
        }
        updateGdriveUI();
        logDriveDebug('¡Datos de Google Drive descargados y aplicados!');
        if (window.renderSystemToast) {
          window.renderSystemToast('Datos de Google Drive descargados y aplicados.', 'success');
        }
        return { success: true, action: 'downloaded', timestamp: cloudTimestamp };
      }

      async function syncGdriveCloud(allowPull = false, forceUpload = false, forceDownload = false) {
        if (isGdriveSyncing || isDriveRequestActive) {
          logDriveDebug('Sincronización rechazada: ya hay una petición en curso.');
          return { success: false, reason: 'already_syncing' };
        }

        // Throttling en segundo plano: no más de 1 petición cada 5 segundos
        const now = Date.now();
        if (!forceDownload && !forceUpload && (now - lastDriveSyncTimestamp < 5000)) {
          return { success: false, reason: 'throttled' };
        }

        isGdriveSyncing = true;
        isDriveRequestActive = true;
        lastDriveSyncTimestamp = now;

        updateGdriveUI('SINCRONIZANDO...', 'bg-blue-950 text-blue-300 border border-blue-700 animate-pulse');

        try {
          const isInteractive = forceDownload || forceUpload || allowPull;
          const token = isGdriveConnected() ? gdriveAccessToken : await ensureGdriveToken(isInteractive);
          if (!token) {
            updateGdriveUI();
            logDriveDebug('Sincronización cancelada: no hay token activo.');
            return { success: false, reason: 'no_token' };
          }

          const myDeviceId = getLocalDeviceId();

          // ========================
          // CASO 1: FORZAR DESCARGA
          // ========================
          if (forceDownload) {
            logDriveDebug('Ejecutando forzar bajada desde Drive...');
            const fileId = await findGdriveFileId(token, true);
            if (!fileId) {
              logDriveDebug('Forzar bajada falló: no existe archivo en Drive.', true);
              updateGdriveUI();
              if (window.renderSystemToast) {
                window.renderSystemToast('No se encontró ningún archivo en Google Drive. Sube tus datos primero con "Forzar Subida".', 'warning', 5000);
              }
              return { success: false, reason: 'file_not_found' };
            }
            const dlRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
              cache: 'no-store',
              headers: { Authorization: `Bearer ${token}` }
            });
            if (dlRes.status === 401) {
              handleDrive401();
              return { success: false, reason: 'token_expired' };
            }
            if (!dlRes.ok) {
              logDriveDebug(`Error HTTP al descargar archivo: ${dlRes.status}`, true);
              updateGdriveUI('ERROR', 'bg-rose-950 text-rose-300 border border-rose-700');
              return { success: false, reason: 'download_http_' + dlRes.status };
            }
            const cloudJson = await dlRes.json();
            const cloudTimestamp = Number(cloudJson?.updatedAt) || Date.now();
            return applyCloudDownload(cloudJson, cloudTimestamp, myDeviceId);
          }

          // ========================
          // CASO 2: FORZAR SUBIDA
          // ========================
          if (forceUpload) {
            logDriveDebug('Ejecutando forzar subida a Drive...');
            let fileId = await findGdriveFileId(token, true);
            state.updatedAt = Date.now();
            state.deviceId = myDeviceId;
            const content = JSON.stringify(state, null, 2);

            let uploadSuccess = false;
            if (fileId) {
              const patchRes = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
                method: 'PATCH',
                headers: {
                  Authorization: `Bearer ${token}`,
                  'Content-Type': 'application/json'
                },
                body: content
              });
              if (patchRes.ok) {
                uploadSuccess = true;
                logDriveDebug(`Archivo ${fileId.substr(0, 8)}... actualizado en Drive.`);
              } else if (patchRes.status === 401) {
                handleDrive401();
                return { success: false, reason: 'token_expired' };
              } else if (patchRes.status === 404) {
                fileId = null;
                gdriveFileId = null;
                localStorage.removeItem('gdrive_file_id');
              }
            }

            if (!fileId) {
              logDriveDebug('Creando nuevo archivo ' + GOOGLE_DRIVE_FILENAME + ' en Drive...');
              const metadata = {
                name: GOOGLE_DRIVE_FILENAME,
                mimeType: 'application/json'
              };
              const form = new FormData();
              form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
              form.append('file', new Blob([content], { type: 'application/json' }));

              const createRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
                body: form
              });
              if (createRes.ok) {
                const cData = await createRes.json();
                gdriveFileId = cData.id;
                localStorage.setItem('gdrive_file_id', gdriveFileId);
                uploadSuccess = true;
                logDriveDebug('Nuevo archivo creado con ID: ' + gdriveFileId.substr(0, 8) + '...');
              } else if (createRes.status === 401) {
                handleDrive401();
                return { success: false, reason: 'token_expired' };
              }
            }

            if (uploadSuccess) {
              localStorage.setItem('gdrive_last_synced_time', String(state.updatedAt));
              localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
              updateGdriveUI();
              logDriveDebug('¡Subida forzada completada con éxito!');
              if (window.renderSystemToast) {
                window.renderSystemToast('¡Copia local guardada en Google Drive con éxito!', 'success', 3500);
              }
              return { success: true, action: 'uploaded', timestamp: state.updatedAt };
            } else {
              updateGdriveUI('ERROR', 'bg-rose-950 text-rose-300 border border-rose-700');
              logDriveDebug('Fallo en la subida a Drive.', true);
              return { success: false, reason: 'upload_failed' };
            }
          }

          // ========================
          // CASO 3: SINCRONIZACIÓN INTELIGENTE (Auto o Manual)
          // ========================
          let fileId = (allowPull) ? await findGdriveFileId(token, true) : await findGdriveFileId(token);

          if (fileId) {
            try {
              const dlRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
                cache: 'no-store',
                headers: { Authorization: `Bearer ${token}` }
              });
              if (dlRes.status === 401) {
                handleDrive401();
                return { success: false, reason: 'token_expired' };
              }
              if (dlRes.status === 404) {
                fileId = await findGdriveFileId(token, true);
              } else if (dlRes.ok) {
                const cloudJson = await dlRes.json();
                if (cloudJson && (cloudJson.weeks || cloudJson.history)) {
                  const cloudTimestamp = Number(cloudJson.updatedAt) || 0;
                  const localTimestamp = Number(state.updatedAt) || 0;
                  const lastSynced = Number(localStorage.getItem('gdrive_last_synced_time') || 0);

                  const cloudHasData = hasUserData(cloudJson);
                  const localHasData = hasUserData(state);

                  // Caso virgen: si local no tiene datos y la nube sí
                  if (!localHasData && cloudHasData) {
                    logDriveDebug('Dispositivo local sin datos: descargando copia remota...');
                    return applyCloudDownload(cloudJson, cloudTimestamp, myDeviceId);
                  }

                  // Caso conflicto real: ambos modificados después del último sync por dispositivos distintos
                  const cloudChangedSinceSync = cloudTimestamp > (lastSynced + 3000);
                  const localChangedSinceSync = localTimestamp > (lastSynced + 3000);
                  const differentDevice = cloudJson.deviceId && (cloudJson.deviceId !== myDeviceId);

                  if (cloudHasData && localHasData && cloudChangedSinceSync && localChangedSinceSync && differentDevice && Math.abs(cloudTimestamp - localTimestamp) > 3000) {
                    logDriveDebug('Conflicto detectado entre dispositivo local y remoto.');
                    pendingCloudConflictJson = cloudJson;
                    updateGdriveUI('CONFLICTO', 'bg-amber-950 text-amber-300 border border-amber-700 animate-pulse');
                    if (typeof app !== 'undefined' && app.showSyncConflictModal) {
                      app.showSyncConflictModal(cloudJson);
                    }
                    return { success: true, action: 'conflict' };
                  }

                  // Caso nube más reciente o allowPull
                  if (cloudTimestamp > (localTimestamp + 1000) || (allowPull && cloudTimestamp >= localTimestamp)) {
                    logDriveDebug('Versión en la nube es más reciente: descargando...');
                    return applyCloudDownload(cloudJson, cloudTimestamp, myDeviceId);
                  }
                }
              }
            } catch (dlErr) {
              logDriveDebug('Error en lectura de nube: ' + dlErr.message, true);
            }
          }

          // Si el estado local es más reciente o la nube no existe, subimos los cambios
          state.updatedAt = Date.now();
          state.deviceId = myDeviceId;
          const content = JSON.stringify(state, null, 2);

          let uploadSuccess = false;
          if (fileId) {
            const updateRes = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
              method: 'PATCH',
              headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
              },
              body: content
            });
            if (updateRes.ok) {
              uploadSuccess = true;
              logDriveDebug('Estado local sincronizado con Drive.');
            } else if (updateRes.status === 401) {
              handleDrive401();
              return { success: false, reason: 'token_expired' };
            } else if (updateRes.status === 404) {
              fileId = null;
              gdriveFileId = null;
              localStorage.removeItem('gdrive_file_id');
            }
          }

          if (!fileId) {
            const metadata = {
              name: GOOGLE_DRIVE_FILENAME,
              mimeType: 'application/json'
            };
            const form = new FormData();
            form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
            form.append('file', new Blob([content], { type: 'application/json' }));

            const createRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
              method: 'POST',
              headers: { Authorization: `Bearer ${token}` },
              body: form
            });
            if (createRes.ok) {
              const cData = await createRes.json();
              gdriveFileId = cData.id;
              localStorage.setItem('gdrive_file_id', gdriveFileId);
              uploadSuccess = true;
              logDriveDebug('Archivo inicial creado y subido.');
            } else if (createRes.status === 401) {
              handleDrive401();
              return { success: false, reason: 'token_expired' };
            }
          }

          if (uploadSuccess) {
            localStorage.setItem('gdrive_last_synced_time', String(state.updatedAt));
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
            updateGdriveUI();
            return { success: true, action: 'uploaded', timestamp: state.updatedAt };
          } else {
            updateGdriveUI('ERROR', 'bg-rose-950 text-rose-300 border border-rose-700');
            return { success: false, reason: 'upload_failed' };
          }
        } catch (err) {
          logDriveDebug('Excepción en sincronización: ' + err.message, true);
          updateGdriveUI('ERROR', 'bg-rose-950 text-rose-300 border border-rose-700');
          return { success: false, reason: err.message || 'unknown_error' };
        } finally {
          isGdriveSyncing = false;
          isDriveRequestActive = false;
        }
      }

      function scheduleGdriveAutoSync() {
        if (!gdriveUserEmail || !isGdriveConnected()) return;
        if (gdriveDebounceTimer) clearTimeout(gdriveDebounceTimer);
        gdriveDebounceTimer = setTimeout(() => {
          syncGdriveCloud(false);
        }, 3000);
      }

      function updateAutoSaveUI(isActive, isPending = false) {
        const badge = document.getElementById('autoSaveModalBadge');
        const fileCard = document.getElementById('fileAutoSaveCard');
        const hasFSA = ('showSaveFilePicker' in window) || ('showOpenFilePicker' in window);

        // En navegadores móviles sin FSA (iPad, iPhone, Android), ocultar la tarjeta de archivo local para no liar
        if (fileCard) {
          fileCard.classList.toggle('hidden', !hasFSA);
        }

        if (badge) {
          if (isActive) {
            badge.className = 'px-2 py-0.5 rounded font-mono text-[9px] font-bold bg-emerald-950 text-emerald-300 border border-emerald-700';
            badge.textContent = 'ACTIVO';
          } else if (isPending) {
            badge.className = 'px-2 py-0.5 rounded font-mono text-[9px] font-bold bg-amber-950 text-amber-300 border border-amber-700 cursor-pointer';
            badge.textContent = 'REANUDAR';
          } else {
            badge.className = 'px-2 py-0.5 rounded font-mono text-[9px] font-bold bg-slate-800 text-slate-400';
            badge.textContent = 'OFF';
          }
        }

        // Refrescar el punto indicador en la barra superior considerando Drive y Disco
        updateGdriveUI();
      }

      async function initAutoSaveDrive() {
        try {
          const isMobileDevice = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '') || (navigator.maxTouchPoints > 1 && window.innerWidth < 1024);
          const handle = await getStoredFileHandleFromDB();
          if (handle) {
            fileHandle = handle;
            let perm = 'prompt';
            try {
              if (fileHandle.queryPermission) {
                perm = await fileHandle.queryPermission({ mode: 'readwrite' });
              }
            } catch (_) {}

            // En móviles nunca ejecutar sincronización continua en disco en arranque
            if (perm === 'granted' && !isMobileDevice) {
              updateAutoSaveUI(true);
              syncDiskFile();
            } else {
              updateAutoSaveUI(false, !isMobileDevice);
            }
          } else {
            updateAutoSaveUI(false);
          }
        } catch (_) {
          updateAutoSaveUI(false);
        }
      }

      function createEmptyWeek(weekNum, templateGoals, templateSchedule) {
        return {
          weekNum,
          isClosed: false,
          closedAt: null,
          budgetLimit: state?.financeSettings ? (state.financeSettings.mode === 'auto' ? calculateAutoWeeklyBudget() : state.financeSettings.manualBudget) : 60.0,
          goals: JSON.parse(JSON.stringify(templateGoals)),
          enabledModules: Object.assign({
            gym: true,
            run: true,
            study: true,
            academic: true,
            nutri: true,
            budget: true
          }, state?.enabledModules || {}),
          studyHoursPlan: [...templateGoals.studyHoursDaily],
          studyRealHours: [0, 0, 0, 0, 0, 0, 0],
          studyBySubject: {},
          days: Array.from({ length: 7 }, (_, d) => ({
            gym: { sessions: 0, s1: { type: 'Pierna', custom: '' }, s2: { type: 'Core/Movilidad', custom: '' } },
            run: { sessions: 0, s1: { type: 'Rodaje', km: 0.0, custom: '' }, s2: { type: 'Series', km: 0.0, custom: '' }, km: 0.0 },
            attendance: (templateSchedule[d] || []).map(c => ({ subject: c.subject, type: c.type || 'T', status: 'pending' })),
            nutrition: 'pending'
          })),
          customHabitsData: {},
          expenses: [],
          surplusDistribution: { piggy: 0, carryNext: 0 }
        };
      }

      function sanitizeState(loaded) {
        const s = Object.assign({}, DEFAULT_STATE, loaded);
        s.enabledModules = Object.assign({
          gym: true,
          run: true,
          study: true,
          academic: true,
          nutri: true,
          budget: true
        }, s.enabledModules);
        if (!Array.isArray(s.deletedBaseModules)) s.deletedBaseModules = [];
        if (!Array.isArray(s.customHabits)) s.customHabits = [];
        if (!s.deviceProfiles || typeof s.deviceProfiles !== "object") s.deviceProfiles = {};
        if (s.activeDeviceProfileId === undefined) s.activeDeviceProfileId = null;
        if (!Array.isArray(s.workspaces)) s.workspaces = [];
        if (!s.activeWorkspaceId) s.activeWorkspaceId = 'ws-1';
        if (!s.globalSidebar || typeof s.globalSidebar !== 'object') s.globalSidebar = { isOpen: false, position: 'right', widgets: [] };
        if (!s.globalDock || typeof s.globalDock !== 'object') s.globalDock = { widgets: ['dockPomoPill', 'dockExpensePill'] };
        s.uiPreferences = Object.assign({
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
        }, (loaded && loaded.uiPreferences) || s.uiPreferences || {});

        // Garantizar que ningún módulo o tarjeta del catálogo quede oculto por flags legadas
        s.uiPreferences.tab2ShowGoals = true;
        s.uiPreferences.tab2ShowSchedule = true;
        s.uiPreferences.tab2ShowAttendance = true;
        s.uiPreferences.tab3ShowBudget = true;
        s.uiPreferences.tab3ShowSavingsGoals = true;
        s.uiPreferences.tab3ShowPiggy = true;
        s.uiPreferences.tab3ShowFixedExpenses = true;
        s.uiPreferences.tab3ShowExpensesTable = true;
        s.uiPreferences.tab3ShowExpenseCharts = true;
        s.uiPreferences.tab4ShowStudyAudit = true;
        s.uiPreferences.tab4ShowCustomHabits = true;
        s.uiPreferences.tab4ShowBiometrics = true;
        s.uiPreferences.tab4ShowEvolution = true;
        s.uiPreferences.habitsSplitPercent = Math.max(28, Math.min(52, Number(s.uiPreferences.habitsSplitPercent) || 38));
        if (!s.deviceId) s.deviceId = 'dev_' + Math.random().toString(36).substr(2, 9);
        if (s.ui && s.ui.dismissedBanners) delete s.ui.dismissedBanners;
        s.goalsTemplate = Object.assign({}, DEFAULT_STATE.goalsTemplate, s.goalsTemplate);
        s.financeSettings = Object.assign({}, DEFAULT_STATE.financeSettings, s.financeSettings);
        if (!Array.isArray(s.financeSettings.customCategories) || s.financeSettings.customCategories.length === 0) {
          s.financeSettings.customCategories = JSON.parse(JSON.stringify(DEFAULT_STATE.financeSettings.customCategories));
        } else {
          s.financeSettings.customCategories.forEach((c, idx) => {
            if (!c.id) c.id = 'cat_' + idx + '_' + Math.random().toString(36).substr(2, 6);
            if (!c.emoji) c.emoji = '📦';
            if (!c.name) c.name = 'Otros';
          });
        }
        s.customWorkoutMuscles = Object.assign({}, DEFAULT_STATE.customWorkoutMuscles, s.customWorkoutMuscles);
        s.manualMuscleStimulus = Object.assign({}, DEFAULT_STATE.manualMuscleStimulus, s.manualMuscleStimulus);
        s.piggyBank = Object.assign({}, DEFAULT_STATE.piggyBank, s.piggyBank);
        if (!Array.isArray(s.savingsGoals)) s.savingsGoals = [];
        s.lists = Object.assign({}, DEFAULT_STATE.lists, s.lists);
        s.pomo = Object.assign({}, DEFAULT_STATE.pomo, s.pomo);
        s.pomo.isRunning = !!s.pomo.isRunning;
        if (s.pomo.targetEndTime !== undefined) {
          s.pomo.targetEndTime = s.pomo.targetEndTime ? Number(s.pomo.targetEndTime) : null;
        }
        s.ui = Object.assign({}, DEFAULT_STATE.ui, s.ui);
        if (!s.ui.dailyViewMode) s.ui.dailyViewMode = 'today';
        if (!s.ui.habitsSubView) s.ui.habitsSubView = 'today';
        s.ui.habitsSplitPercent = Math.max(28, Math.min(52, Number(s.ui.habitsSplitPercent) || 38));
        if (s.ui.weekTableCollapsed === undefined || window.innerWidth < 768) {
          // En móviles (<768px) inicia plegada por comodidad y espacio
          s.ui.weekTableCollapsed = true;
        }

        // Migración transparente: weekTableContainer ahora está integrado dentro de todayFocusContainer
        if (Array.isArray(s.workspaces)) {
          s.workspaces.forEach(ws => {
            if (ws && ws.grid) {
              if (ws.grid['weekTableContainer']) {
                delete ws.grid['weekTableContainer'];
              }
              if (ws.grid['topKpisWrapper']) {
                if (s.uiPreferences && s.uiPreferences.kpisCollapsed) {
                  ws.grid['topKpisWrapper'].rowSpan = 2;
                  ws.grid['topKpisWrapper'].minRows = 2;
                }
              }
              if (ws.grid['todayFocusContainer']) {
                const hCfg = ws.grid['todayFocusContainer'];
                if (hCfg.colSpan === 6 && !ws.grid['weekTableContainer']) {
                  hCfg.colSpan = 12;
                  hCfg.col = 1;
                }
                if (ws.grid['topKpisWrapper'] && ws.grid['topKpisWrapper'].row === 1) {
                  const kpiRows = ws.grid['topKpisWrapper'].rowSpan || 2;
                  if (hCfg.row <= kpiRows) {
                    hCfg.row = kpiRows + 1;
                  }
                }
              }
            }
            if (ws && Array.isArray(ws.sidebarWidgets)) {
              ws.sidebarWidgets = ws.sidebarWidgets.filter(id => id !== 'weekTableContainer');
            }
            if (ws && Array.isArray(ws.dockWidgets)) {
              ws.dockWidgets = ws.dockWidgets.filter(id => id !== 'weekTableContainer');
            }
          });
        }
        if (s.deviceProfiles && typeof s.deviceProfiles === 'object') {
          Object.values(s.deviceProfiles).forEach(prof => {
            if (prof && prof.layouts) {
              Object.values(prof.layouts).forEach(layout => {
                if (layout && layout['weekTableContainer']) {
                  delete layout['weekTableContainer'];
                }
              });
            }
          });
        }
        if (!s.pomo.sound) s.pomo.sound = 'bowl';
        s.dictionary = Object.assign({}, DEFAULT_STATE.dictionary, s.dictionary);

        // Auto-reinicio mensual de recibos fijos (se desmarcan al entrar al nuevo mes)
        const currentMonth = new Date().toISOString().slice(0, 7);
        if (!s.lastFixedResetMonth) {
          s.lastFixedResetMonth = currentMonth;
        } else if (s.lastFixedResetMonth !== currentMonth) {
          (s.monthlyFixedItems || []).forEach(item => { item.paid = false; });
          s.lastFixedResetMonth = currentMonth;
        }

        // Sanitización profunda de listas y subtareas
        ['entregas', 'notas', 'compras', 'objetivos'].forEach(cat => {
          if (!Array.isArray(s.lists[cat])) s.lists[cat] = [];
          s.lists[cat].forEach(it => {
            if (it.pinned === undefined) it.pinned = false;
            if (it.note === undefined) it.note = '';
            if (it.isContainer === undefined) it.isContainer = false;
            if (!Array.isArray(it.children)) it.children = [];
            it.children.forEach(child => {
              if (child.done === undefined) child.done = false;
              if (child.note === undefined) child.note = '';
            });
          });
        });
        
        if (!s.weeks || Object.keys(s.weeks).length === 0) {
          s.weeks = { 1: createEmptyWeek(1, s.goalsTemplate, s.scheduleTemplate) };
        }
        if (!s.weeks[s.currentWeek]) {
          s.weeks[s.currentWeek] = createEmptyWeek(s.currentWeek, s.goalsTemplate, s.scheduleTemplate);
        }
        if (!s.viewingWeek) s.viewingWeek = s.currentWeek;

        if (!s.goalsTemplate.nutri) s.goalsTemplate.nutri = { phase: 'volumen', kcal: 2800, margin: 150, minDays: 6 };
        if (s.goalsTemplate.nutri.kcal === undefined) s.goalsTemplate.nutri.kcal = 2800;
        if (s.goalsTemplate.nutri.margin === undefined) s.goalsTemplate.nutri.margin = 150;

        // Sanitización profunda de cada día en cada semana para evitar fallos de renderizado
        Object.values(s.weeks).forEach(wk => {
          if (!wk.enabledModules || typeof wk.enabledModules !== 'object') {
            wk.enabledModules = Object.assign({
              gym: true,
              run: true,
              study: true,
              academic: true,
              nutri: true,
              budget: true
            }, s.enabledModules || {});
          } else {
            wk.enabledModules = Object.assign({
              gym: true,
              run: true,
              study: true,
              academic: true,
              nutri: true,
              budget: true
            }, wk.enabledModules);
          }
          if (wk.goals && wk.goals.nutri) {
            if (wk.goals.nutri.kcal === undefined) wk.goals.nutri.kcal = s.goalsTemplate.nutri.kcal;
            if (wk.goals.nutri.margin === undefined) wk.goals.nutri.margin = s.goalsTemplate.nutri.margin;
          }
          if (!wk.days || wk.days.length !== 7) {
            wk.days = Array.from({ length: 7 }, () => ({
              gym: { sessions: 0, s1: { type: 'Pierna', custom: '' }, s2: { type: 'Core/Movilidad', custom: '' } },
              run: { sessions: 0, s1: { type: 'Rodaje', km: 0.0, custom: '' }, s2: { type: 'Series', km: 0.0, custom: '' }, km: 0.0 },
              attendance: [],
              nutrition: 'pending',
              nutritionKcal: null
            }));
          }
          wk.days.forEach(day => {
            day.gym = day.gym || { sessions: 0 };
            day.gym.sessions = Number(day.gym.sessions) || 0;
            day.gym.s1 = (typeof day.gym.s1 === 'object' && day.gym.s1) ? day.gym.s1 : { type: (typeof day.gym.s1 === 'string' ? day.gym.s1 : 'Pierna'), custom: '' };
            day.gym.s2 = (typeof day.gym.s2 === 'object' && day.gym.s2) ? day.gym.s2 : { type: (typeof day.gym.s2 === 'string' ? day.gym.s2 : 'Core/Movilidad'), custom: '' };
            
            day.run = day.run || { sessions: 0, km: 0.0 };
            day.run.sessions = Number(day.run.sessions) || 0;
            day.run.km = Number(day.run.km) || 0.0;
            day.run.s1 = (typeof day.run.s1 === 'object' && day.run.s1) ? day.run.s1 : { type: (typeof day.run.s1 === 'string' ? day.run.s1 : 'Rodaje'), km: 0.0, custom: '' };
            day.run.s2 = (typeof day.run.s2 === 'object' && day.run.s2) ? day.run.s2 : { type: (typeof day.run.s2 === 'string' ? day.run.s2 : 'Series'), km: 0.0, custom: '' };
            if ((Number(day.run.s1.km) || 0) === 0 && day.run.km > 0 && day.run.sessions === 1) {
              day.run.s1.km = day.run.km;
            }
            day.run.s1.km = Number(day.run.s1.km) || 0.0;
            day.run.s2.km = Number(day.run.s2.km) || 0.0;
            if (day.run.sessions >= 2) {
              day.run.km = parseFloat(((day.run.s1.km || 0) + (day.run.s2.km || 0)).toFixed(2));
            } else if (day.run.sessions === 1) {
              day.run.km = day.run.s1.km;
            } else {
              day.run.km = 0.0;
            }

            if (!Array.isArray(day.attendance)) day.attendance = [];
            day.attendance.forEach(c => { if (!c.type) c.type = 'T'; });

            if (day.nutritionKcal === undefined) day.nutritionKcal = null;
          });

          // Sanitización y consistencia de horas de estudio:
          // Las horas acumuladas por asignatura nunca deben superar el total semanal de horas de estudio
          if (!Array.isArray(wk.studyRealHours) || wk.studyRealHours.length !== 7) {
            wk.studyRealHours = [0, 0, 0, 0, 0, 0, 0];
          }
          if (!wk.studyBySubject || typeof wk.studyBySubject !== 'object') {
            wk.studyBySubject = {};
          }
          const totalRealHrs = wk.studyRealHours.reduce((acc, h) => acc + (Number(h) || 0), 0);
          const totalSubHrs = Object.values(wk.studyBySubject).reduce((acc, h) => acc + (Number(h) || 0), 0);
          if (totalSubHrs > totalRealHrs + 0.01) {
            // Reconciliar sumando el exceso a los días de estudio (o al día actual) para que el total siempre sea >= suma de asignaturas
            const diff = parseFloat((totalSubHrs - totalRealHrs).toFixed(1));
            const todayIdx = (new Date().getDay() + 6) % 7;
            const curVal = Number(wk.studyRealHours[todayIdx]) || 0;
            wk.studyRealHours[todayIdx] = parseFloat((curVal + diff).toFixed(1));
          }
        });

        // Migración de tab4BiometricsSection -> tab4AnatomyCard + tab4RunningRadarCard
        if (Array.isArray(s.workspaces)) {
          s.workspaces.forEach(ws => {
            if (ws && ws.grid && ws.grid['tab4BiometricsSection']) {
              const oldCfg = ws.grid['tab4BiometricsSection'];
              delete ws.grid['tab4BiometricsSection'];
              if (!ws.grid['tab4AnatomyCard']) {
                ws.grid['tab4AnatomyCard'] = {
                  col: oldCfg.col || 1,
                  colSpan: Math.min(oldCfg.colSpan || 7, 7),
                  row: oldCfg.row || 17,
                  minRows: oldCfg.minRows || 8,
                  manualRows: oldCfg.manualRows || null,
                  rowSpan: oldCfg.rowSpan || 8,
                  name: 'Mapa Muscular Anatómico'
                };
              }
              if (!ws.grid['tab4RunningRadarCard']) {
                ws.grid['tab4RunningRadarCard'] = {
                  col: (oldCfg.col || 1) + 7 <= 12 ? (oldCfg.col || 1) + 7 : 8,
                  colSpan: 5,
                  row: oldCfg.row || 17,
                  minRows: oldCfg.minRows || 8,
                  manualRows: oldCfg.manualRows || null,
                  rowSpan: oldCfg.rowSpan || 8,
                  name: 'Tri-Sistema Running y Pista'
                };
              }
            }
            if (ws && Array.isArray(ws.sidebarWidgets)) {
              const idx = ws.sidebarWidgets.indexOf('tab4BiometricsSection');
              if (idx !== -1) {
                ws.sidebarWidgets.splice(idx, 1, 'tab4AnatomyCard', 'tab4RunningRadarCard');
              }
            }
            if (ws && Array.isArray(ws.dockWidgets)) {
              const idx = ws.dockWidgets.indexOf('tab4BiometricsSection');
              if (idx !== -1) {
                ws.dockWidgets.splice(idx, 1, 'tab4AnatomyCard', 'tab4RunningRadarCard');
              }
            }
          });
        }
        if (s.deviceProfiles && typeof s.deviceProfiles === 'object') {
          Object.values(s.deviceProfiles).forEach(dp => {
            if (dp && dp.desktop && dp.desktop.tab4) {
              if (dp.desktop.tab4['tab4BiometricsSection']) {
                const oldCfg = dp.desktop.tab4['tab4BiometricsSection'];
                delete dp.desktop.tab4['tab4BiometricsSection'];
                dp.desktop.tab4['tab4AnatomyCard'] = { col: 1, colSpan: 7, row: oldCfg.row || 17, minRows: 8, rowSpan: 8, name: 'Mapa Muscular Anatómico' };
                dp.desktop.tab4['tab4RunningRadarCard'] = { col: 8, colSpan: 5, row: oldCfg.row || 17, minRows: 8, rowSpan: 8, name: 'Tri-Sistema Running y Pista' };
              }
            }
            if (dp && dp.mobile && Array.isArray(dp.mobile.tab4)) {
              const idx = dp.mobile.tab4.indexOf('tab4BiometricsSection');
              if (idx !== -1) {
                dp.mobile.tab4.splice(idx, 1, 'tab4AnatomyCard', 'tab4RunningRadarCard');
              }
            }
          });
        }
        if (s.globalSidebar && Array.isArray(s.globalSidebar.widgets)) {
          const idx = s.globalSidebar.widgets.indexOf('tab4BiometricsSection');
          if (idx !== -1) s.globalSidebar.widgets.splice(idx, 1, 'tab4AnatomyCard', 'tab4RunningRadarCard');
        }
        if (s.globalDock && Array.isArray(s.globalDock.widgets)) {
          const idx = s.globalDock.widgets.indexOf('tab4BiometricsSection');
          if (idx !== -1) s.globalDock.widgets.splice(idx, 1, 'tab4AnatomyCard', 'tab4RunningRadarCard');
        }

        return s;
      }

      function loadState() {
        try {
          const raw = localStorage.getItem(STORAGE_KEY);
          state = sanitizeState(raw ? JSON.parse(raw) : {});
        } catch (e) {
          state = sanitizeState({});
        }
        checkAndResumePomo();
      }

      function saveUiOnly() {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        } catch (_) {}
      }
      window.saveUiOnly = saveUiOnly;
      window.applyCloudDownload = applyCloudDownload;
      window.syncGdriveCloud = syncGdriveCloud;
      window.ensureGdriveToken = ensureGdriveToken;
      window.getLocalDeviceId = getLocalDeviceId;
      window.getPendingCloudConflictJson = () => pendingCloudConflictJson;
      window.clearPendingCloudConflictJson = () => { pendingCloudConflictJson = null; };
      window.resetGdriveSyncLock = () => {
        isGdriveSyncing = false;
        isDriveRequestActive = false;
      };

      function saveState(skipDiskSync = false) {
        try {
          state.updatedAt = Date.now();
          localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
          try {
            localStorage.setItem('CC_LOCAL_DEVICE_LAYOUT', JSON.stringify({
              workspaces: state.workspaces,
              gridLayouts: state.uiPreferences?.gridLayouts,
              globalSidebar: state.globalSidebar
            }));
          } catch (_) {}
          if (!skipDiskSync) {
            syncDiskFile();
          }
          scheduleGdriveAutoSync();
        } catch (_) {}
      }

      async function syncDiskFile() {
        if (!fileHandle) return;
        try {
          // Verificar permiso primero si el navegador lo soporta; si no está concedido ('prompt' o 'denied'), no intentar createWritable()
          if (fileHandle.queryPermission) {
            const currentPerm = await fileHandle.queryPermission({ mode: 'readwrite' });
            if (currentPerm !== 'granted') {
              updateAutoSaveUI(false, true);
              return;
            }
          }
          const writable = await fileHandle.createWritable();
          await writable.write(JSON.stringify(state, null, 2));
          await writable.close();
          updateAutoSaveUI(true);
        } catch (err) {
          if (err && (err.name === 'NotAllowedError' || err.name === 'SecurityError')) {
            updateAutoSaveUI(false, true);
          }
        }
      }

      // Escucha inteligente de pestaña activa para pull silencioso entre dispositivos (debounce 30s)
      let lastFocusPullTime = 0;
      function handleAppFocusPull() {
        const now = Date.now();
        if (now - lastFocusPullTime < 30000) return;
        lastFocusPullTime = now;
        if (typeof isGdriveConnected === 'function' && isGdriveConnected()) {
          syncGdriveCloud(true, false, false);
        } else if (gdriveUserEmail) {
          updateGdriveUI();
        }
      }
      window.addEventListener('focus', handleAppFocusPull);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          handleAppFocusPull();
        }
      });

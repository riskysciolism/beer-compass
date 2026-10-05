<script setup lang="ts">
/**
 * Stylized compass with a **beer bottle as needle**.
 *
 * - The **bottle needle** (tip = bottle neck) points at the bearing of the selected
 * target. It is always relative to geographic north.
 * - The **ring with N/E/S/W** is a compass rose that rotates so that "N" points to
 * geographic north, i.e. against the device heading. Without an orientation sensor
 * (`heading === null`) the ring is hidden completely, because it would be misleading
 * then. That difference between the needle and ring angle is exactly how much
 * one still has to turn.
 *
 * Plain SVG, no map library, no network request - works offline.
 */
import { computed } from 'vue'

import { translate } from '@/i18n'

const props = defineProps<{
  /** Bearing to the target in degrees (0 = north). `null` = no target selected. */
  bearing: number | null
  /** Device heading in degrees, `null` when no orientation sensor is available. */
  heading: number | null
  /** Target name for the aria label. */
  targetName: string | null
  /** GPS accuracy in meters for the subtle uncertainty circle. */
  accuracy: number | null
  /** Compact rendering (50%) when the list is scrolled. */
  compact: boolean
}>()

const hasHeading = computed(() => props.heading !== null && Number.isFinite(props.heading))

/** The ring has to rotate against the device heading. */
const ringRotation = computed(() => (props.heading === null ? null : -props.heading))
const needleRotation = computed(() => props.bearing ?? 0)

/** The uncertainty circle: radius 6...46 units for 200 m ... 4 km. */
const accuracyRadius = computed(() => {
  const accuracy = props.accuracy
  if (accuracy === null || !Number.isFinite(accuracy) || accuracy <= 0) return null
  const radius = 6 + Math.min(1, accuracy / 4000) * 40
  return Math.round(radius * 10) / 10
})

const label = computed(() =>
  props.targetName ? translate('compass.needleTo').replace('{name}', props.targetName) : '',
)
</script>

<template>
  <div class="compass" :class="{ 'compass--compact': compact }">
    <svg
      class="compass__svg"
      viewBox="-110 -110 220 220"
      role="img"
      :aria-label="targetName ? label : translate('compass.title')"
    >
      <defs>
        <radialGradient id="bc-face" cx="50%" cy="42%" r="58%">
          <stop offset="0%" class="compass__face-start" />
          <stop offset="100%" class="compass__face-end" />
        </radialGradient>
        <linearGradient id="bc-glass" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#ffc768" />
          <stop offset="52%" stop-color="#b26a00" />
          <stop offset="100%" stop-color="#7a4400" />
        </linearGradient>
        <linearGradient id="bc-foam" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#fff8ec" />
          <stop offset="100%" stop-color="#e8d9bd" />
        </linearGradient>
        <filter id="bc-needle-shadow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="2" stdDeviation="2.4" flood-opacity="0.35" />
        </filter>
      </defs>

      <!-- Zifferblatt -->
      <circle cx="0" cy="0" r="104" fill="url(#bc-face)" />
      <circle cx="0" cy="0" r="104" class="compass__bezel" />
      <circle cx="0" cy="0" r="76" class="compass__ring" />

      <!-- Needle: beer bottle, tip (neck) points up = north -->
      <g
        class="compass__needle"
        :style="{ transform: `rotate(${needleRotation}deg)` }"
        filter="url(#bc-needle-shadow)"
      >
        <!-- Anchors the rotation exactly in the center (BBox center = 0,0). -->
        <rect x="-110" y="-110" width="220" height="220" fill="transparent" pointer-events="none" />

        <g v-if="bearing !== null" class="compass__bottle">
          <!-- Hals (Spitze) -->
          <path
            d="M -4.6 -80 L -4.6 -54 L -4 -49 L -17 -36 L -17 52 Q -17 62 -8 66 L 8 66 Q 17 62 17 52
               L 17 -36 L 4 -49 L 4.6 -54 L 4.6 -80 Z"
            fill="url(#bc-glass)"
            stroke="rgb(35 22 8 / 55%)"
            stroke-width="1.4"
            stroke-linejoin="round"
          />
          <!-- Kapsel -->
          <rect x="-6.4" y="-88" width="12.8" height="10" rx="3" class="compass__cap" />
          <!-- Etikett -->
          <rect x="-17" y="-18" width="34" height="34" rx="5" class="compass__label" />
          <path d="M -10 -8 H 10 M -10 -1 H 10 M -10 6 H 4" class="compass__label-lines" />
          <!-- Glanzstreifen im Glas -->
          <path d="M -12 -30 Q -14 6 -12 44" class="compass__shine" />
        </g>

        <!-- Drehpunkt -->
        <circle cx="0" cy="0" r="7.5" class="compass__pivot-outer" />
        <circle cx="0" cy="0" r="3" class="compass__pivot" />
      </g>

      <!-- Compass rose with N/E/S/W - only meaningful with an orientation sensor -->
      <g
        v-if="hasHeading"
        class="compass__cardinal"
        :style="{ transform: `rotate(${ringRotation ?? 0}deg)` }"
      >
        <rect x="-110" y="-110" width="220" height="220" fill="transparent" pointer-events="none" />

        <g class="compass__ticks">
          <line x1="0" y1="-76" x2="0" y2="-66" />
          <line x1="0" y1="76" x2="0" y2="66" />
          <line x1="76" y1="0" x2="66" y2="0" />
          <line x1="-76" y1="0" x2="-66" y2="0" />
          <line x1="54" y1="-54" x2="47" y2="-47" />
          <line x1="-54" y1="54" x2="-47" y2="47" />
          <line x1="54" y1="54" x2="47" y2="47" />
          <line x1="-54" y1="-54" x2="-47" y2="-47" />
        </g>

        <text x="0" y="-84" class="compass__letter compass__letter--n">N</text>
        <text x="90" y="6" class="compass__letter">O</text>
        <text x="0" y="96" class="compass__letter">S</text>
        <text x="-90" y="6" class="compass__letter">W</text>
      </g>

      <!-- Uncertainty of the GPS measurement -->
      <circle
        v-if="accuracyRadius !== null"
        cx="0"
        cy="0"
        :r="accuracyRadius"
        class="compass__accuracy"
      />
    </svg>
  </div>
</template>

<style scoped>
/*
 * The scaling to 50% uses `width`, not `transform`:
 * only then does the space in the layout shrink too and the list below gets
 * wirklich mehr Raum.
 */
.compass {
  display: flex;
  justify-content: center;
  width: 100%;
}

.compass__svg {
  width: min(78vw, 300px);
  max-width: 300px;
  height: auto;
  overflow: visible;
  transition: width 260ms cubic-bezier(0.2, 0, 0.2, 1);
}

.compass--compact .compass__svg {
  width: min(39vw, 150px);
}

.compass__face-start {
  stop-color: var(--accent);
  stop-opacity: 0.26;
}

.compass__face-end {
  stop-color: var(--accent);
  stop-opacity: 0.04;
}

.compass__bezel {
  fill: none;
  stroke: var(--surface-border);
  stroke-width: 3;
}

.compass__ring {
  fill: none;
  stroke: var(--surface-border);
  stroke-width: 1;
  stroke-dasharray: 2 7;
  opacity: 0.8;
}

.compass__needle,
.compass__cardinal {
  transform-box: fill-box;
  transform-origin: center;
  transition: transform 320ms cubic-bezier(0.22, 0.61, 0.36, 1);
}

.compass__cap {
  fill: url(#bc-foam);
  stroke: rgb(35 22 8 / 45%);
  stroke-width: 1.2;
}

.compass__label {
  fill: var(--bg-elevated);
  stroke: rgb(35 22 8 / 35%);
  stroke-width: 1;
}

.compass__label-lines {
  fill: none;
  stroke: var(--accent-strong);
  stroke-width: 2;
  stroke-linecap: round;
  opacity: 0.65;
}

.compass__shine {
  fill: none;
  stroke: rgb(255 248 236 / 45%);
  stroke-width: 3;
  stroke-linecap: round;
}

.compass__pivot-outer {
  fill: var(--bg-elevated);
  stroke: var(--accent-strong);
  stroke-width: 2.5;
}

.compass__pivot {
  fill: var(--accent-strong);
}

.compass__ticks line {
  stroke: var(--text-faint);
  stroke-width: 2;
  stroke-linecap: round;
}

.compass__letter {
  fill: var(--text-muted);
  font-family: var(--font-sans);
  font-size: 15px;
  font-weight: 700;
  text-anchor: middle;
  dominant-baseline: middle;
}

.compass__letter--n {
  fill: var(--accent-strong);
}

.compass__accuracy {
  fill: none;
  stroke: color-mix(in srgb, var(--accent) 40%, transparent);
  stroke-width: 1;
  stroke-dasharray: 4 5;
}
</style>

import type { PriceOverlapView } from '@lfd/contracts';

/**
 * **La mise à l'échelle d'une frise de dates.**
 *
 * Des fonctions pures, à part du composant : placer une barre sur un axe est de
 * l'arithmétique, et l'arithmétique se teste sans monter de vue.
 *
 * Rien ici ne calcule d'effet de prix — le cumul vient du serveur, avec
 * l'arithmétique qui facture. Ce module ne décide que de la géométrie.
 */

/** Une barre placée sur l'axe, en pourcentage de sa largeur. */
export interface TimelineBar {
  readonly leftPercent: number;
  readonly widthPercent: number;
}

/** Les bornes de la frise : la plus précoce, la plus tardive. */
export interface TimelineWindow {
  readonly from: number;
  readonly to: number;
}

/**
 * **Une fin ouverte a besoin d'un horizon**, sinon elle n'a pas de largeur.
 *
 * Quinze jours après la dernière borne connue : assez pour qu'une barre ouverte
 * se voie continuer, trop peu pour écraser les autres à un pixel.
 */
const OPEN_END_DAYS = 15;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * La fenêtre que la frise couvre.
 *
 * `null` quand il n'y a rien à placer, ou quand toutes les règles tiennent sur
 * le même instant : une frise sans durée n'a pas d'échelle, et diviser par zéro
 * donnerait des barres de largeur infinie.
 */
export function timelineWindow(
  bands: readonly { readonly validFrom: string; readonly validTo: string | null }[],
): TimelineWindow | null {
  if (bands.length === 0) {
    return null;
  }
  const starts = bands.map((band) => Date.parse(band.validFrom));
  const ends = bands.map((band) => (band.validTo === null ? Number.NaN : Date.parse(band.validTo)));
  const from = Math.min(...starts);
  const closed = ends.filter((end) => !Number.isNaN(end));
  const hasOpenEnd = closed.length < ends.length;
  const lastKnown = Math.max(from, ...(closed.length > 0 ? closed : [from]));
  const to = hasOpenEnd ? lastKnown + OPEN_END_DAYS * DAY_MS : lastKnown;
  return to > from ? { from, to } : null;
}

/** Où poser une barre, en pourcentage — bornée pour ne jamais déborder de l'axe. */
export function barOf(window: TimelineWindow, from: string, to: string | null): TimelineBar {
  const span = window.to - window.from;
  const start = clamp(Date.parse(from), window);
  const end = to === null ? window.to : clamp(Date.parse(to), window);
  return {
    leftPercent: ((start - window.from) / span) * 100,
    // Une barre d'un seul jour doit rester visible : 1,5 % de plancher.
    widthPercent: Math.max(((end - start) / span) * 100, 1.5),
  };
}

function clamp(time: number, window: TimelineWindow): number {
  return Math.min(Math.max(time, window.from), window.to);
}

/**
 * Le cumul en clair — « −28 % », ou « de −10 % à −28 % » quand un **barème**
 * compose : l'effet dépend alors du palier atteint, et un chiffre unique serait
 * faux pour toutes les quantités sauf une.
 *
 * `null` quand le cumul ne s'exprime pas en fraction.
 */
export function composedLabel(overlap: PriceOverlapView): string | null {
  const low = percentLabel(overlap.composedBp);
  const high = percentLabel(overlap.composedTopBp);
  if (low === null) {
    return null;
  }
  return high === null || high === low ? low : `de ${low} à ${high}`;
}

function percentLabel(bp: number | null): string | null {
  if (bp === null) {
    return null;
  }
  const percent = Math.abs(bp / 100)
    .toFixed(1)
    .replace('.', ',');
  return `${bp < 0 ? '+' : '−'}${percent} %`;
}

/** La période d'un recouvrement, en clair. Une fin ouverte se dit, elle ne s'invente pas. */
export function periodLabel(overlap: PriceOverlapView): string {
  const from = day(overlap.from);
  return overlap.to === null ? `à partir du ${from}` : `du ${from} au ${day(overlap.to)}`;
}

function day(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

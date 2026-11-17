import type { WorkshopBatch, WorkshopLine } from '@lfd/contracts';

import { minutesOf } from '../../production/fiche-atelier/workshop-deadlines';

/**
 * **La fausse journée de l'aperçu des niveaux de suivi**
 * (`documentation/fournil/reflexion-fiche-simple.md`). Rien ne vient du
 * serveur et rien n'y part : c'est une démonstration pour un décisionnaire.
 *
 * Fonctions pures ; « maintenant » est un nombre de minutes depuis minuit,
 * donné par l'horloge de démonstration.
 */

export type TrackingLevel = 'always-green' | 'simple' | 'detailed';

export const TRACKING_LEVELS: readonly { readonly value: TrackingLevel; readonly label: string }[] =
  [
    { value: 'always-green', label: 'Toujours vert' },
    { value: 'simple', label: 'Simple' },
    { value: 'detailed', label: 'Détaillé' },
  ];

export function isTrackingLevel(value: string): value is TrackingLevel {
  return TRACKING_LEVELS.some((level) => level.value === value);
}

export interface DemoStep {
  readonly quantity: number;
  /** `HH:mm`. */
  readonly before: string;
}

export interface DemoProduct {
  readonly sku: string;
  readonly name: string;
  readonly station: string;
  readonly steps: readonly DemoStep[];
  readonly container: { readonly singular: string; readonly unitsPerContainer: number };
  /**
   * L'heure à partir de laquelle le colisage a déjà mis des pièces au bac.
   * Une correction après cette heure ne défait rien : le manque passe par le
   * colisage (décision 3).
   */
  readonly packedFrom: string | null;
}

/** L'heure de départ de l'horloge : 5 h. */
export const DEMO_START = 5 * 60;
export const DEFAULT_MARGIN = 15;

export const DEMO_STATIONS: readonly string[] = ['Viennoiserie', 'Pâtisserie'];

const PLATE = { singular: 'plaque', unitsPerContainer: 20 };
const TRAY = { singular: 'plateau', unitsPerContainer: 12 };

export const DEMO_PRODUCTS: readonly DemoProduct[] = [
  {
    sku: 'CRO',
    name: 'Croissant',
    station: 'Viennoiserie',
    steps: [
      { quantity: 120, before: '07:00' },
      { quantity: 120, before: '09:30' },
    ],
    container: PLATE,
    packedFrom: '07:45',
  },
  {
    sku: 'PAC',
    name: 'Pain au chocolat',
    station: 'Viennoiserie',
    steps: [
      { quantity: 100, before: '07:00' },
      { quantity: 80, before: '09:30' },
    ],
    container: PLATE,
    packedFrom: '07:45',
  },
  {
    sku: 'PRA',
    name: 'Pain aux raisins',
    station: 'Viennoiserie',
    steps: [{ quantity: 60, before: '07:30' }],
    container: PLATE,
    packedFrom: null,
  },
  {
    sku: 'CHA',
    name: 'Chausson aux pommes',
    station: 'Viennoiserie',
    steps: [{ quantity: 40, before: '08:00' }],
    container: PLATE,
    packedFrom: null,
  },
  {
    sku: 'FLA',
    name: 'Flan pâtissier (part)',
    station: 'Pâtisserie',
    steps: [
      { quantity: 24, before: '08:00' },
      { quantity: 24, before: '11:00' },
    ],
    container: TRAY,
    packedFrom: '09:00',
  },
  {
    sku: 'ECL',
    name: 'Éclair au café',
    station: 'Pâtisserie',
    steps: [{ quantity: 36, before: '10:00' }],
    container: TRAY,
    packedFrom: null,
  },
  {
    sku: 'TAR',
    name: 'Tartelette citron',
    station: 'Pâtisserie',
    steps: [{ quantity: 30, before: '10:30' }],
    container: TRAY,
    packedFrom: null,
  },
];

export function totalOf(product: DemoProduct): number {
  return product.steps.reduce((sum, step) => sum + step.quantity, 0);
}

/** « 7 h 15 » pour 435 minutes. */
export function timeLabel(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${String(hours)} h ${String(rest).padStart(2, '0')}`;
}

/** `HH:mm` pour des minutes depuis minuit. */
export function hhmm(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/** Un palier est réputé sorti à son heure plus la marge (décision 1). */
export function stepReleasedAt(step: DemoStep, margin: number): number {
  return minutesOf(step.before) + margin;
}

/** Ce que « toujours vert » considère sorti à cette heure, sans correction. */
export function autoReleased(product: DemoProduct, now: number, margin: number): number {
  return product.steps
    .filter((step) => now >= stepReleasedAt(step, margin))
    .reduce((sum, step) => sum + step.quantity, 0);
}

/** Des pièces de ce produit sont-elles déjà au bac ? */
export function isPacked(product: DemoProduct, now: number): boolean {
  return product.packedFrom !== null && now >= minutesOf(product.packedFrom);
}

/**
 * La ligne de la fiche détaillée, fabriquée depuis les fausses fournées —
 * pour passer les VRAIS composants de la fiche d'atelier.
 */
export function workshopLineOf(
  product: DemoProduct,
  batches: readonly WorkshopBatch[],
): WorkshopLine {
  const quantity = totalOf(product);
  const produced = batches.reduce((sum, batch) => sum + batch.quantity, 0);
  const done = produced >= quantity;
  return {
    sku: product.sku,
    productName: product.name,
    quantity,
    saleUnit: 'piece',
    containerLabel: null,
    done,
    initials: null,
    doneAt: done ? (batches.at(-1)?.recordedAt ?? null) : null,
    produced,
    remaining: Math.max(0, quantity - produced),
    surplus: Math.max(0, produced - quantity),
    batches,
    container: product.container,
    deadlines: product.steps.map((step) => ({ quantity: step.quantity, before: step.before })),
    quality: null,
    waitingOrders: null,
  };
}

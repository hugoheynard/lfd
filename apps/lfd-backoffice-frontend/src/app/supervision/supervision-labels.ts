import { instantToLocal } from '@lfd/contracts';
import type {
  FulfillmentMethod,
  LateOrder,
  SupervisionStage,
  SupervisionWindow,
} from '@lfd/contracts';

/**
 * **Les mots de la Supervision.** Fonctions pures : l'écran les affiche, les
 * specs les lisent sans monter de composant.
 *
 * Vocabulaire du dépôt (§8) : le geste final est « retirée » ou « livrée »,
 * jamais « remise » — « remise » ne désigne que la réduction de prix.
 */

/** Les étapes affichées d'un flux, dans l'ordre du chemin. Les annulées sont à part. */
export const FLOW_STAGES = ['placed', 'in_production', 'ready', 'handed_over'] as const;
export type FlowStage = (typeof FLOW_STAGES)[number];

/** « Retrait » / « Livraison ». */
export function methodLabel(method: FulfillmentMethod): string {
  return method === 'pickup' ? 'Retrait' : 'Livraison';
}

/** Le libellé d'une étape — la dernière dépend de l'acheminement. */
export function stageLabel(stage: SupervisionStage, method: FulfillmentMethod): string {
  switch (stage) {
    case 'placed':
      return 'Commandée';
    case 'in_production':
      return 'En production';
    case 'ready':
      return 'Prête';
    case 'handed_over':
      return method === 'pickup' ? 'Retirée' : 'Livrée';
    case 'cancelled':
      return 'Annulée';
  }
}

/** `07:00` → « 7 h », `07:30` → « 7 h 30 ». Une chaîne mal formée est rendue telle quelle. */
export function hourLabel(time: string): string {
  const match = /^(\d{1,2}):(\d{2})/u.exec(time);
  if (match === null) {
    return time;
  }
  const hours = String(Number(match[1]));
  const minutes = match[2] ?? '00';
  return minutes === '00' ? `${hours} h` : `${hours} h ${minutes}`;
}

/**
 * Le créneau en clair. Une heure recopiée du point de retrait n'est pas une
 * promesse faite au client : elle se dit « heure d'ouverture ».
 */
export function windowLabel(window: SupervisionWindow | null): string {
  if (window === null) {
    return 'sans créneau';
  }
  if (window.source === 'default') {
    return "heure d'ouverture";
  }
  return window.start === null
    ? `jusqu'à ${hourLabel(window.end)}`
    : `${hourLabel(window.start)}–${hourLabel(window.end)}`;
}

/**
 * La règle qui signale le retard, écrite pour être lue d'un coup d'œil :
 * « Créneau 7 h–8 h dépassé, pas retirée », « Pas prête, créneau à 7 h ».
 */
export function ruleLabel(order: LateOrder): string {
  const { window } = order;
  if (order.rule === 'not_ready_before_window') {
    return `Pas prête, créneau à ${hourLabel(window.start ?? window.end)}`;
  }
  const missing = order.fulfillmentMethod === 'pickup' ? 'pas retirée' : 'pas livrée';
  const slot =
    window.start === null
      ? `jusqu'à ${hourLabel(window.end)}`
      : `${hourLabel(window.start)}–${hourLabel(window.end)}`;
  return `Créneau ${slot} dépassé, ${missing}`;
}

/** « à jour à 9 h 42 », à l'heure de Paris — `asOf` est l'horloge du serveur. */
export function asOfLabel(asOf: string): string {
  const instant = new Date(asOf);
  if (Number.isNaN(instant.getTime())) {
    return '';
  }
  return `à jour à ${hourLabel(instantToLocal(instant).time)}`;
}

/** « 3 commandes ouvertes sans date de service ». */
export function undatedLabel(count: number): string {
  return count === 1
    ? '1 commande ouverte sans date de service'
    : `${String(count)} commandes ouvertes sans date de service`;
}

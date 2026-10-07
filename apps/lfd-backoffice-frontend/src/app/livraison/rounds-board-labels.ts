import type { DeliveryRunSheetStopView } from '@lfd/contracts';

import { stopNameOf } from './delivery-planning';
import { broughtBackLabel, windowShortLabel } from './delivery-rounds';
import type { OrderCardEdge, OrderCardTag } from './order-card/order-card';
import type { BoardOrder, BoardRound, BoardStop } from './rounds-board-model';

/**
 * Ce que les cartes du tableau DISENT : titre, méta, étiquettes, liseré,
 * libellés d'avertissement et lecture d'écran. Sorti de
 * `rounds-board-model.ts` : la forme du tableau n'a pas à changer quand un
 * libellé change.
 */

/** « CMD-2041 · Val-d’Isère » — la référence seule quand la feuille ne connaît pas la ville. */
export function cardMetaOf(reference: string, sheet: DeliveryRunSheetStopView | null): string {
  const city = sheet?.address?.ville.trim() ?? '';
  return city === '' ? reference : `${reference} · ${city}`;
}

/** Sans point GPS dans le carnet, l'arrêt n'est pas sur la carte et le calcul ne le place pas. */
function unlocated(sheet: DeliveryRunSheetStopView | null): boolean {
  return sheet !== null && (sheet.addressBook?.gps ?? null) === null;
}

/** Les étiquettes d'une commande à répartir. */
export function orderTagsOf(order: BoardOrder): readonly OrderCardTag[] {
  const tags: OrderCardTag[] = [];
  if (order.broughtBackAt !== null) {
    tags.push({ label: broughtBackLabel(order.broughtBackAt), variant: 'warning' });
  }
  if (order.sheet?.state === 'expected') {
    tags.push({ label: 'Pas encore prête', variant: 'warning' });
  }
  if (order.reason === 'unlocated' || (order.reason === null && unlocated(order.sheet))) {
    tags.push({ label: 'Non située · pas de GPS', variant: 'neutral' });
  }
  if (order.reason === 'overflow') {
    tags.push({ label: 'Ne tient dans aucune tournée (durée max.)', variant: 'warning' });
  }
  if (order.reason === 'capacity') {
    tags.push({ label: 'Ne tient dans aucun véhicule (place)', variant: 'warning' });
  }
  if (order.reason === 'zone') {
    tags.push({ label: ZONE_REFUSED_LABEL, variant: 'warning' });
  }
  return tags;
}

/** « Place non vérifiée — 2 commandes sans bacs connus », ou `null` si la place l'est. */
export function unverifiedPlaceLabel(round: Pick<BoardRound, 'unknownDemand'>): string | null {
  const count = round.unknownDemand;
  if (count === 0) {
    return null;
  }
  const orders = count === 1 ? '1 commande' : `${String(count)} commandes`;
  return `Place non vérifiée — ${orders} sans bacs connus`;
}

/**
 * L'avertissement de place d'une tournée enregistrée (2026-10-07), ou `null`.
 * Une affectation à la main passe toujours ; l'écran dit seulement ce qui ne
 * tiendra pas dans la caisse.
 */
export function placeWarningLabel(round: Pick<BoardRound, 'place'>): string | null {
  if (round.place === 'over') {
    return 'Place dépassée';
  }
  if (round.place === 'unmeasured') {
    return 'Véhicule sans cotes';
  }
  return null;
}

/** La commande attend un point GPS : le lien vers le carnet se montre. */
export function needsGps(order: BoardOrder): boolean {
  return order.reason === 'unlocated' || (order.reason === null && unlocated(order.sheet));
}

/** L'alerte rouge, en toutes lettres, avec le geste qui la lève (CA5). */
export const PLACEMENT_LATE_LABEL = 'Échéance intenable à cette place — la déplacer';

/** Aucun véhicule autorisé sur la zone de la commande ne peut la prendre (2026-10-06). */
export const ZONE_REFUSED_LABEL = 'Aucun véhicule autorisé sur cette zone';

/** L'arrêt est posé dans un véhicule qui n'est pas autorisé sur sa zone, et le geste qui le lève. */
export const OUT_OF_ZONE_LABEL = 'Hors des zones du véhicule — le déplacer';

/** Les étiquettes d'un arrêt : signaux, fenêtre intenable, hors zone, rapportée, pas prête. */
export function stopTagsOf(stop: BoardStop): readonly OrderCardTag[] {
  const tags: OrderCardTag[] = stop.signals.map((label) => ({ label, variant: 'alert' }));
  if (stop.placementLate) {
    tags.push({ label: PLACEMENT_LATE_LABEL, variant: 'alert' });
  }
  if (stop.windowClash !== null) {
    tags.push({ label: `Fenêtre intenable après ${stop.windowClash}`, variant: 'warning' });
  }
  if (stop.outOfZone) {
    tags.push({ label: OUT_OF_ZONE_LABEL, variant: 'warning' });
  }
  if (stop.broughtBackAt !== null) {
    tags.push({ label: broughtBackLabel(stop.broughtBackAt), variant: 'warning' });
  }
  if (stop.sheet?.state === 'expected') {
    tags.push({ label: 'Pas encore prête', variant: 'warning' });
  }
  if (stop.defaultDemand !== null) {
    tags.push({ label: stop.defaultDemand, variant: 'neutral' });
  }
  return tags;
}

/** Le liseré d'un arrêt : le signal l'emporte, puis la fenêtre, puis la proposition. */
export function stopEdgeOf(stop: BoardStop): OrderCardEdge {
  if (stop.signals.length > 0 || stop.placementLate) {
    return 'alert';
  }
  if (stop.windowClash !== null) {
    return 'warning';
  }
  return stop.proposed ? 'proposed' : 'none';
}

/** Le nom d'une commande ou d'un arrêt : le libellé de l'adresse, sinon le client. */
export function cardTitleOf(item: {
  readonly reference: string;
  readonly sheet: DeliveryRunSheetStopView | null;
}): string {
  return stopNameOf(item);
}

/** « Arrêt 2, Chalet Marmotte, avant 08 h 30 » — ce que lit un lecteur d'écran. */
export function stopAriaOf(stop: BoardStop, index: number, frozen: boolean): string {
  const label = `Arrêt ${String(index + 1)}, ${cardTitleOf(stop)}, ${windowShortLabel(stop.window)}`;
  return frozen ? `${label}, tournée partie` : label;
}

/** « Bistrot du Vallon, CMD-2041, 07 h–08 h, à répartir. Glisser vers une tournée. » */
export function orderAriaOf(order: BoardOrder): string {
  return `${cardTitleOf(order)}, ${order.reference}, ${windowShortLabel(order.sheet?.window ?? null)}, à répartir. Glisser vers une tournée.`;
}

import type {
  InvoiceDeliveryVatModeView,
  InvoiceDossierHistoryEventView,
  InvoiceDossierLineView,
  InvoiceDossierOrderView,
  InvoiceDossierPlaceView,
  InvoiceDossierView,
} from '@lfd/contracts';
import { formatCents } from '@lfd/b2b-ui/order';
import type { FoldTimelineNode } from 'fold-ng';

/**
 * **La mise en mots du dossier de facturation** (plan
 * `plan-simulateur-dossier-de-facturation.md`, DF4) — tout ce que l'écran dit,
 * sans un seul calcul d'argent : les montants viennent du serveur, cet écran
 * ne fait que les écrire pour qu'un expert-comptable les refasse à la main.
 */

/** Un millicentime = 10⁻⁵ € : cinq décimales, exactement celles du prix figé. */
const MILLICENTS_PER_EURO = 100_000;
const MILLICENT_DIGITS = 5;

/** `1250` → `12,50 €`. */
export function euros(cents: number): string {
  return formatCents(cents);
}

/** Un écart signé : `+0,02 €`, `−0,01 €`, `0,00 €`. Le signe est la lecture. */
export function signedEuros(cents: number): string {
  if (cents === 0) {
    return formatCents(0);
  }
  return `${cents > 0 ? '+' : '−'}${formatCents(Math.abs(cents))}`;
}

/**
 * `123450` → `1,23450 €` — le prix unitaire à ses cinq décimales, par
 * arithmétique entière : un flottant écrirait `1,2344999…` un jour ou l'autre.
 */
export function unitPrice(millicents: number): string {
  const sign = millicents < 0 ? '−' : '';
  const absolute = Math.abs(millicents);
  const whole = Math.floor(absolute / MILLICENTS_PER_EURO);
  const fraction = `${absolute % MILLICENTS_PER_EURO}`.padStart(MILLICENT_DIGITS, '0');
  return `${sign}${whole.toLocaleString('fr-FR')},${fraction} €`;
}

/** `5.5` → `5,5 %`. */
export function ratePercent(rate: number): string {
  return `${String(rate).replace('.', ',')} %`;
}

/** La ligne de livraison, dite par son mode. */
export function deliveryModeLabel(mode: InvoiceDeliveryVatModeView): string {
  return mode === 'standard' ? 'TVA 20 %' : 'TVA au prorata des produits';
}

/** La nature d'une remise ou d'un frais, telle que le serveur la nomme (`key`). */
export function partLabel(key: string): string {
  switch (key) {
    case 'company_discount':
      return 'Remise société';
    case 'loyalty_voucher':
      return 'Bon de fidélité';
    case 'delivery_standard':
      return 'Livraison (TVA 20 %)';
    case 'delivery_follows_goods':
      return 'Livraison (au prorata des produits)';
    default:
      // `late_fee:20` — la surtaxe porte son taux dans sa clé.
      return key.startsWith('late_fee:') ? 'Surtaxe de retard' : key;
  }
}

/** `2026-10-03` → `3 oct. 2026`, sans glisser de fuseau. */
export function day(isoDay: string): string {
  const [year, month, date] = isoDay.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, date ?? 1)).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** Un instant ISO, au jour et à la minute, heure de Paris. */
export function instant(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Paris',
  });
}

/** La période d'une ligne de facture : un jour, une plage, ou rien. */
export function linePeriod(line: InvoiceDossierLineView): string {
  const first = line.firstDeliveryDate;
  const last = line.lastDeliveryDate;
  if (first === null || last === null) {
    return first === null && last === null ? 'sans date' : day(first ?? last ?? '');
  }
  return first === last ? day(first) : `du ${day(first)} au ${day(last)}`;
}

/** Le lieu d'un bon, sur une ligne. */
export function placeLabel(place: InvoiceDossierPlaceView): string {
  const where = [place.label, place.address].filter((part) => part !== null).join(' — ');
  const mode = place.method === 'pickup' ? 'Retrait' : 'Livraison';
  return where === '' ? `${mode}, adresse illisible` : `${mode} : ${where}`;
}

/** Ce que dit un fait de la frise, et comment il a été constaté. */
export function historyLabel(event: InvoiceDossierHistoryEventView): string {
  switch (event.kind) {
    case 'handed_over':
      return event.via === 'manual'
        ? 'Retiré au comptoir (saisie)'
        : event.via === 'scan'
          ? 'Retiré au comptoir (scan)'
          : 'Retiré au comptoir';
    case 'handed_over_at_door':
      return 'Remis au client à la porte';
    case 'deposited':
      return 'Déposé sans personne';
    case 'departed':
      return 'Parti en tournée';
    case 'brought_back':
      return 'Rapporté';
    case 'replaced':
      return 'Replacé dans une tournée';
  }
}

/** La frise d'un bon, au format de `fold-timeline` — inerte : rien ne s'y clique. */
export function historyNodes(order: InvoiceDossierOrderView): readonly FoldTimelineNode[] {
  return order.history.map((event, index) => ({
    key: `${index}-${event.kind}`,
    id: null,
    clickable: false,
    label:
      event.serviceDay === null
        ? historyLabel(event)
        : `${historyLabel(event)} — tournée du ${day(event.serviceDay)}`,
    displayDate: instant(event.at),
  }));
}

/** Les bons d'avant le réglage dont le port a été lu au taux normal. */
export function legacyDeliveryOrders(dossier: InvoiceDossierView): readonly string[] {
  return dossier.orders
    .filter((order) => order.deliveryFeeCents > 0 && order.deliveryVatMode === null)
    .map((order) => order.reference);
}

/** Vrai quand au moins un signalement est à lire en tête. */
export function hasAlerts(dossier: InvoiceDossierView): boolean {
  return (
    dossier.neverHandedOver.length > 0 ||
    dossier.inconsistentOrders.length > 0 ||
    dossier.otherMonthOrders.length > 0 ||
    dossier.ordersWithoutDate.length > 0 ||
    dossier.issuanceBlockers.length > 0 ||
    !dossier.threeGapInvariantHolds
  );
}

/** `2026-11-03` → `novembre 2026`. */
export function monthOfDay(isoDay: string): string {
  const [year, month] = isoDay.split('-').map(Number);
  return new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, 15)).toLocaleDateString('fr-FR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** `1 bon`, `3 bons`. */
export function countOrders(count: number): string {
  return `${count} bon${count > 1 ? 's' : ''}`;
}

/** Les lignes d'un écart qui portent quelque chose : un écart nul n'explique rien. */
export function nonZero<T extends { readonly gapCents: number }>(rows: readonly T[]): readonly T[] {
  return rows.filter((row) => row.gapCents !== 0);
}

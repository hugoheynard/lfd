import { httpErrorCode } from '@lfd/endpoints';
import {
  ITEM_LIMIT_OVERRIDE_REASON_MAX_LENGTH,
  type OrderQuoteCutoffView,
  type OrderQuoteExceededLimitView,
  type OrderRevisionQuoteView,
} from '@lfd/contracts';

/**
 * **Les lignes que la limite de leur produit ferme**, lues sur l'avis de
 * l'estimation (`cutoff.closedByItemLimit`, `cutoff.exceeded`) — plan
 * `documentation/limites-de-commande/passer-outre-la-limite-d-un-produit.md`,
 * § 3.5 et § 3.7.
 *
 * Rien n'est jugé ici : le serveur dit quelle ligne est fermée, si elle est
 * dépassable, et quelles limites la saisie passerait. L'écran choisit les mots.
 */

/** Ce qu'une ligne fermée par sa limite dit dans le panier. */
export type ItemLimitNotice =
  /** La saisie passerait la limite : elle demande le motif. */
  | { readonly kind: 'exceeded'; readonly text: string }
  /** Personne ne la passe : la ligne ne se commande plus pour ce jour. */
  | { readonly kind: 'closed'; readonly text: string };

export const ITEM_LIMIT_CLOSED = 'Ce produit ne se commande plus pour ce jour.';

/** « Limite dépassée — ce produit se commande 2 jours avant, 12:00 ». */
export function exceededText(limit: OrderQuoteExceededLimitView): string {
  const days = `${String(limit.daysBefore)} jour${limit.daysBefore > 1 ? 's' : ''}`;
  return `Limite dépassée — ce produit se commande ${days} avant, ${limit.time}.`;
}

const SERVICE_DAY = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});

/**
 * « Des produits ont dépassé leur limite de commande pour le mardi 24
 * novembre : A, B. » — le résumé en tête du panier, ou `null` sans ligne.
 * Le jour est un `AAAA-MM-JJ` de service, lu tel quel (UTC, sans décalage).
 */
export function exceededSummaryOf(
  lines: readonly { readonly name: string }[],
  serviceDay: string,
): string | null {
  if (lines.length === 0) {
    return null;
  }
  const names = lines.map((line) => line.name).join(', ');
  const day = /^\d{4}-\d{2}-\d{2}$/.test(serviceDay)
    ? ` pour le ${SERVICE_DAY.format(new Date(`${serviceDay}T00:00:00Z`))}`
    : '';
  return lines.length === 1
    ? `Un produit a dépassé sa limite de commande${day} : ${names}.`
    : `Des produits ont dépassé leur limite de commande${day} : ${names}.`;
}

/**
 * Le mot de chaque ligne fermée par sa limite, par SKU.
 *
 * « Dépassable » ne regarde pas l'instant : une ligne dépassable sous une
 * règle générale qui ferme le jour (`status: 'closed'`) ne se commande plus,
 * et seule une limite que le serveur range dans `exceeded` ouvre le motif.
 */
export function itemLimitNoticesOf(
  cutoff: OrderQuoteCutoffView | null,
): ReadonlyMap<string, ItemLimitNotice> {
  const notices = new Map<string, ItemLimitNotice>();
  if (cutoff === null) {
    return notices;
  }
  const exceeded = new Map(cutoff.exceeded.map((limit) => [limit.sku, limit]));
  for (const line of cutoff.closedByItemLimit) {
    const limit = exceeded.get(line.sku);
    notices.set(
      line.sku,
      line.exceedable && cutoff.status !== 'closed' && limit !== undefined
        ? { kind: 'exceeded', text: exceededText(limit) }
        : { kind: 'closed', text: ITEM_LIMIT_CLOSED },
    );
  }
  return notices;
}

/**
 * Le mot de chaque ligne fermée par sa limite, lu sur le devis d'une
 * modification par l'équipe (`closedByItemLimit`, dépassables ou non). Le
 * devis ne refuse plus une ligne fermée : seul le geste refuse, et l'écran
 * l'annonce avant. Un devis qui ne porte que `itemLimitOverrides` (serveur
 * antérieur) n'annonce que les lignes dépassables.
 */
export function revisionItemLimitNoticesOf(
  quote: OrderRevisionQuoteView | null,
): ReadonlyMap<string, ItemLimitNotice> {
  const notices = new Map<string, ItemLimitNotice>();
  if (quote === null) {
    return notices;
  }
  const closed =
    quote.closedByItemLimit ??
    (quote.itemLimitOverrides ?? []).map((limit) => ({ ...limit, exceedable: true }));
  for (const line of closed) {
    notices.set(
      line.sku,
      line.exceedable
        ? { kind: 'exceeded', text: exceededText(line) }
        : { kind: 'closed', text: ITEM_LIMIT_CLOSED },
    );
  }
  return notices;
}

/** Une ligne au moins demande le motif (elle sera passée outre). */
export function noticesAskReason(notices: ReadonlyMap<string, ItemLimitNotice>): boolean {
  return [...notices.values()].some((notice) => notice.kind === 'exceeded');
}

/** Une ligne au moins ne se commande plus : le geste serait refusé. */
export function noticesHoldClosedLine(notices: ReadonlyMap<string, ItemLimitNotice>): boolean {
  return [...notices.values()].some((notice) => notice.kind === 'closed');
}

/** La saisie passe-t-elle une limite de produit, donc demande-t-elle un motif ? */
export function asksItemLimitReason(cutoff: OrderQuoteCutoffView | null): boolean {
  return cutoff !== null && cutoff.status !== 'closed' && cutoff.exceeded.length > 0;
}

/**
 * Ce qui retient la validation tant que le motif manque — `null` quand rien.
 * Le serveur refuse de toute façon (`orders.cutoff.item_limit_reason_required`) ;
 * le dire avant évite un aller-retour au moment où le client attend.
 */
export function itemLimitBlockerOf(
  cutoff: OrderQuoteCutoffView | null,
  overriding: boolean,
  reason: string,
): string | null {
  return itemLimitReasonBlockerOf(asksItemLimitReason(cutoff), overriding, reason);
}

/**
 * La même retenue, quand l'écran sait déjà si une limite est passée — la
 * modification la lit sur `itemLimitOverrides` du devis, pas sur un avis de
 * l'heure limite.
 */
export function itemLimitReasonBlockerOf(
  asks: boolean,
  overriding: boolean,
  reason: string,
): string | null {
  if (!asks) {
    return null;
  }
  if (!overriding) {
    return 'Une limite de produit est dépassée : passez outre en indiquant pourquoi, ou retirez la ligne.';
  }
  const length = reason.trim().length;
  if (length === 0) {
    return 'Indiquez pourquoi vous passez outre la limite du produit.';
  }
  return length > ITEM_LIMIT_OVERRIDE_REASON_MAX_LENGTH
    ? `Le motif du dépassement tient en ${String(ITEM_LIMIT_OVERRIDE_REASON_MAX_LENGTH)} caractères au plus.`
    : null;
}

/**
 * Le motif dans la charge de la passation — omis quand il est vide : le
 * serveur ignore un motif sans dépassement, et refuse un motif vide.
 */
export function itemLimitReasonPayloadOf(
  overriding: boolean,
  reason: string,
): { readonly itemLimitOverrideReason?: string } {
  const trimmed = reason.trim();
  return overriding && trimmed !== '' ? { itemLimitOverrideReason: trimmed } : {};
}

const ITEM_LIMIT_REASON_REQUIRED = 'orders.cutoff.item_limit_reason_required';

/** Le refus « une limite de produit est passée sans motif » — lu sur son code. */
export function isItemLimitReasonRefusal(error: unknown): boolean {
  return httpErrorCode(error) === ITEM_LIMIT_REASON_REQUIRED;
}

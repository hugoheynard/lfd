import type {
  AdminOrderEstimateAmountsView,
  AdminOrderEstimateNotice,
  AdminOrderEstimateView,
  AdminPlaceOrderPayload,
} from '@lfd/contracts';
import { formatCents, formatVatPercent } from '@lfd/b2b-ui/order';
import { catchError, distinctUntilChanged, type Observable, of, switchMap, timer } from 'rxjs';

import type { PricedCartLine } from './cart.store';

/**
 * **L'estimation de la saisie** (plan
 * `documentation/pricing/saisie/plan-prix-de-la-saisie.md`, lot P2) : ce que
 * la page demande au serveur, quand, et ce que le panier en affiche.
 *
 * 🔴 Rien n'est calculé ici. Chaque montant vient de `POST
 * /admin/orders/estimate`, qui compose la commande que la passation
 * écrirait ; ce module choisit quoi montrer, il ne fait aucune arithmétique.
 */

/**
 * L'accalmie avant d'estimer, en millisecondes. Plus longue que celle du
 * devis (300) : une estimation coûte environ quinze lectures au serveur contre
 * deux, et le plan l'arrête à 400.
 */
export const ESTIMATE_DEBOUNCE_MS = 400;

/** Une estimation à demander : le corps, et la clé qui le résume. */
export interface EstimateRequest {
  readonly key: string;
  readonly payload: AdminPlaceOrderPayload;
}

/**
 * **La clé d'estimation : TOUT le corps**, lignes triées.
 *
 * Contrairement à `quoteKeyOf`, rien n'est écarté : le mode, le jour, la
 * tranche, le règlement et même la note entrent dans ce que le serveur juge
 * (le règlement décide du crédit). Seul l'ordre des lignes est neutralisé —
 * le prix d'un panier ne dépend pas de l'ordre où on l'a rempli.
 */
export function estimateKeyOf(payload: AdminPlaceOrderPayload): string {
  const lines = payload.lines
    .map((line) => JSON.stringify(line))
    .sort()
    .join('|');
  return JSON.stringify({ ...payload, lines });
}

/**
 * **Le flux des estimations** : `null` quand la saisie n'est pas composable,
 * sinon la réponse du serveur.
 *
 * - une clé inchangée ne redemande rien ;
 * - une clé neuve attend {@link ESTIMATE_DEBOUNCE_MS} sans autre changement,
 *   et un changement pendant l'attente ou pendant l'appel **annule** ce qui
 *   est en vol (`switchMap` se désabonne, et HttpClient interrompt) ;
 * - pendant l'attente, rien n'est émis : l'écran garde l'ancienne valeur
 *   jusqu'à la nouvelle, sans clignoter ;
 * - une saisie redevenue incomplète émet `null` **tout de suite** : le panier
 *   retombe sur son sous-total au lieu d'afficher le total d'une autre saisie ;
 * - un échec émet `null` : un total faux est pire qu'un sous-total, et la
 *   validation, elle, parle.
 */
export function estimatesOf(
  requests: Observable<EstimateRequest | null>,
  estimate: (payload: AdminPlaceOrderPayload) => Observable<AdminOrderEstimateView>,
  debounceMs: number = ESTIMATE_DEBOUNCE_MS,
): Observable<AdminOrderEstimateView | null> {
  return requests.pipe(
    distinctUntilChanged((previous, next) => (previous?.key ?? '') === (next?.key ?? '')),
    switchMap((request) =>
      request === null
        ? of(null)
        : timer(debounceMs).pipe(
            switchMap(() => estimate(request.payload)),
            catchError(() => of(null)),
          ),
    ),
  );
}

/** Une ligne du détail des montants. */
export interface EstimateTotalRow {
  readonly key: string;
  readonly label: string;
  readonly value: string;
}

/** Le libellé d'une remise sans promotion : celle du point de retrait. */
const PICKUP_DISCOUNT_LABEL = 'Remise de retrait';

/**
 * **Le détail des montants**, dans l'ordre de la facture : sous-total HT,
 * chaque remise, frais de livraison, supplément de retard sur sa propre ligne
 * (D1 : « comme sur la facture »), TVA par taux, total TTC.
 */
export function estimateTotalRows(
  amounts: AdminOrderEstimateAmountsView,
): readonly EstimateTotalRow[] {
  const rows: EstimateTotalRow[] = [
    { key: 'subtotal', label: 'Sous-total HT', value: formatCents(amounts.subtotalCents) },
  ];
  for (const discount of amounts.discounts) {
    rows.push({
      key: `discount-${String(discount.rank)}`,
      label: discount.label ?? PICKUP_DISCOUNT_LABEL,
      value: `− ${formatCents(discount.amountCents)}`,
    });
  }
  if (amounts.deliveryFeeCents > 0) {
    rows.push({
      key: 'delivery',
      label: 'Livraison HT',
      value: formatCents(amounts.deliveryFeeCents),
    });
  }
  if (amounts.lateFeeCents > 0) {
    const rate = amounts.lateFeeVatRatePercent;
    rows.push({
      key: 'late-fee',
      label:
        rate === null
          ? 'Supplément de retard HT'
          : `Supplément de retard HT · TVA ${formatVatPercent(rate)}`,
      value: formatCents(amounts.lateFeeCents),
    });
  }
  for (const share of amounts.vatShares) {
    rows.push({
      key: `vat-${String(share.rate)}`,
      label: `TVA ${formatVatPercent(share.rate)}`,
      value: formatCents(share.amountCents),
    });
  }
  rows.push({ key: 'total', label: 'Total TTC', value: formatCents(amounts.totalCents) });
  return rows;
}

/**
 * Les lignes du panier **au prix de l'estimation** quand elle en porte une :
 * le prix facturé, et le prix barré (`basePriceMillicents`) seulement quand il
 * diffère. Une ligne absente de l'estimation garde ce que le devis disait.
 */
export function estimatedLines(
  lines: readonly PricedCartLine[],
  amounts: AdminOrderEstimateAmountsView | null,
): readonly PricedCartLine[] {
  if (amounts === null) {
    return lines;
  }
  const bySku = new Map(amounts.lines.map((line) => [line.sku, line]));
  return lines.map((line) => {
    const estimated = bySku.get(line.sku);
    if (estimated === undefined) {
      return line;
    }
    const base = estimated.basePriceMillicents;
    return {
      ...line,
      unitPriceMillicents: estimated.unitPriceMillicents,
      canonicalPriceMillicents:
        base !== null && base !== estimated.unitPriceMillicents ? base : null,
    };
  });
}

/** « 7 articles · Total TTC 123,45 € », ou le sous-total HT sans estimation. */
export function estimateSummary(
  count: number,
  amounts: AdminOrderEstimateAmountsView | null,
  subtotalCents: number,
): string {
  const articles = `${String(count)} article${count > 1 ? 's' : ''}`;
  return amounts === null
    ? `${articles} · Sous-total HT ${formatCents(subtotalCents)} HT`
    : `${articles} · Total TTC ${formatCents(amounts.totalCents)}`;
}

/** Où se corrige un refus : les lignes, les réglages, ou on ne sait pas. */
export type EstimateRefusalView = 'lines' | 'settings' | null;

/** Les familles de codes dont on sait quelle vue corrige le refus. */
const LINES_PREFIXES = ['orders.line.', 'orders.empty', 'orders.sku', 'orders.catalog'];
const SETTINGS_PREFIXES = [
  'orders.cutoff.',
  'orders.delivery',
  'orders.fulfillment.',
  'orders.counter.',
  'orders.pickup',
  'orders.settlement',
];

/**
 * La vue qui corrige un refus, lue sur son **code** — jamais sur la phrase,
 * écrite pour être lue. `null` quand le code n'est d'aucune famille connue :
 * pas de flèche vers une vue qui ne corrigerait rien.
 */
export function refusalViewOf(code: string): EstimateRefusalView {
  if (LINES_PREFIXES.some((prefix) => code.startsWith(prefix))) {
    return 'lines';
  }
  return SETTINGS_PREFIXES.some((prefix) => code.startsWith(prefix)) ? 'settings' : null;
}

/**
 * Le refus « heure limite passée, encore rattrapable » : la passation le
 * transforme en proposition de dérogation (`isGraceRefusal`). Le bloquer
 * ici fermerait ce chemin — il se dit, sans retenir la validation.
 */
const GRACE_REFUSAL = 'orders.cutoff.grace';

/** Le refus de l'estimation retient-il la validation ? */
export function isBlockingRefusal(refusal: AdminOrderEstimateNotice): boolean {
  return refusal.code !== GRACE_REFUSAL;
}

import type {
  AdminOrderEstimateAmountsView,
  AdminOrderEstimateNotice,
  AdminOrderEstimateView,
  AdminOrderEstimatePayload,
  FulfillmentMethod,
  PickupAddressView,
  StaffSettlement,
} from '@lfd/contracts';
import { orderTotalRows, type OrderTotalsSource, type TotalRow } from '@lfd/b2b-ui/order';
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
  readonly payload: AdminOrderEstimatePayload;
}

/**
 * **La clé d'estimation : TOUT le corps**, lignes triées.
 *
 * Rien n'est écarté : le mode, le jour, la
 * tranche, le règlement et même la note entrent dans ce que le serveur juge
 * (le règlement décide du crédit). Seul l'ordre des lignes est neutralisé —
 * le prix d'un panier ne dépend pas de l'ordre où on l'a rempli.
 */
export function estimateKeyOf(payload: AdminOrderEstimatePayload): string {
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
  // La clé suit le corps : l'appelant sait ainsi À QUELLE saisie une réponse
  // appartient (plan total vu, T3 — la validation attend l'estimation courante).
  estimate: (payload: AdminOrderEstimatePayload, key: string) => Observable<AdminOrderEstimateView>,
  debounceMs: number = ESTIMATE_DEBOUNCE_MS,
): Observable<AdminOrderEstimateView | null> {
  return requests.pipe(
    distinctUntilChanged((previous, next) => (previous?.key ?? '') === (next?.key ?? '')),
    switchMap((request) =>
      request === null
        ? of(null)
        : timer(debounceMs).pipe(
            switchMap(() => estimate(request.payload, request.key)),
            catchError(() => of(null)),
          ),
    ),
  );
}

/**
 * **L'estimation, lue comme la commande qu'elle serait** — pour que le panier
 * passe par `orderTotalRows`, la règle d'affichage de toute commande (au
 * compte le seul HT, F5 ; sinon TVA et TTC). Aucune arithmétique : chaque
 * montant est recopié tel que le serveur l'a rendu.
 *
 * Ce que l'estimation ne porte pas est rendu VIDE, jamais deviné :
 * `discountAdjustment`, `lateFeeAdjustment` et `deliveryVatMode` à `null`,
 * aucun bon de fidélité. Le lien de règlement se lit comme une commande en
 * attente de paiement (`due`) : c'est sa seule différence avec le compte, ici.
 */
export function estimateTotalsSource(
  amounts: AdminOrderEstimateAmountsView,
  settlement: StaffSettlement,
  fulfillmentMethod: FulfillmentMethod,
  pickup: PickupAddressView | null,
): OrderTotalsSource {
  return {
    settlement: settlement === 'account' ? 'account' : 'due',
    fulfillmentMethod,
    pickupAddress:
      pickup === null
        ? null
        : {
            label: pickup.label,
            ligne1: pickup.ligne1,
            ligne2: pickup.ligne2,
            codePostal: pickup.codePostal,
            ville: pickup.ville,
            pays: pickup.pays,
          },
    subtotalCents: amounts.subtotalCents,
    discountCents: amounts.discountCents,
    discountAdjustment: null,
    discounts: amounts.discounts.map((discount) => ({
      ...(discount.label === null
        ? {}
        : { label: { fr: discount.label, en: discount.label, it: discount.label } }),
      adjustment: null,
      amountCents: discount.amountCents,
      amountTtcCents: discount.amountTtcCents,
    })),
    voucherDiscountCents: 0,
    deliveryFeeCents: amounts.deliveryFeeCents,
    deliveryVatMode: null,
    lateFeeCents: amounts.lateFeeCents,
    lateFeeAdjustment: null,
    vatCents: amounts.vatCents,
    totalCents: amounts.totalCents,
  };
}

/** Ce que la saisie a décidé et que le récapitulatif lit : règlement et acheminement. */
export interface EstimateTotalsContext {
  readonly settlement: StaffSettlement;
  readonly method: FulfillmentMethod;
  readonly pickupAddressId: string | null;
  readonly pickups: readonly PickupAddressView[];
}

/**
 * **Le récapitulatif de l'estimation, par la règle partagée** — `null` sans
 * estimation : le panier retombe alors sur son sous-total.
 */
export function estimateRowsOf(
  amounts: AdminOrderEstimateAmountsView | null,
  context: EstimateTotalsContext,
): readonly TotalRow[] | null {
  if (amounts === null) {
    return null;
  }
  const pickup =
    context.method === 'pickup'
      ? (context.pickups.find((point) => point.id === context.pickupAddressId) ?? null)
      : null;
  return orderTotalRows(estimateTotalsSource(amounts, context.settlement, context.method, pickup));
}

/**
 * Les lignes du panier **au prix de l'estimation** quand elle en porte une :
 * le prix facturé, et le prix barré (`basePriceMillicents`) seulement quand il
 * diffère. Une ligne absente de l'estimation garde le prix du catalogue.
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

/** Ce que dit le total tant que l'estimation n'est pas là. */
export const PRICES_PENDING = 'Prix à confirmer';

/**
 * « 7 articles · Total HT 123,45 € » au compte, « … · Total TTC … » au lien :
 * le total est la ligne `total` de `orderTotalRows`, jamais recalculé. Sans
 * estimation, aucun montant : le panier n'en calcule pas (2026-11-04).
 */
export function estimateSummary(count: number, rows: readonly TotalRow[] | null): string {
  const articles = `${String(count)} article${count > 1 ? 's' : ''}`;
  const total = rows?.find((row) => row.key === 'total');
  return total === undefined
    ? `${articles} · ${PRICES_PENDING}`
    : `${articles} · ${total.label} ${total.value}`;
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

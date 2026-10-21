import type {
  CompanyOrderAuthorView,
  FulfillmentMethod,
  OrderSummaryTableView,
} from '@lfd/contracts';

import type { LocaleCode } from '../client-locale.service';
import { fill } from '../copy/client-copy.service';
import type { OrderSummaryCopy } from '../copy/screens/order-summary.copy';
import { formatCents } from '../format-money';
import type { SummaryBottomLine } from './order-summary-format';

/**
 * Les mots de la liste des **bons de commande inclus** (plan
 * `documentation/commandes/plan-recapitulatif-des-commandes.md`, §10) — posés
 * sur ce que le serveur a calculé : le HT de chaque bon, leur somme et
 * l'écart avec le sous-total. Aucun calcul ici.
 */

export function modeLabel(method: FulfillmentMethod, copy: OrderSummaryCopy): string {
  return method === 'delivery' ? copy.modeDelivery : copy.modePickup;
}

/** Le nom du client, ou « l'équipe » quand elle a saisi la commande (C1). */
export function authorLabel(author: CompanyOrderAuthorView, copy: OrderSummaryCopy): string {
  return author.kind === 'team' ? copy.authorTeam : author.name;
}

const INTL_LOCALE: Readonly<Record<LocaleCode, string>> = { fr: 'fr-FR', en: 'en-GB', it: 'it-IT' };

/** `2026-10-07` → « mer. 7 oct. 2026 » — un jour civil, lu et écrit en UTC. */
export function orderDayLabel(
  day: string | null,
  copy: OrderSummaryCopy,
  locale: LocaleCode,
): string {
  if (day === null) {
    return copy.undated;
  }
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${day}T12:00:00.000Z`));
}

/**
 * Sous la liste : la somme des HT des bons, puis — s'il y en a un — l'écart
 * avec le sous-total HT de la table, EXPLIQUÉ par les gestes qui l'ont fait.
 */
export function ordersFootLines(
  table: OrderSummaryTableView,
  copy: OrderSummaryCopy,
  pretaxLabel: string = copy.ordersPretax,
): readonly SummaryBottomLine[] {
  const { bottom, ordersPretax } = table;
  const sum = { label: pretaxLabel, amount: formatCents(ordersPretax.pretaxCents), strong: true };
  if (ordersPretax.gapCents === 0) {
    return [sum];
  }
  const causes = [
    ...(bottom.discountCents === 0 ? [] : [copy.gapDiscount]),
    ...(bottom.voucherDiscountCents === 0 ? [] : [copy.gapVoucher]),
    ...(bottom.deliveryFeeCents === 0 ? [] : [copy.gapDelivery]),
    ...(bottom.lateFeeCents === 0 ? [] : [copy.gapLateFee]),
    ...(ordersPretax.cappedDiscountCents === 0 ? [] : [copy.gapCapped]),
  ];
  return [
    sum,
    {
      label: fill(copy.ordersGap, { causes: causes.join(', ') }),
      amount: formatCents(ordersPretax.gapCents),
      strong: false,
    },
  ];
}

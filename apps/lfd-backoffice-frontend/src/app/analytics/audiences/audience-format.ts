import { formatCents } from '@lfd/b2b-ui/order';
import {
  AUDIENCE_PERIODS,
  type AudienceCell,
  type AudienceDimension,
  type AudiencePeriod,
} from '@lfd/contracts';
import type { FoldViewToggleOption } from 'fold-ng';

/** 7, 30 ou 90 jours — les choix du sélecteur de période. */
export const AUDIENCE_PERIOD_OPTIONS: readonly FoldViewToggleOption[] = AUDIENCE_PERIODS.map(
  (days) => ({ value: String(days), label: `${String(days)} jours` }),
);

export function audiencePeriodOf(value: string): AudiencePeriod | null {
  return AUDIENCE_PERIODS.find((days) => String(days) === value) ?? null;
}

/** Le titre et la phrase de chaque coupe — ce que la carte dit d'elle-même. */
export const DIMENSION_TEXTS: Readonly<
  Record<AudienceDimension, { readonly title: string; readonly subtitle: string }>
> = {
  clientele: {
    title: 'Pros et particuliers',
    subtitle: 'Qui commande : une société, ou une personne.',
  },
  activity: {
    title: 'Activité des pros',
    subtitle:
      'D’après le code NAF de la société, regroupé en familles. Les particuliers n’y sont pas.',
  },
  fulfillment: { title: 'Retrait ou livraison', subtitle: 'Comment la commande est acheminée.' },
  pickup_site: {
    title: 'Points de retrait',
    subtitle: 'Le point figé sur la commande. Les livraisons n’y sont pas.',
  },
  delivery_zone: {
    title: 'Zones de livraison',
    subtitle: 'Le code postal et la commune livrés. Les retraits n’y sont pas.',
  },
  loyalty: {
    title: 'Fidélité',
    subtitle: 'Combien de commandes un même client a passées sur la période.',
  },
  moment: {
    title: 'Moment de commande',
    subtitle: 'Jour et tranche horaire de passation, à l’heure de Paris.',
  },
};

/** La phrase qui annonce la règle d'anonymat, avec le seuil que le serveur applique. */
export function anonymityHelp(minClients: number): string {
  return (
    `Chiffres agrégés, jamais un client : une case qui compte moins de ${String(minClients)} clients ` +
    'distincts affiche « trop peu de clients » au lieu de ses chiffres. Un client est une société ' +
    'pour un pro, une personne sinon. Ni brouillons, ni annulées, ni cartes non encaissées ; les ' +
    'commandes saisies par l’équipe comptent, celles des abonnements sont à part.'
  );
}

/** Ce que la case masquée affiche à la place d'un chiffre. */
export const TOO_FEW_CLIENTS = 'Trop peu de clients';

/** Une ligne du tableau d'une coupe, déjà mise en mots. */
export interface AudienceRow {
  readonly key: string;
  readonly label: string;
  readonly masked: boolean;
  readonly clients: string;
  readonly orders: string;
  readonly averageBasket: string;
  readonly revenue: string;
  readonly topFamilies: string;
}

const DASH = '—';

/** Une case → sa ligne : les chiffres, ou la mention du seuil et des tirets. */
export function audienceRowOf(cell: AudienceCell): AudienceRow {
  if (cell.status === 'too_few_clients') {
    return {
      key: cell.key,
      label: cell.label,
      masked: true,
      clients: TOO_FEW_CLIENTS,
      orders: DASH,
      averageBasket: DASH,
      revenue: DASH,
      topFamilies: DASH,
    };
  }
  return {
    key: cell.key,
    label: cell.label,
    masked: false,
    clients: String(cell.clients),
    orders: String(cell.orders),
    averageBasket: `${formatCents(cell.averageBasketHtCents)} HT · ${formatCents(cell.averageBasketTtcCents)} TTC`,
    revenue: `${formatCents(cell.revenueHtCents)} HT · ${formatCents(cell.revenueTtcCents)} TTC`,
    topFamilies:
      cell.topFamilies.length === 0
        ? DASH
        : cell.topFamilies.map((family) => family.name).join(', '),
  };
}

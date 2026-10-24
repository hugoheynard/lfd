import type {
  AdminOrdersQuery,
  FulfillmentMethod,
  OrderClientele,
  OrderStatus,
  PaymentStatus,
} from '@lfd/contracts';
import type { FoldSelectOption } from 'fold-ng';
import { orderStatusLabel, paymentStatusLabel } from '@lfd/b2b-ui/order';

/**
 * **Les filtres de la liste des commandes, tels que l'URL les porte.**
 *
 * L'URL est la source : un filtre posé se partage en copiant l'adresse, et le
 * retour depuis le détail le retrouve (page-commandes.md, §3). Les noms des
 * paramètres sont ceux de `GET /admin/orders`, pour qu'aucune traduction ne
 * sépare ce qu'on lit dans la barre d'adresse de ce que le serveur reçoit.
 *
 * Rien ici n'importe de schéma zod : la boucle des valeurs admises est tenue
 * par des `Record` exhaustifs, que le compilateur complète quand un état naît.
 */
export interface OrderListFilters {
  readonly clientele: OrderClientele | null;
  readonly method: FulfillmentMethod | null;
  readonly status: OrderStatus | null;
  readonly paymentStatus: PaymentStatus | null;
  readonly placedFrom: string | null;
  readonly placedTo: string | null;
  readonly fulfillmentFrom: string | null;
  readonly fulfillmentTo: string | null;
  readonly q: string | null;
}

export type OrderListFilterKey = keyof OrderListFilters;

/** La valeur « Tous » d'un filtre à choix — jamais envoyée au serveur. */
export const ANY = 'any';
export type Choice<T extends string> = T | typeof ANY;

export const NO_FILTERS: OrderListFilters = {
  clientele: null,
  method: null,
  status: null,
  paymentStatus: null,
  placedFrom: null,
  placedTo: null,
  fulfillmentFrom: null,
  fulfillmentTo: null,
  q: null,
};

const CLIENTELE_LABELS: Readonly<Record<OrderClientele, string>> = {
  pro: 'Pro',
  public: 'Particulier',
};

const METHOD_LABELS: Readonly<Record<FulfillmentMethod, string>> = {
  pickup: 'Retrait',
  delivery: 'Livraison',
};

/** Exhaustif : un état ajouté au contrat ne compile pas tant qu'il manque ici. */
const STATUSES: Readonly<Record<OrderStatus, true>> = {
  draft: true,
  placed: true,
  confirmed: true,
  in_production: true,
  ready: true,
  fulfilled: true,
  cancelled: true,
};

const PAYMENT_STATUSES: Readonly<Record<PaymentStatus, true>> = {
  not_required: true,
  pending: true,
  paid: true,
  failed: true,
  refunded: true,
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function keysOf<T extends string>(record: Readonly<Record<T, unknown>>): T[] {
  return Object.keys(record) as T[];
}

function oneOf<T extends string>(record: Readonly<Record<T, unknown>>, raw: unknown): T | null {
  return typeof raw === 'string' && Object.hasOwn(record, raw) ? (raw as T) : null;
}

function dayOf(raw: unknown): string | null {
  return typeof raw === 'string' && DAY.test(raw) ? raw : null;
}

function textOf(raw: unknown): string | null {
  const text = typeof raw === 'string' ? raw.trim() : '';
  return text === '' ? null : text;
}

/** Libellé de la clientèle d'une ligne — `null` pour une commande d'avant la distinction. */
export function clienteleLabel(clientele: OrderClientele | null): string | null {
  return clientele === null ? null : CLIENTELE_LABELS[clientele];
}

export function methodLabel(method: FulfillmentMethod): string {
  return METHOD_LABELS[method];
}

/**
 * Les paramètres d'URL → des filtres. Une valeur inconnue (une adresse tapée à
 * la main, un état retiré depuis) tombe à « Tous » au lieu de partir au serveur,
 * qui la refuserait d'un 400 et viderait l'écran.
 */
export function filtersFromParams(params: Readonly<Record<string, unknown>>): OrderListFilters {
  return {
    clientele: oneOf(CLIENTELE_LABELS, params['clientele']),
    method: oneOf(METHOD_LABELS, params['method']),
    status: oneOf(STATUSES, params['status']),
    paymentStatus: oneOf(PAYMENT_STATUSES, params['paymentStatus']),
    placedFrom: dayOf(params['placedFrom']),
    placedTo: dayOf(params['placedTo']),
    fulfillmentFrom: dayOf(params['fulfillmentFrom']),
    fulfillmentTo: dayOf(params['fulfillmentTo']),
    q: textOf(params['q']),
  };
}

/**
 * Des filtres → les paramètres d'URL. Un filtre vide **disparaît** de
 * l'adresse (`null` le retire au `navigate`) : une URL sans filtre reste
 * `/commandes`, et non une traîne de `?status=&method=`.
 */
export function filtersToParams(filters: OrderListFilters): Record<string, string | null> {
  return { ...filters };
}

/** Des filtres → la requête du serveur, sans les vides. */
export function filtersToQuery(filters: OrderListFilters): Partial<AdminOrdersQuery> {
  const query: { -readonly [K in keyof AdminOrdersQuery]?: AdminOrdersQuery[K] } = {};
  if (filters.clientele !== null) query.clientele = filters.clientele;
  if (filters.method !== null) query.method = filters.method;
  if (filters.status !== null) query.status = filters.status;
  if (filters.paymentStatus !== null) query.paymentStatus = filters.paymentStatus;
  if (filters.placedFrom !== null) query.placedFrom = filters.placedFrom;
  if (filters.placedTo !== null) query.placedTo = filters.placedTo;
  if (filters.fulfillmentFrom !== null) query.fulfillmentFrom = filters.fulfillmentFrom;
  if (filters.fulfillmentTo !== null) query.fulfillmentTo = filters.fulfillmentTo;
  if (filters.q !== null) query.q = filters.q;
  return query;
}

/** Vrai quand au moins un filtre est posé — le vide se dit alors autrement. */
export function hasFilters(filters: OrderListFilters): boolean {
  return Object.values(filters).some((value) => value !== null);
}

function withAny<T extends string>(
  anyLabel: string,
  values: readonly T[],
  label: (value: T) => string,
): FoldSelectOption<Choice<T>>[] {
  return [
    { value: ANY, label: anyLabel },
    ...values.map((value) => ({ value, label: label(value) })),
  ];
}

export const CLIENTELE_CHOICES = withAny(
  'Tous',
  keysOf(CLIENTELE_LABELS),
  (v) => CLIENTELE_LABELS[v],
);
export const METHOD_CHOICES = withAny('Tous', keysOf(METHOD_LABELS), (v) => METHOD_LABELS[v]);
export const STATUS_CHOICES = withAny('Tous', keysOf(STATUSES), orderStatusLabel);
export const PAYMENT_CHOICES = withAny('Tous', keysOf(PAYMENT_STATUSES), paymentStatusLabel);

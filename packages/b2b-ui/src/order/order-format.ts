import type { CartAdjustment, FulfillmentMethod, OrderStatus, PaymentStatus } from '@lfd/contracts';
import type { FoldBadgeVariant } from 'fold-ng';

/**
 * Le **vocabulaire d'une commande** — libellés et tons, en un seul endroit.
 *
 * Partagé client ↔ commercial **délibérément** : quand le client appelle en
 * disant « ma commande est en production », le commercial doit lire exactement
 * le même mot sur son écran. Deux tables de libellés, c'est deux vocabulaires
 * qui divergent au premier ajout de statut, et une conversation qui ne se
 * raccroche à rien.
 *
 * Le **ton** suit le sens, pas l'esthétique : `alert` est réservé à ce qui a
 * échoué (annulée, paiement refusé), `warning` à ce qui attend une action, et
 * `success` à ce qui est acquis. Un écran tout en couleur ne hiérarchise plus.
 */

interface Labelled {
  readonly label: string;
  readonly variant: FoldBadgeVariant;
}

/** Avancement de **production** — où en est la commande dans l'atelier. */
const STATUS: Readonly<Record<OrderStatus, Labelled>> = {
  draft: { label: 'Brouillon', variant: 'neutral' },
  placed: { label: 'Passée', variant: 'info' },
  confirmed: { label: 'Confirmée', variant: 'info' },
  in_production: { label: 'En production', variant: 'warning' },
  fulfilled: { label: 'Livrée', variant: 'success' },
  cancelled: { label: 'Annulée', variant: 'alert' },
};

/**
 * État du **règlement** — découplé de l'avancement de production. `not_required`
 * ne veut pas dire « gratuite » mais « facturée sur terme » : le libellé le dit,
 * sans quoi une commande à régler passerait pour une commande sans reste à payer.
 */
const PAYMENT: Readonly<Record<PaymentStatus, Labelled>> = {
  not_required: { label: 'À facturer', variant: 'neutral' },
  pending: { label: 'Paiement en attente', variant: 'warning' },
  paid: { label: 'Payée', variant: 'success' },
  failed: { label: 'Paiement échoué', variant: 'alert' },
  refunded: { label: 'Remboursée', variant: 'neutral' },
};

const FULFILLMENT: Readonly<Record<FulfillmentMethod, string>> = {
  delivery: 'Livraison par coursier',
  pickup: 'Retrait au laboratoire',
};

export function orderStatusLabel(status: OrderStatus): string {
  return STATUS[status].label;
}

export function orderStatusVariant(status: OrderStatus): FoldBadgeVariant {
  return STATUS[status].variant;
}

export function paymentStatusLabel(status: PaymentStatus): string {
  return PAYMENT[status].label;
}

export function paymentStatusVariant(status: PaymentStatus): FoldBadgeVariant {
  return PAYMENT[status].variant;
}

export function fulfillmentLabel(method: FulfillmentMethod): string {
  return FULFILLMENT[method];
}

/**
 * Des centimes → « 6,33 € ». **Toujours les centimes**, jamais d'arrondi à
 * l'euro : c'est un montant facturé, pas un ordre de grandeur, et un client qui
 * compare à son relevé ne doit pas tomber sur un écart d'un centime.
 */
export function formatCents(cents: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

/** Un taux de TVA `0.055` → « 5,5 % ». */
export function formatVatRate(rate: number): string {
  return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(rate * 100)} %`;
}

/**
 * Un ajustement → sa **forme**, telle qu'elle a été convenue : « −20 % » pour un
 * taux, « −15,00 € » pour un montant fixe. Rendre le taux plutôt que de le
 * recalculer depuis le montant est ce qui distingue une remise nommée d'un
 * chiffre orphelin — et une division ferait dire « −19,99 % » au premier arrondi.
 */
export function formatAdjustment(adjustment: CartAdjustment): string {
  if (adjustment.mode === 'amount') {
    return `−${formatCents(adjustment.cents)}`;
  }
  const percent = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(
    adjustment.bp / 100,
  );
  return `−${percent} %`;
}

/** ISO (instant ou `YYYY-MM-DD`) → « 6 août 2026 ». */
export function formatOrderDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/**
 * ISO → « 6 août ». Sans l'année, pour la frise : elle couvre des jours, jamais
 * des années, et répéter « 2026 » à chaque jalon vole la place à l'heure.
 */
export function formatOrderDay(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

/**
 * ISO → « 6 août, 14:32 ». L'**heure** est ce qui distingue une commande passée
 * juste avant l'heure limite d'une commande passée juste après — c'est-à-dire
 * celle qui entre dans le plan du soir de celle qu'il faudra arbitrer. Sur une
 * frise de production, c'est la précision utile.
 */
export function formatOrderInstant(iso: string): string {
  const at = new Date(iso);
  const day = at.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  const time = at.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return `${day}, ${time}`;
}

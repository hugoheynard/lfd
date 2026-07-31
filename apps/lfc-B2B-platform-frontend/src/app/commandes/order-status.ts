import type { OrderStatus } from '@lfd/contracts';
import type { FoldBadgeVariant } from 'fold-ng';

/** Libellé + ton du badge de statut de commande, dans le langage du client. */
export const ORDER_STATUS: Record<
  OrderStatus,
  { readonly label: string; readonly variant: FoldBadgeVariant }
> = {
  draft: { label: 'Brouillon', variant: 'neutral' },
  placed: { label: 'Passée', variant: 'info' },
  confirmed: { label: 'Confirmée', variant: 'info' },
  in_production: { label: 'En production', variant: 'warning' },
  fulfilled: { label: 'Livrée', variant: 'success' },
  cancelled: { label: 'Annulée', variant: 'alert' },
};

export function orderStatusLabel(status: OrderStatus): string {
  return ORDER_STATUS[status].label;
}

export function orderStatusVariant(status: OrderStatus): FoldBadgeVariant {
  return ORDER_STATUS[status].variant;
}

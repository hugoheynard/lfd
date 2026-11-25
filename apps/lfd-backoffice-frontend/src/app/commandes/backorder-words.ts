import type { AdminBackorderLine, BackorderState, FulfillmentMethod } from '@lfd/contracts';
import { saleQuantityLabel } from '@lfd/b2b-ui/catalog';
import { formatCents, type TotalRow } from '@lfd/b2b-ui/order';

const DAY_MS = 86_400_000;

/** « 3 × Croissant », « 750 g Pain de seigle » : une ligne du reliquat, dite. */
export function backorderLineSentence(line: AdminBackorderLine): string {
  return line.saleUnit === 'weight'
    ? `${saleQuantityLabel(line.quantity, 'weight')} ${line.productName}`
    : `${String(line.quantity)} × ${line.productName}`;
}

/**
 * **L'âge d'un reliquat**, en jours calendaires écoulés depuis sa naissance
 * (la décision du départ) : « aujourd'hui », « hier », « il y a 4 jours ».
 * C'est ce qui ordonne la liste à traiter — le plus ancien attend le plus.
 */
export function backorderAgeOf(createdAt: string, now: Date): string {
  const born = new Date(createdAt);
  const startOf = (date: Date): number =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const days = Math.max(0, Math.round((startOf(now) - startOf(born)) / DAY_MS));
  if (days === 0) {
    return 'aujourd’hui';
  }
  return days === 1 ? 'hier' : `il y a ${String(days)} jours`;
}

/** Le mot de l'état, et la teinte de son badge. */
export const BACKORDER_STATE_WORDS: Record<
  BackorderState,
  { readonly label: string; readonly variant: 'warning' | 'success' | 'neutral' }
> = {
  open: { label: 'À traiter', variant: 'warning' },
  converted: { label: 'Transformé en commande', variant: 'success' },
  abandoned: { label: 'Abandonné', variant: 'neutral' },
};

/**
 * **Le port offert, dit dans le récapitulatif** (décision 7 du plan du
 * reliquat) : sur une commande issue d'un reliquat livrée, le franco est figé
 * à 0 et le frais vaut 0 — sans quoi le détail des montants se tairait sur la
 * livraison, et un « encore 0 € » serait la seule façon de le lire. La ligne
 * « Livraison offerte » se pose avant le total ; rien en retrait, ni quand le
 * serveur la dit déjà.
 */
export function withFreeDelivery(
  rows: readonly TotalRow[],
  method: FulfillmentMethod,
): readonly TotalRow[] {
  if (method !== 'delivery' || rows.some((row) => row.key === 'free-delivery')) {
    return rows;
  }
  const free: TotalRow = {
    key: 'free-delivery',
    label: 'Livraison offerte',
    value: formatCents(0),
    strong: false,
  };
  const total = rows.findIndex((row) => row.strong);
  return total < 0 ? [...rows, free] : [...rows.slice(0, total), free, ...rows.slice(total)];
}

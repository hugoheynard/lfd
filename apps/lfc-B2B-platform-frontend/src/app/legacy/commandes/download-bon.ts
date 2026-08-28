import { formatEurValue } from '../data/catalogue-seed';
import { orderStatusLabel } from '@lfd/b2b-ui/order';
import type { CommandeRow } from './orders-demo-seed';

/**
 * Génère et télécharge un **bon de commande** texte, entièrement côté navigateur
 * (front-only). Partagé par la page Commandes et le stock du tableau de bord.
 */
export function downloadBon(row: CommandeRow): void {
  const body = [
    'BON DE COMMANDE',
    '',
    `Référence     : ${row.reference}`,
    `Date          : ${new Date(row.date).toLocaleDateString('fr-FR')}`,
    `Établissement : ${row.establishment}`,
    `Livraison     : ${row.deliveryPlace}`,
    `Statut        : ${orderStatusLabel(row.status)}`,
    `Total TTC     : ${formatEurValue(row.totalEur)}`,
    '',
    'La Folie Coffee — B2B',
  ].join('\n');
  const blob = new Blob([body], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${row.reference}.txt`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

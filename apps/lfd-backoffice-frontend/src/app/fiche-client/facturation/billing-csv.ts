import type { AdminOrderRow } from '@lfd/contracts';

import type { LedgerRow } from './billing-periods';

/**
 * Le **relevé d'une période, en CSV** — ce qui se reporte dans le logiciel
 * comptable.
 *
 * Trois choix qui ne sont pas cosmétiques, parce que le fichier est ouvert dans
 * un tableur français :
 *
 * - **séparateur `;`** — Excel en locale française ouvre un fichier `,` en une
 *   seule colonne, et il faut alors passer par l'assistant d'import ;
 * - **virgule décimale** — `12,50` et non `12.50`, sans quoi le tableur lit du
 *   texte et n'additionne rien ;
 * - **BOM UTF-8** en tête — sans lui, Excel lit les accents en latin-1 et
 *   « Août » devient « AoÃ»t ».
 *
 * Les montants sortent en **euros**, pas en centimes : le fichier est lu par un
 * humain avant d'être importé, et personne ne relit une colonne de centimes.
 */

/** L'en-tête, dans l'ordre où la compta lit une ligne de vente. */
const HEADER = ['Date', 'Commande', 'Client', 'Régime', 'Règlement', 'HT', 'TVA', 'TTC'] as const;

/** Le préfixe qui dit à Excel que le fichier est en UTF-8. */
const BOM = '﻿';

/** `2026-08-03T09:00:00Z` → `03/08/2026` — la date telle qu'un tableur la lit. */
function frenchDay(iso: string): string {
  const date = new Date(iso);
  const day = `${date.getDate()}`.padStart(2, '0');
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  return `${day}/${month}/${date.getFullYear()}`;
}

/** `1250` → `12,50`. Deux décimales toujours : une colonne d'argent s'aligne. */
function euros(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',');
}

/**
 * Échappe une valeur. Le guillemet double et le séparateur imposent les
 * guillemets ; une valeur qui commence par `=`, `+`, `-` ou `@` est préfixée
 * d'une apostrophe — sans quoi le tableur l'interprète comme une **formule**,
 * ce qui est le vecteur d'injection classique d'un export CSV.
 */
function cell(value: string): string {
  const guarded = /^[=+\-@]/u.test(value) ? `'${value}` : value;
  return /[";\n]/u.test(guarded) ? `"${guarded.replace(/"/gu, '""')}"` : guarded;
}

/** Le régime d'une commande, dit comme l'écran le dit. */
function regimeOf(order: AdminOrderRow): string {
  return order.paymentStatus === 'not_required' ? 'Au compte' : 'À la commande';
}

/**
 * Le CSV d'un mois : ses commandes au compte **et** celles réglées à la
 * commande, dans une seule table avec une colonne « Régime ».
 *
 * Un seul fichier pour les deux régimes, et non deux : la comptabilité reporte
 * un mois, pas une colonne d'écran — et le régime est une propriété de la
 * ligne, pas du fichier.
 */
export function periodCsv(row: LedgerRow, paymentLabel: (order: AdminOrderRow) => string): string {
  const orders = [...(row.period?.orders ?? []), ...row.orders].sort((a, b) =>
    a.placedAt.localeCompare(b.placedAt),
  );
  const lines = orders.map((order) =>
    [
      frenchDay(order.placedAt),
      order.orderNumber,
      order.customerLabel,
      regimeOf(order),
      paymentLabel(order),
      euros(order.subtotalCents),
      euros(order.vatCents),
      euros(order.totalCents),
    ]
      .map(cell)
      .join(';'),
  );

  const total = orders.reduce(
    (sums, order) => ({
      subtotal: sums.subtotal + order.subtotalCents,
      vat: sums.vat + order.vatCents,
      total: sums.total + order.totalCents,
    }),
    { subtotal: 0, vat: 0, total: 0 },
  );
  // Une ligne de total, parce qu'un relevé qu'on reporte se vérifie d'abord par
  // son total — et qu'un tableur ne le calcule que si on le lui demande.
  const footer = [
    '',
    '',
    '',
    '',
    'Total',
    euros(total.subtotal),
    euros(total.vat),
    euros(total.total),
  ]
    .map(cell)
    .join(';');

  return `${BOM}${[HEADER.join(';'), ...lines, footer].join('\r\n')}\r\n`;
}

/** `LFC_C-VUNM9M_2026-08.csv` — triable, sans espace, sans accent. */
export function periodFileName(companyReference: string, monthKey: string): string {
  const reference = companyReference.replace(/[^A-Za-z0-9-]/gu, '') || 'compte';
  return `LFC_${reference}_${monthKey}.csv`;
}

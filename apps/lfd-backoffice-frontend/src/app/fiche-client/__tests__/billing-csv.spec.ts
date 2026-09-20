import type { AdminOrderRow, OrderStatus, PaymentStatus } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { periodCsv, periodFileName } from '../facturation/billing-csv';
import { splitForBilling, ledgerRows } from '../facturation/billing-periods';

const NOW = new Date('2026-08-15T10:00:00');

function order(
  placedAt: string,
  totalCents: number,
  paymentStatus: PaymentStatus,
  overrides: Partial<AdminOrderRow> = {},
): AdminOrderRow {
  return {
    id: `ord_${placedAt}_${totalCents}`,
    orderNumber: `C-${totalCents}`,
    placedAt,
    status: 'fulfilled' as OrderStatus,
    paymentStatus,
    fulfillmentMethod: 'pickup',
    subtotalCents: Math.round(totalCents / 1.055),
    vatCents: totalCents - Math.round(totalCents / 1.055),
    totalCents,
    customerLabel: 'Café des Halles',
    companyId: 'cmp_1',
    origin: 'self_service',
    ...overrides,
  };
}

/** Le CSV du mois courant, pour un jeu de commandes donné. */
function csvOf(orders: readonly AdminOrderRow[]): string {
  const [row] = ledgerRows(splitForBilling(orders, NOW));
  if (row === undefined) {
    throw new Error('Le registre devrait porter au moins un mois.');
  }
  return periodCsv(row, () => 'Réglée');
}

describe('l’export CSV d’une période', () => {
  it('réunit les deux régimes dans une seule table, avec sa colonne', () => {
    // La comptabilité reporte un mois, pas une colonne d'écran : le régime est
    // une propriété de la ligne, pas du fichier.
    const csv = csvOf([
      order('2026-08-03T09:00:00Z', 1000, 'not_required'),
      order('2026-08-04T09:00:00Z', 2000, 'paid'),
    ]);

    expect(csv).toContain('Au compte');
    expect(csv).toContain('À la commande');
  });

  it('sépare par « ; » et écrit les montants à la virgule', () => {
    // Excel en locale française ouvre un fichier « , » en une seule colonne, et
    // lit « 12.50 » comme du texte.
    const csv = csvOf([order('2026-08-03T09:00:00Z', 1250, 'paid')]);

    expect(csv).toContain(';12,50\r\n');
    expect(csv).not.toContain('12.50');
  });

  it('commence par un BOM UTF-8', () => {
    // Sans lui, « Août » devient « AoÃ»t » à l'ouverture.
    expect(csvOf([order('2026-08-03T09:00:00Z', 100, 'paid')]).startsWith('﻿')).toBe(true);
  });

  it('neutralise une valeur qui commencerait une formule', () => {
    // Le vecteur d'injection classique d'un CSV : un tableur exécute `=…`.
    const csv = csvOf([
      order('2026-08-03T09:00:00Z', 100, 'paid', { customerLabel: '=SOMME(A1:A9)' }),
    ]);

    expect(csv).toContain("'=SOMME(A1:A9)");
  });

  it('échappe le séparateur et les guillemets', () => {
    const csv = csvOf([
      order('2026-08-03T09:00:00Z', 100, 'paid', { customerLabel: 'Halles; "Le" café' }),
    ]);

    expect(csv).toContain('"Halles; ""Le"" café"');
  });

  it('termine par une ligne de total', () => {
    const csv = csvOf([
      order('2026-08-03T09:00:00Z', 1000, 'not_required'),
      order('2026-08-04T09:00:00Z', 2000, 'paid'),
    ]);

    expect(csv).toContain(';Total;');
    expect(csv.trimEnd().endsWith(';30,00')).toBe(true);
  });

  it('nomme le fichier de façon triable et sans accent', () => {
    expect(periodFileName('C-VUNM9M', '2026-08')).toBe('LFC_C-VUNM9M_2026-08.csv');
    expect(periodFileName('', '2026-08')).toBe('LFC_compte_2026-08.csv');
  });
});

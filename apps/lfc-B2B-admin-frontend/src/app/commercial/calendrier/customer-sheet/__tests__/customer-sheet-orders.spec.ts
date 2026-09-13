import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { CustomerOrderLine, CustomerSheetView } from '@lfd/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import { NotifyService } from '../../../../notify.service';
import { CustomerSheet } from '../customer-sheet';
import { CustomerSheetService } from '../customer-sheet.service';

/**
 * La carte **Dernières commandes** — ce qu'elle écrit, et où elle mène.
 *
 * 🔴 Les trois cas de ce fichier existent pour des défauts constatés à l'écran
 * le 2026-09-13 : l'avancement sortait en anglais technique, le montant était
 * arrondi à l'euro, et la carte n'avait aucune sortie. Aucun ne se voyait en
 * relisant le composant — le gabarit interpolait un champ, et il disait vrai.
 */

const ORDER: CustomerOrderLine = {
  id: 'or_1',
  orderNumber: 'C-2609-0042',
  placedAt: '2026-09-10T07:30:00.000Z',
  status: 'in_production',
  totalCents: 15_163,
};

function sheetWith(orders: readonly CustomerOrderLine[]): CustomerSheetView {
  return {
    companyId: 'co_1',
    reference: 'C-6KTQAT',
    raisonSociale: 'SAS Les Tommeuses',
    enseigne: "La Folie Douce Val d'Isère",
    nafCode: '',
    status: 'active',
    createdAt: '2026-08-01T09:00:00.000Z',
    activatedAt: '2026-08-02T09:00:00.000Z',
    contactName: 'Hugo',
    contactEmail: '',
    contactPhone: '',
    stats: {
      totalSpentCents: 182_500,
      ordersCount: 9,
      recurringBasketsCount: 0,
      averageTicketCents: 20_300,
      trend: { last30Cents: 141_000, previous30Cents: 100_000, percent: 41, direction: 'up' },
    },
    recentOrders: orders,
    timeline: [],
  };
}

function render(orders: readonly CustomerOrderLine[]): HTMLElement {
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideRouter([]),
      { provide: CustomerSheetService, useValue: {} },
      { provide: NotifyService, useValue: {} },
    ],
  });
  const fixture = TestBed.createComponent(CustomerSheet);
  fixture.componentRef.setInput('sheet', sheetWith(orders));
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('la carte des dernières commandes', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('écrit l’avancement en FRANÇAIS — jamais la valeur d’enum', () => {
    // Régression : la carte interpolait `order.status` tel quel, et un commercial
    // au téléphone lisait « in_production » là où le client lit « En production ».
    const text = render([ORDER]).textContent ?? '';

    expect(text).toContain('En production');
    expect(text).not.toContain('in_production');
  });

  it('garde les CENTIMES du total — c’est un montant facturé', () => {
    // Régression : le total passait par le `euros()` de la fiche, qui arrondit à
    // l'euro pour les cumuls de l'en-tête. Sur une ligne de commande, l'arrondi
    // affichait 152 € pour une commande de 151,63 €.
    const text = render([ORDER]).textContent ?? '';

    expect(text).toContain('151,63');
  });

  it('mène à la commande, et à la liste complète', () => {
    // Régression : ni les lignes ni la carte n'avaient de sortie — la liste
    // plafonnée passait pour tout ce que le compte avait commandé.
    const hrefs = [...render([ORDER]).querySelectorAll('a')].map((a) => a.getAttribute('href'));

    // Dans l'espace du compte, et non sur la route de premier niveau : celle-ci
    // vit hors de la coquille, donc l'ouvrir fait perdre le bandeau et les
    // onglets à qui parcourt un dossier.
    expect(hrefs).toContain('/comptes-clients/co_1/commandes/or_1');
    expect(hrefs).toContain('/comptes-clients/co_1/commandes');
  });
});

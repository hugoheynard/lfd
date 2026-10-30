import { Component, input } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type {
  CompanyPricingView,
  MercurialeDraftView,
  PosedMercurialeView,
  StaffPermission,
} from '@lfd/contracts';
import { FoldButtonComponent, FoldEmptyStateComponent, FoldLoadingStateComponent } from 'fold-ng';
import { beforeEach, describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../../auth/permissions.store';
import { CompanyPricingService } from '../company-pricing.service';
import { MercurialeComposer } from '../mercuriale-composer/mercuriale-composer';
import { PosedMercuriale } from '../posed-mercuriale/posed-mercuriale';
import { ClientTarifsPage } from '../tarifs-page';

/**
 * **Les gestes d'écriture de l'onglet Tarifs suivent `b2b_pricing:write`.**
 *
 * Régression : un lecteur seul (`b2b_pricing:read`) voyait « Poser »,
 * « Préparer », « Renommer », « Clore » et les avenants — tous refusés en 403
 * par le serveur (corrigé le 2026-10-30).
 */

@Component({ selector: 'app-pricing-follow', template: '' })
class StubFollow {
  readonly companyId = input<string>();
}

@Component({ selector: 'app-tariff-journal-card', template: '' })
class StubJournal {
  readonly companyId = input<string>();
}

const READ: readonly StaffPermission[] = ['b2b_pricing:read'];
const WRITE: readonly StaffPermission[] = ['b2b_pricing:read', 'b2b_pricing:write'];

const MERCURIALE: PosedMercurialeView = {
  id: 'merc_1',
  label: 'Mercuriale 2027',
  validFrom: '2026-01-01T00:00:00.000Z',
  validTo: null,
  status: 'active',
  ruleCount: 1,
  skuCount: 1,
  createdBy: 'staff_1',
  createdByName: null,
  lines: [
    { sku: 'VIE-001-1', productName: 'Croissant', unitPriceMillicents: 90_000, minQuantity: 1 },
  ],
  amendments: [],
};

function view(mercuriales: readonly PosedMercurialeView[]): CompanyPricingView {
  return {
    companyId: 'co_1',
    at: '2026-01-01T00:00:00.000Z',
    categories: [],
    mercuriales,
    negotiatedSkuCount: 0,
    averageGapBp: null,
  };
}

const DRAFT: MercurialeDraftView = {
  label: 'Brouillon',
  validFrom: null,
  validTo: null,
  lines: [],
  updatedBy: 'staff_1',
  updatedByName: null,
  updatedAt: '2026-01-01T00:00:00.000Z',
};

async function render(
  granted: readonly StaffPermission[],
  mercuriales: readonly PosedMercurialeView[],
  draft: MercurialeDraftView | null = null,
): Promise<HTMLElement> {
  TestBed.configureTestingModule({
    providers: [
      {
        provide: CompanyPricingService,
        useValue: {
          read: () => Promise.resolve(view(mercuriales)),
          draft: () => Promise.resolve(draft),
        },
      },
      { provide: PermissionsStore, useValue: { can: (p: StaffPermission) => granted.includes(p) } },
    ],
  });
  TestBed.overrideComponent(ClientTarifsPage, {
    set: {
      imports: [
        FoldButtonComponent,
        FoldEmptyStateComponent,
        FoldLoadingStateComponent,
        MercurialeComposer,
        PosedMercuriale,
        StubFollow,
        StubJournal,
      ],
    },
  });
  const fixture = TestBed.createComponent(ClientTarifsPage);
  fixture.componentRef.setInput('id', 'co_1');
  fixture.detectChanges();
  // La lecture part d'un `effect` : on laisse ses deux promesses se résoudre.
  await new Promise<void>((resolve) => setTimeout(resolve));
  fixture.detectChanges();
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

describe('<app-client-tarifs-page> — droit d’écriture', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('lecteur seul, compte sans mercuriale : aucun « Poser une mercuriale »', async () => {
    const host = await render(READ, []);
    expect(host.textContent).toContain('Aucune mercuriale');
    expect(host.querySelector('[data-compose]')).toBeNull();
  });

  it('lecteur seul, mercuriale posée : la lecture, sans aucun geste', async () => {
    const host = await render(READ, [MERCURIALE]);
    expect(host.textContent).toContain('Mercuriale 2027');
    expect(host.querySelector('[data-compose]')).toBeNull();
    expect(host.querySelector('[data-rename]')).toBeNull();
    expect(host.querySelector('[data-close]')).toBeNull();
    expect(host.querySelector('[data-amend-price]')).toBeNull();
  });

  it('lecteur seul : un brouillon enregistré n’ouvre pas la composition', async () => {
    const host = await render(READ, [MERCURIALE], DRAFT);
    expect(host.querySelector('app-mercuriale-composer')).toBeNull();
    expect(host.textContent).toContain('Mercuriale 2027');
  });

  it('avec le droit, compte vide : « Poser une mercuriale » est offert', async () => {
    const host = await render(WRITE, []);
    expect(host.querySelector('[data-compose]')).not.toBeNull();
  });

  it('avec le droit, mercuriale posée : préparer, renommer, clore et amender', async () => {
    const host = await render(WRITE, [MERCURIALE]);
    expect(host.querySelector('[data-compose]')).not.toBeNull();
    expect(host.querySelector('[data-rename]')).not.toBeNull();
    expect(host.querySelector('[data-close]')).not.toBeNull();
    expect(host.querySelector('[data-amend-price]')).not.toBeNull();
  });

  it('avec le droit : un brouillon enregistré rouvre la composition', async () => {
    const host = await render(WRITE, [MERCURIALE], DRAFT);
    expect(host.querySelector('app-mercuriale-composer')).not.toBeNull();
  });
});

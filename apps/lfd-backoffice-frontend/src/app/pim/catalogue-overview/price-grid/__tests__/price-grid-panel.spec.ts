import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type {
  PriceGridExportPayload,
  PriceGridPromotionsView,
  PriceGridQuestion,
} from '@lfd/contracts';
import { FoldPanelRef } from 'fold-ng';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DeliveryZonesService } from '../../../../b2b/reglages/delivery-zones.service';
import { PickupAddressesService } from '../../../../b2b/reglages/pickup-addresses.service';
import { AdminCompaniesService } from '../../../../comptes-clients/admin-companies.service';
import { PriceGridHttpApi, type PriceGridFile } from '../price-grid-http-api';
import { PriceGridPanel } from '../price-grid-panel/price-grid-panel';

/**
 * Le panneau d'export (`plan-export-grille-de-prix.md`, § 2) : la liste des
 * promotions suit le public et l'acheminement, les choix partent tels quels,
 * et le fichier se télécharge sous le nom que le serveur lui donne.
 */

const RETRAIT = {
  id: 'retrait',
  label: 'Retrait −20 %',
  effect: { kind: 'percent_off', value: 2000 },
  cumulative: false,
} as const;

class FakeApi {
  readonly asked: PriceGridQuestion[] = [];
  readonly exported: PriceGridExportPayload[] = [];

  promotions(question: PriceGridQuestion): Promise<PriceGridPromotionsView> {
    this.asked.push(question);
    const basket = question.audience.kind === 'individuals_guest' ? [] : [RETRAIT];
    return Promise.resolve({ basis: 'ttc', displayedPrice: [], basket });
  }

  export(payload: PriceGridExportPayload): Promise<PriceGridFile> {
    this.exported.push(payload);
    return Promise.resolve({
      blob: new Blob(['﻿']),
      fileName: 'grille-particuliers-inscrits-2030-01-15.csv',
    });
  }
}

async function render(api: FakeApi): Promise<ComponentFixture<PriceGridPanel>> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [PriceGridPanel],
    providers: [
      { provide: PriceGridHttpApi, useValue: api },
      { provide: AdminCompaniesService, useValue: { list: () => Promise.resolve([]) } },
      {
        provide: PickupAddressesService,
        useValue: { list: () => Promise.resolve([{ id: 'pt_1', label: 'Cœur de station' }]) },
      },
      { provide: DeliveryZonesService, useValue: { list: () => Promise.resolve([]) } },
      { provide: FoldPanelRef, useValue: new FoldPanelRef(1, () => undefined) },
    ],
  });
  const fixture = TestBed.createComponent(PriceGridPanel);
  await settle(fixture);
  return fixture;
}

async function settle(fixture: ComponentFixture<PriceGridPanel>): Promise<void> {
  for (let round = 0; round < 3; round += 1) {
    fixture.detectChanges();
    await fixture.whenStable();
  }
  fixture.detectChanges();
}

function host(fixture: ComponentFixture<PriceGridPanel>): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

describe('PriceGridPanel', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lit les promotions du public par défaut, au seul point de retrait', async () => {
    const api = new FakeApi();
    const fixture = await render(api);

    expect(api.asked.at(-1)).toEqual({
      audience: { kind: 'individuals_registered' },
      day: null,
      fulfillment: { method: 'pickup', pickupId: 'pt_1' },
    });
    expect(host(fixture).querySelectorAll('[data-basket-promotion]')).toHaveLength(1);
  });

  it('relit la liste quand le public change', async () => {
    const api = new FakeApi();
    const fixture = await render(api);

    fixture.componentInstance.chooseAudience('individuals_guest');
    await settle(fixture);

    expect(api.asked.at(-1)?.audience).toEqual({ kind: 'individuals_guest' });
    expect(host(fixture).querySelector('[data-no-basket]')).not.toBeNull();
  });

  it('une société sans choix : aucune lecture, export fermé', async () => {
    const api = new FakeApi();
    const fixture = await render(api);
    const before = api.asked.length;

    fixture.componentInstance.chooseAudience('company');
    await settle(fixture);

    expect(api.asked).toHaveLength(before);
    const button = host(fixture).querySelector<HTMLButtonElement>('[data-export]');
    expect(button?.disabled ?? button?.getAttribute('aria-disabled') === 'true').toBe(true);
  });

  it('exporte les choix et télécharge le fichier sous son nom', async () => {
    const api = new FakeApi();
    const created = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:grille');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const clicked = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    const fixture = await render(api);

    host(fixture).querySelector<HTMLButtonElement>('[data-export]')?.click();
    await settle(fixture);

    expect(api.exported).toEqual([
      {
        audience: { kind: 'individuals_registered' },
        day: null,
        fulfillment: { method: 'pickup', pickupId: 'pt_1' },
        basketPromotions: [{ promotionId: 'retrait', part: 'column' }],
        pricePerKg: false,
      },
    ]);
    expect(created).toHaveBeenCalled();
    expect(clicked).toHaveBeenCalled();
  });
});

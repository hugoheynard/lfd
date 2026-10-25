import { TestBed } from '@angular/core/testing';
import type { AudiencePickupDiscount, PickupAddressUpdatePayload, SiteView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { NotifyService } from '../../../../notify.service';
import { discountCatalogueOf } from '../../pickup-discount-rules';
import { SitesService } from '../../sites.service';
import { entry, publishedCatalog, shelf } from '../../__tests__/published-catalog-fixture';
import { AudienceDiscountCard } from './audience-discount-card';

const TEN_PERCENT: AudiencePickupDiscount = {
  adjustment: { mode: 'percent', bp: 1000 },
  scope: 'all_except',
  categories: [{ categoryId: 'boissons', eligible: false }],
  products: [],
};

const SITE: SiteView = {
  id: 'site_1',
  label: 'Labo',
  ligne1: '3 rue du Four',
  ligne2: '',
  codePostal: '75011',
  ville: 'Paris',
  pays: 'France',
  discounts: { b2b: TEN_PERCENT, b2c: null },
  opening: { publicOpening: null, proPickup: null },
  gps: null,
  pickup: true,
  supply: 'on_site',
  deliveryDeparture: false,
  transferMode: 'integrated',
  counterSetupMinutes: 0,
  eatIn: false,
  pickupColorB2b: null,
  pickupColorB2c: null,
  deliveryColorB2b: null,
  deliveryColorB2c: null,
  resupplyColor: null,
  transferColor: null,
  archivedAt: null,
  isDeparture: false,
};

const CATALOGUE = discountCatalogueOf(
  publishedCatalog(
    [shelf('boissons', 'Boissons'), shelf('pains', 'Pains')],
    [entry('jus', 'Jus d’orange', 'boissons'), entry('baguette', 'Baguette', 'pains')],
  ),
);

class FakeSites {
  readonly updated: PickupAddressUpdatePayload[] = [];
  refusal: unknown = null;

  update(_id: string, payload: PickupAddressUpdatePayload): Promise<void> {
    this.updated.push(payload);
    return this.refusal === null ? Promise.resolve() : Promise.reject(this.refusal);
  }
}

async function mount(site: SiteView = SITE, audience: 'b2b' | 'b2c' = 'b2b') {
  const sites = new FakeSites();
  TestBed.configureTestingModule({
    imports: [AudienceDiscountCard],
    providers: [
      { provide: SitesService, useValue: sites },
      { provide: NotifyService, useValue: { success: () => undefined } },
    ],
  });
  const fixture = TestBed.createComponent(AudienceDiscountCard);
  fixture.componentRef.setInput('site', site);
  fixture.componentRef.setInput('audience', audience);
  fixture.componentRef.setInput('catalogue', CATALOGUE);
  fixture.detectChanges();
  await fixture.whenStable();
  return { fixture, card: fixture.componentInstance, sites };
}

describe('AudienceDiscountCard', () => {
  it('lit les familles exclues dans le mode « tout, sauf… »', async () => {
    const { card } = await mount();

    expect(card['families']()).toEqual(['boissons']);
    expect(card['wording']().families).toBe('Familles exclues');
  });

  it('réinclut un produit dans sa famille exclue, et n’envoie que SA clientèle', async () => {
    const { card, sites } = await mount();
    card['setProducts'](['jus'], true);

    await card['save']();

    expect(sites.updated[0]?.discounts).toEqual({
      b2b: { ...TEN_PERCENT, products: [{ productId: 'jus', eligible: true }] },
      b2c: null,
    });
  });

  it('un produit choisi dans une liste n’est plus proposé dans l’autre', async () => {
    const { card } = await mount();
    card['setProducts'](['jus'], false);
    card['setProducts'](['jus'], true);

    expect(card['products']()).toEqual([]);
    expect(card['contradicting']()).toEqual(['jus']);
  });

  it('changer de mode vide les règles', async () => {
    const { card } = await mount();
    card['setScope']('only');

    expect(card['draft']()).toMatchObject({ scope: 'only', categories: [], products: [] });
    expect(card['wording']().families).toBe('Familles incluses');
  });

  it('🔴 dit en alerte une règle qui ne vise plus rien, et la retire', async () => {
    const orphan = {
      ...SITE,
      discounts: {
        b2b: { ...TEN_PERCENT, products: [{ productId: 'disparu', eligible: false }] },
        b2c: null,
      },
    };
    const { fixture, card } = await mount(orphan);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain("n'est plus au catalogue");
    card['remove'](card['stray']()[0]!);

    expect(card['draft']().products).toEqual([]);
    expect(card['dirty']()).toBe(true);
  });

  it('crée la remise d’une clientèle qui n’en avait pas', async () => {
    const { card, sites } = await mount(SITE, 'b2c');
    card['setDiscount']({ mode: 'amount', cents: 200, direction: 'decrease' });

    await card['save']();

    expect(sites.updated[0]?.discounts?.b2c).toEqual({
      adjustment: { mode: 'amount', cents: 200 },
      scope: 'all_except',
      categories: [],
      products: [],
    });
    expect(sites.updated[0]?.discounts?.b2b).toEqual(TEN_PERCENT);
  });

  it('montre le refus du serveur par son message', async () => {
    const { fixture, card, sites } = await mount();
    sites.refusal = {
      status: 400,
      error: { code: 'validation', message: 'La remise des pros « seulement » n’inclut rien.' },
    };
    card['setScope']('only');

    await card['save']();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('n’inclut rien');
  });

  it('n’offre pas Enregistrer tant que rien n’a changé', async () => {
    const { card } = await mount();

    expect(card['canSave']()).toBe(false);
  });
});

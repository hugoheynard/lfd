import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { type CatalogueInspection, ShopifyChannelApi } from '../../channels/shopify-channel-api';
import { ShopifyCatalogue } from './shopify-catalogue';

/** Fake du canal — pas de HTTP, une inspection explicite. */
class FakeChannelApi {
  constructor(private readonly result: CatalogueInspection) {}

  inspectCatalogue(): Promise<CatalogueInspection> {
    return Promise.resolve(this.result);
  }
}

async function render(result: CatalogueInspection): Promise<ComponentFixture<ShopifyCatalogue>> {
  TestBed.configureTestingModule({
    providers: [{ provide: ShopifyChannelApi, useValue: new FakeChannelApi(result) }],
  });
  const fixture = TestBed.createComponent(ShopifyCatalogue);
  fixture.detectChanges();
  return fixture;
}

function charger(fixture: ComponentFixture<ShopifyCatalogue>): HTMLButtonElement {
  return (fixture.nativeElement as HTMLElement).querySelector(
    '.card-footer button',
  ) as HTMLButtonElement;
}

describe('ShopifyCatalogue', () => {
  it('affiche les produits de la boutique une fois chargés (live)', async () => {
    const fixture = await render({
      mode: 'live',
      products: [
        {
          id: 'gid://shopify/Product/1',
          handle: 'croissant',
          title: 'Croissant',
          status: 'ACTIVE',
          variants: [{ sku: 'PATI-CROISSANT', title: 'Default', price: '1.30' }],
        },
      ],
    });

    charger(fixture).click();
    await fixture.whenStable();
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Croissant');
    expect(text).toContain('croissant');
    expect(text).toContain('Actif');
    expect(text).toContain('1 produit(s)');
  });

  it('invite à connecter la boutique en simulation (dry-run)', async () => {
    const fixture = await render({ mode: 'dry-run', products: [] });

    charger(fixture).click();
    await fixture.whenStable();
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('simulation');
  });
});

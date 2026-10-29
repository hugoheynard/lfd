import { provideHttpClient } from '@angular/common/http';
import { signal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';

import { FR } from '../../copy/fr';
import { formatCents } from '../../format-money';
import { PieceRequest } from '../../shop/piece-request.service';
import { hydrateWith, TEST_CATALOGUE } from '../../shop/shop-catalogue.fixture';
import { ShopCatalogue } from '../../shop/shop-catalogue.store';
import { ShopPriceBasis } from '../../shop/shop-price-basis.service';
import { HomeFeatured } from './home-featured';

describe('HomeFeatured — les incontournables de l’accueil', () => {
  let fixture: ComponentFixture<HomeFeatured>;
  let asked: string[];
  const showsTtc = signal(true);

  async function mount(
    featured: boolean,
    perKg: { readonly pro: number | null; readonly ttc: number | null } = { pro: null, ttc: null },
  ): Promise<HTMLElement> {
    asked = [];
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        { provide: ShopPriceBasis, useValue: { showsTtc } },
        { provide: PieceRequest, useValue: { open: (sku: string) => asked.push(sku) } },
      ],
    });
    hydrateWith(TestBed.inject(ShopCatalogue), {
      ...TEST_CATALOGUE,
      items: TEST_CATALOGUE.items.map((item) => ({
        ...(featured ? item : { ...item, isFeatured: false }),
        proPricePerKgMillicents: perKg.pro,
        publicPricePerKgTtcCents: perKg.ttc,
      })),
    });
    fixture = TestBed.createComponent(HomeFeatured);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  beforeEach(() => showsTtc.set(true));

  it('un visiteur voit la section, une carte par mis en avant, au prix TTC', async () => {
    const host = await mount(true);
    expect(host.querySelector('[data-test="home-featured"] h2')?.textContent?.trim()).toBe(
      'Nos incontournables',
    );
    const cards = host.querySelectorAll('[data-test="pro-featured-card"]');
    expect(cards).toHaveLength(1);
    expect(cards[0]?.querySelector('.name')?.textContent?.trim()).toBe('Éclair');
    expect(host.querySelector('[data-test="featured-price"]')?.textContent?.trim()).toBe(
      `${formatCents(369)} ${FR.shop.ttcSuffix}`,
    );
  });

  it('un pro connecté lit le hors taxe', async () => {
    showsTtc.set(false);
    const host = await mount(true);
    expect(host.querySelector('[data-test="featured-price"]')?.textContent?.trim()).toBe(
      `${formatCents(350)} ${FR.shop.htSuffix}`,
    );
  });

  it('écrit finement le prix au kilo d’une pièce, dans l’assiette du lecteur', async () => {
    const host = await mount(true, { pro: 1_500_000, ttc: 1_590 });
    expect(host.querySelector('[data-test="featured-per-kilo"]')?.textContent?.trim()).toBe(
      `${formatCents(1_590)} / kg ${FR.shop.ttcSuffix}`,
    );
  });

  it('le prix au kilo d’un pro est le hors taxe', async () => {
    showsTtc.set(false);
    const host = await mount(true, { pro: 1_500_000, ttc: 1_590 });
    expect(host.querySelector('[data-test="featured-per-kilo"]')?.textContent?.trim()).toBe(
      `${formatCents(1_500)} / kg ${FR.shop.htSuffix}`,
    );
  });

  it('sans prix au kilo saisi, la carte ne dit rien de plus', async () => {
    const host = await mount(true);
    expect(host.querySelector('[data-test="featured-per-kilo"]')).toBeNull();
  });

  it('le clic ouvre la fiche de l’article', async () => {
    const host = await mount(true);
    host.querySelector<HTMLElement>('[role="button"]')?.click();
    expect(asked).toEqual(['PAT-001']);
  });

  it('aucun article mis en avant : aucune section', async () => {
    const host = await mount(false);
    expect(host.querySelector('[data-test="home-featured"]')).toBeNull();
  });
});

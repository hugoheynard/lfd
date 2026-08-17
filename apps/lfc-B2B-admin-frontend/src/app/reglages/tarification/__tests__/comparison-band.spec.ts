import type { ComponentFixture } from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import type { PricingComparisonItemView, PricingComparisonView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { ComparisonBand } from '../comparison-band/comparison-band';
import { TarificationService } from '../tarification.service';

/**
 * **Deux marqueurs.**
 *
 * Ce que cette bande doit dire sans se tromper : les articles QUI ONT BOUGÉ, du
 * plus gros écart au plus petit, et le volume en face. Le reste du catalogue est
 * écarté — quatre-vingt-douze lignes dont trois portent une information noieraient
 * exactement ce qu'on est venu chercher.
 */

function item(over: Partial<PricingComparisonItemView> = {}): PricingComparisonItemView {
  return {
    sku: 'VIE-001',
    name: 'Croissant',
    categoryId: 'viennoiserie',
    categoryName: 'Viennoiseries',
    fromCents: 200,
    toCents: 170,
    fromTiers: null,
    toTiers: null,
    priceVariationBp: -1_500,
    volume: 120,
    previousVolume: 100,
    volumeVariationBp: 2_000,
    ...over,
  };
}

function comparison(items: PricingComparisonItemView[]): PricingComparisonView {
  return {
    from: '2026-07-20T00:00:00.000Z',
    to: '2026-08-19T00:00:00.000Z',
    previousFrom: '2026-06-20T00:00:00.000Z',
    days: 30,
    changedCount: items.filter((entry) => entry.fromCents !== entry.toCents).length,
    items,
  };
}

function mount(result: PricingComparisonView): ComponentFixture<ComparisonBand> {
  const service: Pick<TarificationService, 'compare'> = {
    compare: () => Promise.resolve(result),
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [{ provide: TarificationService, useValue: service }],
  });
  const fixture = TestBed.createComponent(ComparisonBand);
  fixture.detectChanges();
  return fixture;
}

async function run(fixture: ComponentFixture<ComparisonBand>): Promise<string> {
  await fixture.componentInstance['run']();
  fixture.detectChanges();
  return String(fixture.nativeElement.textContent ?? '');
}

describe('la comparaison de deux dates', () => {
  it('annonce le prix des deux côtés, et l’écart', async () => {
    const text = await run(mount(comparison([item()])));

    expect(text).toContain('Croissant');
    expect(text).toContain('−15,0 %');
  });

  /** Prix ET volume : une baisse sans effet et une baisse qui double les ventes
   *  sont deux décisions opposées, et le même chiffre de prix. */
  it('met le volume en face du prix', async () => {
    const text = await run(mount(comparison([item()])));

    expect(text).toContain('120');
    expect(text).toContain('+20,0 %');
  });

  it('écarte les articles dont le prix n’a pas bougé', async () => {
    const stable = item({ sku: 'VIE-002', name: 'Pain au chocolat', fromCents: 200, toCents: 200 });

    const text = await run(mount(comparison([item(), stable])));

    expect(text).not.toContain('Pain au chocolat');
  });

  it('classe du plus gros écart au plus petit', async () => {
    const fixture = mount(
      comparison([
        item({ sku: 'A', name: 'Petit écart', priceVariationBp: -500 }),
        item({ sku: 'B', name: 'Gros écart', priceVariationBp: -4_000 }),
      ]),
    );

    await run(fixture);

    const names = [...fixture.nativeElement.querySelectorAll('.item-name')].map((cell) =>
      String((cell as HTMLElement).textContent),
    );
    expect(names).toEqual(['Gros écart', 'Petit écart']);
  });

  /** Une variation depuis zéro n'existe pas : on n'invente pas un « 0 % ». */
  it('affiche un tiret quand la variation ne se calcule pas', async () => {
    const text = await run(
      mount(comparison([item({ previousVolume: 0, volumeVariationBp: null })])),
    );

    expect(text).toContain('—');
  });

  /** Deux marqueurs dans le désordre : rien ne part, et le bouton reste fermé. */
  it('refuse de lire quand le second marqueur précède le premier', async () => {
    const fixture = mount(comparison([item()]));
    fixture.componentInstance['from'].set('2026-08-20');
    fixture.componentInstance['to'].set('2026-08-10');

    expect(fixture.componentInstance['canRun']()).toBe(false);
  });
});

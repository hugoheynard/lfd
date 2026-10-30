import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { PromotionListView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { promotionView } from '../../../../targeted-promotions/promotion.testing';
import { PromotionsService } from '../../../../targeted-promotions/promotions.service';
import { SitePromotionsCard } from './site-promotions-card';

async function render(list: (pickupId: string | null) => Promise<PromotionListView>) {
  TestBed.configureTestingModule({
    imports: [SitePromotionsCard],
    providers: [provideRouter([]), { provide: PromotionsService, useValue: { list } }],
  });
  const fixture = TestBed.createComponent(SitePromotionsCard);
  fixture.componentRef.setInput('pickupId', 'pk_coeur');
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('SitePromotionsCard', () => {
  it('liste les promotions de ce point, hors archivées, et mène à la liste pré-filtrée', async () => {
    const asked: (string | null)[] = [];
    const root = await render(async (pickupId) => {
      asked.push(pickupId);
      return {
        source: 'legacy',
        editable: false,
        promotions: [
          promotionView({ internalName: 'Remise de retrait — Cœur' }),
          promotionView({ id: 'old', internalName: 'Ancienne', state: 'archived' }),
        ],
      };
    });
    expect(asked).toEqual(['pk_coeur']);
    expect(root.textContent).toContain('Remise de retrait — Cœur');
    expect(root.textContent).not.toContain('Ancienne');
    expect(root.textContent).toContain("s'appliqueront à la bascule");
    const manage = [...root.querySelectorAll('a')].find((link) =>
      link.textContent?.includes('Gérer dans Promotions'),
    );
    expect(manage?.getAttribute('href')).toBe('/promotions-ciblees?pickupId=pk_coeur');
  });

  it('sans le droit de lire, le dit sans rien casser', async () => {
    const root = await render(async () => {
      throw new Error('403');
    });
    expect(root.textContent).toContain('ne se lisent pas d');
  });

  it('après la bascule, ouvre l’éditeur pré-rempli pour ce site', async () => {
    const root = await render(async () => ({
      source: 'promotions',
      editable: true,
      promotions: [],
    }));
    const create = [...root.querySelectorAll('a')].find((link) =>
      link.textContent?.includes('Nouvelle promotion pour ce site'),
    );
    expect(create?.getAttribute('href')).toBe('/promotions-ciblees/nouvelle?pickupId=pk_coeur');
    expect(root.textContent).not.toContain("s'appliqueront à la bascule");
  });
});

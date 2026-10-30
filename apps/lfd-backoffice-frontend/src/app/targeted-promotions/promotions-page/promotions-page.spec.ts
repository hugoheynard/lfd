import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { PromotionListView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { promotionView } from '../promotion.testing';
import { PromotionsService } from '../promotions.service';
import { PromotionsPage } from './promotions-page';

async function render(list: () => Promise<PromotionListView>, pickupId?: string) {
  const asked: (string | null)[] = [];
  TestBed.configureTestingModule({
    imports: [PromotionsPage],
    providers: [
      provideRouter([]),
      {
        provide: PromotionsService,
        useValue: {
          list: (id: string | null) => {
            asked.push(id);
            return list();
          },
          pickupNames: async () => new Map([['pk_coeur', 'Cœur de station']]),
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(PromotionsPage);
  if (pickupId !== undefined) {
    fixture.componentRef.setInput('pickupId', pickupId);
  }
  await fixture.whenStable();
  fixture.detectChanges();
  return { root: fixture.nativeElement as HTMLElement, asked };
}

const LEGACY: PromotionListView = {
  source: 'legacy',
  editable: false,
  promotions: [
    promotionView(),
    promotionView({ id: 'p2', internalName: 'Noël', state: 'scheduled' }),
    promotionView({ id: 'p3', internalName: 'Ancienne', state: 'archived' }),
  ],
};

describe('PromotionsPage', () => {
  it('dit la lecture seule avant la bascule', async () => {
    const { root } = await render(async () => LEGACY);
    expect(root.textContent).toContain("Les promotions s'appliqueront à la bascule");
  });

  it('range par état : les actives d’abord, compte chaque onglet', async () => {
    const { root } = await render(async () => LEGACY);
    expect(root.textContent).toContain('Croissants d’automne');
    expect(root.textContent).not.toContain('Noël');
    expect(root.textContent).toContain('Programmées');
    expect(root.textContent).toContain('−20 % · Tout le monde · Tous les acheminements');
  });

  it('se restreint au point demandé et le nomme', async () => {
    const { root, asked } = await render(
      async () => ({ ...LEGACY, editable: true, promotions: [] }),
      'pk_coeur',
    );
    expect(asked).toEqual(['pk_coeur']);
    expect(root.textContent).toContain('Seulement les promotions du retrait à Cœur de station');
    expect(root.textContent).not.toContain("s'appliqueront à la bascule");
  });

  it('une panne se dit en alerte, avec Réessayer', async () => {
    const { root } = await render(async () => {
      throw new Error('réseau');
    });
    expect(root.textContent).toContain('Impossible de charger les promotions');
  });
});

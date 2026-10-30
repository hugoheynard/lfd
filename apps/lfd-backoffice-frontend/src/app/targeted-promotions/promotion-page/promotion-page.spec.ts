import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { PromotionView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { promotionView } from '../promotion.testing';
import { PromotionsService } from '../promotions.service';
import { PromotionPage } from './promotion-page';

async function render(get: () => Promise<PromotionView>) {
  TestBed.configureTestingModule({
    imports: [PromotionPage],
    providers: [
      provideRouter([]),
      {
        provide: PromotionsService,
        useValue: { get, pickupNames: async () => new Map([['pk_coeur', 'Cœur de station']]) },
      },
    ],
  });
  const fixture = TestBed.createComponent(PromotionPage);
  fixture.componentRef.setInput('id', 'promo_1');
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('PromotionPage', () => {
  it('montre le public retenu dans son arbre, et l’acheminement nommé', async () => {
    const root = await render(async () =>
      promotionView({
        applicationPoint: 'basket',
        audience: { kind: 'individuals_registered', companyId: null },
        fulfillment: { kind: 'pickup_point', pickupId: 'pk_coeur' },
      }),
    );
    const chosen = [...root.querySelectorAll('.tree-node.is-chosen')].map((node) =>
      node.textContent?.trim(),
    );
    expect(chosen).toEqual(['Inscrits', 'Retrait · Cœur de station']);
    expect(root.textContent).toContain('Particuliers');
    expect(root.textContent).toContain('Sur le panier');
  });

  it('nomme les exceptions de portée, et l’identifiant quand le catalogue ne la connaît plus', async () => {
    const root = await render(async () =>
      promotionView({
        scope: {
          mode: 'all_except',
          rules: [
            { target: 'category', targetId: 'c_pains', eligible: false, name: 'Pains' },
            { target: 'variant', targetId: 'RETIRE-1', eligible: true, name: null },
          ],
        },
      }),
    );
    expect(root.textContent).toContain('Tout le catalogue, sauf les exceptions.');
    expect(root.textContent).toContain('Famille · Pains');
    expect(root.textContent).toContain('Déclinaison · RETIRE-1');
  });

  it('dit une archivée et son motif', async () => {
    const root = await render(async () =>
      promotionView({
        state: 'archived',
        archived: { at: '2026-11-02T10:00:00.000Z', by: 'staff', reason: 'fin de saison' },
      }),
    );
    expect(root.textContent).toContain('« fin de saison »');
  });

  it('une panne se dit en alerte', async () => {
    const root = await render(async () => {
      throw new Error('réseau');
    });
    expect(root.textContent).toContain('Promotion illisible');
  });
});

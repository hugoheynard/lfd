import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { PublishedCatalogView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { CatalogueService } from '../../b2b/catalogue/catalogue.service';
import { promotionView } from '../promotion.testing';
import { PromotionsService } from '../promotions.service';
import { PromotionEditorPage } from './promotion-editor-page';

const CATALOGUE: PublishedCatalogView = { shelves: [], entries: [], pendingReview: [] };

async function render(inputs: { id?: string; pickupId?: string }, editable = true) {
  TestBed.configureTestingModule({
    imports: [PromotionEditorPage],
    providers: [
      provideRouter([]),
      {
        provide: PromotionsService,
        useValue: {
          source: async () => ({ source: editable ? 'promotions' : 'legacy', editable }),
          pickupNames: async () => new Map([['pk_coeur', 'Cœur de station']]),
          get: async () => promotionView({ internalName: 'Croissants' }),
        },
      },
      { provide: CatalogueService, useValue: { published: async () => CATALOGUE } },
    ],
  });
  const fixture = TestBed.createComponent(PromotionEditorPage);
  for (const [key, value] of Object.entries(inputs)) {
    fixture.componentRef.setInput(key, value);
  }
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

const button = (root: HTMLElement, text: string) =>
  [...root.querySelectorAll('button')].find((entry) => entry.textContent?.trim() === text);

describe('PromotionEditorPage', () => {
  it('depuis la fiche d’un site, pré-remplit le retrait à ce point', async () => {
    const root = await render({ pickupId: 'pk_coeur' });
    expect(root.textContent).toContain('Nouvelle promotion');
    expect(root.textContent).toContain('Point de retrait');
    // Rien n'est saisi : la forme refuse, le bouton aussi.
    expect(button(root, 'Poser la promotion')?.disabled).toBe(true);
    expect(root.textContent).toContain('Donnez un nom interne');
  });

  it('modifie une promotion existante, relue', async () => {
    const root = await render({ id: 'promo_1' });
    expect(root.textContent).toContain('Modifier « Croissants »');
    expect(button(root, 'Enregistrer')?.disabled).toBe(false);
  });

  it('avant la bascule, dit qu’on ne peut pas encore écrire', async () => {
    const root = await render({ id: 'promo_1' }, false);
    expect(root.textContent).toContain('après la bascule');
    expect(button(root, 'Enregistrer')?.disabled).toBe(true);
  });
});

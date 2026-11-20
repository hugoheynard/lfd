import { TestBed } from '@angular/core/testing';
import type { PublishedCatalogView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { type MenuDraft, OPEN_DRAFT } from '../sub-account-menu-draft';
import { MenuEditor } from './menu-editor';

const CELLS = {
  inactif: 0,
  en_vente: 0,
  masque: 0,
  pas_vendu: 0,
  en_attente_validation: 0,
  incomplet: 0,
};

const CATALOGUE: PublishedCatalogView = {
  shelves: [
    {
      categoryId: 'pat',
      name: 'Pâtisserie',
      position: 0,
      withdrawn: false,
      pro: CELLS,
      public: CELLS,
    },
  ],
  entries: [
    {
      productId: 'p1',
      productSku: 'TAR',
      name: 'Tarte au citron',
      categoryId: 'pat',
      categoryPath: ['pat'],
      status: 'active',
      audience: 'pro',
      audienceInherited: true,
      familyAudience: 'pro',
      receivedAt: '2026-11-01T00:00:00.000Z',
      variants: ['TAR-6', 'TAR-8'].map((sku) => ({
        sku,
        name: sku,
        onSale: true,
        isDefault: sku === 'TAR-6',
        saleUnit: 'piece' as const,
        gaps: [],
        reviewPending: { pro: false, public: false },
        pro: { state: 'en_vente' as const, htMillicents: 100_000 },
        public: { state: 'pas_vendu' as const, ttcCents: null },
      })),
    },
  ],
  pendingReview: [],
};

function render(inputs: Record<string, unknown>): HTMLElement {
  TestBed.resetTestingModule();
  const fixture = TestBed.createComponent(MenuEditor);
  fixture.componentRef.setInput('catalogue', CATALOGUE);
  Object.entries(inputs).forEach(([name, value]) => fixture.componentRef.setInput(name, value));
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

const save = (_draft: MenuDraft): Promise<void> => Promise.resolve();

describe('MenuEditor', () => {
  it('dit à qui la carte s’applique dans son résumé', () => {
    const host = render({ initial: OPEN_DRAFT, audience: 'à ses sites' });
    expect(host.querySelector('[data-summary]')?.textContent).toContain('ouverts à ses sites');
  });

  it('enregistre sans changement une carte pas encore posée à cet endroit', () => {
    const host = render({ initial: OPEN_DRAFT, canWrite: true, unsaved: true, save });
    expect(host.querySelector<HTMLButtonElement>('[data-save]')?.disabled).toBe(false);
  });

  it('en lecture, ni réglage ni bouton', () => {
    const host = render({ initial: OPEN_DRAFT, save });
    expect(host.querySelector('fold-view-toggle')).toBeNull();
    expect(host.querySelector('[data-save]')).toBeNull();
    expect(host.querySelector('[data-mode-read]')).not.toBeNull();
  });
});

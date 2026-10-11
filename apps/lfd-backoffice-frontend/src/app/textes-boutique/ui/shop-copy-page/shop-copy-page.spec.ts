import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import type { StaffPermission } from '@lfd/contracts';
import { FoldPanelHostService } from 'fold-ng';
import { describe, expect, it, vi } from 'vitest';

import { PermissionsStore } from '../../../auth/permissions.store';
import { NotifyService } from '../../../notify.service';
import { SHOP_PREVIEW_URL_TOKEN } from '../../data/shop-preview-config';
import { ShopCopyService } from '../../data/shop-copy.service';
import { adminView, entryView } from '../../shop-copy.testing';
import { PublicationHistoryPanel } from '../publication-history-panel/publication-history-panel';
import { ShopCopyPage } from './shop-copy-page';

const VIEW = adminView([
  entryView('cart.title', 'cart', 'Votre panier', {
    locales: { fr: { draftState: 'set', draftText: 'Le panier' } },
  }),
  entryView('nav.home', 'nav', 'Accueil'),
]);

async function render(
  api: Partial<Record<keyof ShopCopyService, unknown>>,
  permissions: readonly StaffPermission[],
) {
  const panels = { open: vi.fn() };
  TestBed.configureTestingModule({
    imports: [ShopCopyPage],
    providers: [
      { provide: ShopCopyService, useValue: api },
      { provide: SHOP_PREVIEW_URL_TOKEN, useValue: '' },
      { provide: NotifyService, useValue: { error: vi.fn(), success: vi.fn() } },
      {
        provide: PermissionsStore,
        useValue: { can: (p: StaffPermission) => permissions.includes(p) },
      },
      { provide: FoldPanelHostService, useValue: panels },
    ],
  });
  const fixture = TestBed.createComponent(ShopCopyPage);
  fixture.detectChanges();
  // La lecture part à l'initialisation : on laisse sa promesse se régler.
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
  return { fixture, panels, element: fixture.nativeElement as HTMLElement };
}

function buttonLabels(element: HTMLElement): readonly string[] {
  return [...element.querySelectorAll('button')].map((button) => button.textContent?.trim() ?? '');
}

describe('ShopCopyPage — Contenu › Textes de la boutique', () => {
  it('ouvre le premier espace du parcours et dit ce qui attend Publier', async () => {
    const { element } = await render({ load: () => Promise.resolve(VIEW) }, [
      'b2b_storefront:write',
    ]);
    expect(element.textContent).toContain('1 modification à publier');
    expect(element.textContent).toContain('Panier, connexion et saisie invité');
    expect(buttonLabels(element)).toContain('Publier');
    expect(element.textContent).toContain('Aperçu indisponible');
  });

  it('sans le droit d’écrire, pas de Publier', async () => {
    const { element } = await render({ load: () => Promise.resolve(VIEW) }, []);
    expect(buttonLabels(element)).not.toContain('Publier');
  });

  it('un échec de lecture se dit, avec Réessayer', async () => {
    const { element } = await render(
      { load: () => Promise.reject(new HttpErrorResponse({ status: 500 })) },
      ['b2b_storefront:write'],
    );
    expect(element.querySelector('fold-empty-state')?.getAttribute('tone')).toBe('alert');
    expect(element.textContent).toContain('Réessayer');
  });

  it('l’historique s’ouvre dans un panneau', async () => {
    const { element, panels } = await render({ load: () => Promise.resolve(VIEW) }, []);
    const button = [...element.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Historique'),
    );
    button?.click();
    expect(panels.open).toHaveBeenCalledWith(PublicationHistoryPanel);
  });
});

import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import type { OrderDraftSummaryView } from '@lfd/contracts';
import { describe, expect, it, vi } from 'vitest';

import { OrderDraftsService } from '../order-drafts.service';
import { OrderDraftsList } from './order-drafts-list';

const DRAFT: OrderDraftSummaryView = {
  companyId: 'cmp_1',
  companyName: 'Café des Halles',
  savedAt: new Date().toISOString(),
  savedByName: 'Léa Martin',
};

async function mount(list: () => Promise<readonly OrderDraftSummaryView[]>): Promise<{
  host: HTMLElement;
  navigate: ReturnType<typeof vi.spyOn>;
}> {
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: OrderDraftsService, useValue: { list } }],
  });
  const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  const fixture = TestBed.createComponent(OrderDraftsList);
  // La lecture, puis le rendu de la table et de ses cellules.
  for (let i = 0; i < 3; i++) {
    await fixture.whenStable();
    fixture.detectChanges();
  }
  return { host: fixture.nativeElement as HTMLElement, navigate };
}

describe('OrderDraftsList — l’onglet « Brouillons » des commandes', () => {
  it('nomme le compte, quand et par qui, et rouvre la saisie qui ramène ici', async () => {
    const { host, navigate } = await mount(() => Promise.resolve([DRAFT]));

    expect(host.textContent).toContain('Café des Halles');
    expect(host.textContent).toContain('Léa Martin');

    host.querySelector<HTMLElement>('[data-draft="cmp_1"]')?.click();

    expect(navigate).toHaveBeenCalledWith(['/nouvelle-commande', 'cmp_1'], {
      queryParams: { retour: '/commandes?view=drafts' },
    });
  });

  it('sans brouillon, le dit', async () => {
    const { host } = await mount(() => Promise.resolve([]));
    expect(host.textContent).toContain('Aucun brouillon');
  });

  it('un échec de lecture ne se fait pas passer pour une liste vide', async () => {
    const { host } = await mount(() => Promise.reject(new Error('503')));
    expect(host.textContent).toContain('Impossible de charger les brouillons');
    expect(host.textContent).not.toContain('Aucun brouillon');
  });
});

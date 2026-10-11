import { TestBed } from '@angular/core/testing';
import type { ActivityEventView, ActivityPageView } from '@lfd/contracts';
import { FoldPanelRef } from 'fold-ng';
import { describe, expect, it, vi } from 'vitest';

import { ShopCopyService } from '../../data/shop-copy.service';
import { PublicationHistoryPanel } from './publication-history-panel';

const EVENT: ActivityEventView = {
  id: '01J',
  type: 'shop_copy.published',
  module: null,
  occurredAt: new Date().toISOString(),
  subjectType: 'shop_copy',
  subjectId: 'shop',
  actorType: 'staff',
  actorId: 's1',
  actorName: 'Colette Martin',
  actorRole: null,
  traceId: 't',
  payload: {
    version: 7,
    changes: [
      { key: 'cart.title', locale: 'fr', before: null, after: 'Le panier' },
      { key: 'mal', locale: 3 },
    ],
  },
};

async function render(history: () => Promise<ActivityPageView>) {
  TestBed.configureTestingModule({
    imports: [PublicationHistoryPanel],
    providers: [
      { provide: ShopCopyService, useValue: { history } },
      { provide: FoldPanelRef, useValue: { close: vi.fn() } },
    ],
  });
  const fixture = TestBed.createComponent(PublicationHistoryPanel);
  fixture.detectChanges();
  // La lecture part à l'initialisation : on laisse sa promesse se régler.
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

describe('PublicationHistoryPanel', () => {
  it('montre chaque publication, son auteur et ses valeurs avant et après', async () => {
    const element = await render(() =>
      Promise.resolve({ events: [EVENT], nextBefore: null, total: 1, page: 1, asOf: null }),
    );
    expect(element.textContent).toContain('Version 7');
    expect(element.textContent).toContain('Colette Martin');
    expect(element.textContent).toContain('le texte du code');
    expect(element.textContent).toContain('Le panier');
    expect(element.textContent).toContain('1 texte');
  });

  it('un échec se dit', async () => {
    const element = await render(() => Promise.reject(new Error('panne')));
    expect(element.textContent).toContain('L’historique n’a pas pu être lu');
  });
});

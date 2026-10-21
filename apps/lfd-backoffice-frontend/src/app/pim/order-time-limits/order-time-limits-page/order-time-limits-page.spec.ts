import { provideRouter } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import type { GeneralOrderCutoffView, OrderTimeLimitView } from '@lfd/pim-contracts';
import { describe, expect, it } from 'vitest';

import { OrderTimeLimitsService } from '../order-time-limits.service';
import { OrderTimeLimitsPage } from './order-time-limits-page';

const BUCHE: OrderTimeLimitView = {
  id: 'l1',
  scope: { type: 'product', id: 'p1' },
  scopeLabel: 'Bûche',
  daysBefore: 2,
  time: '12:00',
  graceMinutes: null,
};

/** Le service doublé : seules ses deux lectures servent à l'affichage. */
class FakeService {
  generalView: GeneralOrderCutoffView = {
    enabled: true,
    rule: { daysBefore: 1, time: '18:00', graceMinutes: 0 },
  };
  list(): Promise<readonly OrderTimeLimitView[]> {
    return Promise.resolve([BUCHE]);
  }
  general(): Promise<GeneralOrderCutoffView> {
    return Promise.resolve(this.generalView);
  }
}

async function render(api: FakeService): Promise<string> {
  TestBed.configureTestingModule({
    imports: [OrderTimeLimitsPage],
    providers: [provideRouter([]), { provide: OrderTimeLimitsService, useValue: api }],
  });
  const fixture = TestBed.createComponent(OrderTimeLimitsPage);
  await fixture.whenStable();
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  return (root.textContent ?? '').replace(/\s+/gu, ' ');
}

/**
 * Décision de Hugo du 2026-10-21 : « toute la production » se règle au
 * commerce ; la page la montre EN LECTURE, puis les produits qui ont leur
 * propre limite. Plus de choix de portée.
 */
describe('OrderTimeLimitsPage', () => {
  it('montre la règle générale en lecture, avec le chemin pour la régler', async () => {
    const text = await render(new FakeService());

    expect(text).toContain('Toute la production : La veille à 18:00, rattrapage aucun');
    expect(text).toContain('Réglages › Commandes › Heure limite');
  });

  it('dit quand la règle générale est désactivée', async () => {
    const api = new FakeService();
    api.generalView = { ...api.generalView, enabled: false };

    expect(await render(api)).toContain('désactivée, elle ne refuse aucune commande');
  });

  it("dit quand le commerce n'a aucune règle générale", async () => {
    const api = new FakeService();
    api.generalView = { enabled: true, rule: null };

    expect(await render(api)).toContain('aucune règle générale');
  });

  it('liste les produits, sans proposer de poser une limite ici', async () => {
    const text = await render(new FakeService());

    expect(text).toContain('Bûche');
    expect(text).toContain("L'avant-veille, 12:00");
    expect(text).not.toContain('Poser une limite');
  });
});

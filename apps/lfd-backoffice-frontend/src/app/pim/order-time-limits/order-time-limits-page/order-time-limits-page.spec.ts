import { provideRouter } from '@angular/router';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { GeneralOrderCutoffView, OrderTimeLimitListItem } from '@lfd/pim-contracts';
import { describe, expect, it } from 'vitest';

import { OrderTimeLimitsService } from '../order-time-limits.service';
import { OrderTimeLimitsPage } from './order-time-limits-page';

const BUCHE: OrderTimeLimitListItem = {
  id: 'l1',
  scope: { type: 'product', id: 'p1' },
  scopeLabel: 'Bûche',
  daysBefore: 2,
  time: '12:00',
  graceMinutes: null,
  staffMayExceed: false,
  archived: false,
  excludedProductIds: [],
  exclusions: [],
};

const GATEAUX: OrderTimeLimitListItem = {
  id: 'l2',
  scope: { type: 'category', id: 'f1' },
  scopeLabel: 'Gâteaux',
  daysBefore: 1,
  time: '18:00',
  graceMinutes: null,
  staffMayExceed: false,
  archived: false,
  excludedProductIds: ['p7', 'p8'],
  exclusions: [
    { productId: 'p7', label: 'FRA-06' },
    { productId: 'p8', label: null },
  ],
};

/** Le service doublé : seules ses deux lectures servent à l'affichage. */
class FakeService {
  generalView: GeneralOrderCutoffView = {
    rule: { daysBefore: 1, time: '18:00', graceMinutes: 0 },
  };
  readonly included: string[] = [];
  list(): Promise<readonly OrderTimeLimitListItem[]> {
    return Promise.resolve([BUCHE, GATEAUX]);
  }
  include(limitId: string, productId: string): Promise<void> {
    this.included.push(`${limitId}:${productId}`);
    return Promise.resolve();
  }
  general(): Promise<GeneralOrderCutoffView> {
    return Promise.resolve(this.generalView);
  }
}

async function mount(api: FakeService): Promise<ComponentFixture<OrderTimeLimitsPage>> {
  TestBed.configureTestingModule({
    imports: [OrderTimeLimitsPage],
    providers: [provideRouter([]), { provide: OrderTimeLimitsService, useValue: api }],
  });
  const fixture = TestBed.createComponent(OrderTimeLimitsPage);
  await fixture.whenStable();
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

const textOf = (fixture: ComponentFixture<OrderTimeLimitsPage>): string =>
  ((fixture.nativeElement as HTMLElement).textContent ?? '').replace(/\s+/gu, ' ');

async function render(api: FakeService): Promise<string> {
  return textOf(await mount(api));
}

function button(fixture: ComponentFixture<OrderTimeLimitsPage>, label: string): HTMLButtonElement {
  const found = Array.from(
    (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button'),
  ).find((candidate) => (candidate.textContent ?? '').trim() === label);
  if (found === undefined) {
    throw new Error(`bouton « ${label} » absent`);
  }
  return found;
}

/**
 * « Toute la production » se règle au commerce (décision de Hugo du
 * 2026-10-21) ; la page la montre EN LECTURE, puis les limites des produits et
 * des familles (décision du 2026-11-23).
 */
describe('OrderTimeLimitsPage', () => {
  it('montre la règle générale en lecture, avec le chemin pour la régler', async () => {
    const text = await render(new FakeService());

    expect(text).toContain('Toute la production : La veille à 18:00, rattrapage aucun');
    expect(text).toContain('Réglages › Commandes › Heure limite');
  });

  /** L'interrupteur de l'heure limite générale est retiré le 2026-10-21 : plus rien à dire de lui. */
  it('ne parle plus d’une règle générale désactivée', async () => {
    expect(await render(new FakeService())).not.toContain('désactivée');
  });

  it("dit quand le commerce n'a aucune règle générale", async () => {
    const api = new FakeService();
    api.generalView = { rule: null };

    expect(await render(api)).toContain('aucune règle générale');
  });

  it('liste produits et familles en disant leur type, et propose de poser une limite', async () => {
    const text = await render(new FakeService());

    expect(text).toContain('Produit Bûche');
    expect(text).toContain("L'avant-veille, 12:00");
    expect(text).toContain('Famille Gâteaux');
    expect(text).toContain('Poser une limite');
  });

  it('dit combien de produits une famille exclut, et déplie leur liste', async () => {
    const fixture = await mount(new FakeService());
    expect(textOf(fixture)).toContain('2 produits exclus');
    expect(textOf(fixture)).not.toContain('FRA-06');

    button(fixture, '2 produits exclus').click();
    fixture.detectChanges();

    expect(textOf(fixture)).toContain('FRA-06');
    // Sans SKU, l'identifiant plutôt que rien.
    expect(textOf(fixture)).toContain('p8');
  });

  it('réintègre un produit exclu', async () => {
    const api = new FakeService();
    const fixture = await mount(api);
    button(fixture, '2 produits exclus').click();
    fixture.detectChanges();

    button(fixture, 'Réintégrer').click();
    await fixture.whenStable();

    expect(api.included).toEqual(['l2:p7']);
  });
});

import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { OrderOpeningPatch, OrderOpeningView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { OrderOpeningService } from '../order-opening.service';
import { OrderOpeningPage } from './order-opening-page';

/**
 * **Ouverture de la boutique** (Hugo, 2026-10-09) : deux interrupteurs, et
 * chaque bascule passe par une confirmation qui dit son effet avant d'écrire.
 */

const OPEN: OrderOpeningView = {
  ordersOpenToB2b: true,
  ordersOpenToB2c: true,
  updatedAt: null,
  updatedBy: null,
};

class FakeOpening {
  readonly patches: OrderOpeningPatch[] = [];
  refusal: unknown = null;

  constructor(private current: OrderOpeningView | Error) {}

  read(): Promise<OrderOpeningView> {
    return this.current instanceof Error
      ? Promise.reject(this.current)
      : Promise.resolve(this.current);
  }

  /** Comme la route : `204`, aucun corps. */
  update(patch: OrderOpeningPatch): Promise<void> {
    this.patches.push(patch);
    if (this.refusal !== null) {
      return Promise.reject(this.refusal);
    }
    const base = this.current instanceof Error ? OPEN : this.current;
    this.current = {
      ordersOpenToB2b: patch.ordersOpenToB2b ?? base.ordersOpenToB2b,
      ordersOpenToB2c: patch.ordersOpenToB2c ?? base.ordersOpenToB2c,
      updatedAt: '2026-10-09T08:00:00.000Z',
      updatedBy: 'Hugo',
    };
    return Promise.resolve();
  }
}

async function mount(api: FakeOpening): Promise<ComponentFixture<OrderOpeningPage>> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [OrderOpeningPage],
    providers: [{ provide: OrderOpeningService, useValue: api }],
  });
  const fixture = TestBed.createComponent(OrderOpeningPage);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

const host = (fixture: ComponentFixture<OrderOpeningPage>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

const row = (fixture: ComponentFixture<OrderOpeningPage>, audience: string): HTMLElement => {
  const found = host(fixture).querySelector<HTMLElement>(`li[data-audience="${audience}"]`);
  if (found === null) {
    throw new Error(`Pas de ligne ${audience}.`);
  }
  return found;
};

const buttonIn = (scope: HTMLElement, label: string): HTMLButtonElement => {
  const found = Array.from(scope.querySelectorAll('button')).find(
    (button) => (button.textContent ?? '').trim() === label,
  );
  if (found === undefined) {
    throw new Error(`Pas de bouton « ${label} ».`);
  }
  return found;
};

describe('OrderOpeningPage', () => {
  it('montre les deux clientèles, ouvertes, avec leur phrase', async () => {
    const fixture = await mount(new FakeOpening(OPEN));
    const text = host(fixture).textContent ?? '';

    expect(text).toContain('Pros');
    expect(text).toContain('La boutique prend les commandes des pros');
    expect(text).toContain('Particuliers');
    expect(text).toContain('La boutique prend les commandes des particuliers');
    expect(row(fixture, 'b2b').textContent).toContain('Ouverte');
    expect(row(fixture, 'b2c').textContent).toContain('Ouverte');
  });

  it("n'écrit rien au premier clic : la confirmation dit d'abord l'effet", async () => {
    const api = new FakeOpening(OPEN);
    const fixture = await mount(api);

    buttonIn(row(fixture, 'b2c'), 'Fermer').click();
    fixture.detectChanges();

    expect(api.patches).toEqual([]);
    expect(row(fixture, 'b2c').textContent).toContain(
      'Les particuliers ne pourront plus passer de commande',
    );
  });

  it('ferme une clientèle à la confirmation, puis relit', async () => {
    const api = new FakeOpening(OPEN);
    const fixture = await mount(api);
    const page = fixture.componentInstance;
    const pros = page['rows']()[0];
    if (pros === undefined) {
      throw new Error('ligne absente');
    }

    await page['toggle'](pros);
    fixture.detectChanges();

    expect(api.patches).toEqual([{ ordersOpenToB2b: false }]);
    expect(row(fixture, 'b2b').textContent).toContain('Fermée');
    expect(buttonIn(row(fixture, 'b2b'), 'Rouvrir')).toBeDefined();
    expect(host(fixture).textContent).toContain('Dernier réglage par Hugo');
  });

  it('rouvre une clientèle fermée', async () => {
    const api = new FakeOpening({ ...OPEN, ordersOpenToB2c: false });
    const fixture = await mount(api);
    const particuliers = fixture.componentInstance['rows']()[1];
    if (particuliers === undefined) {
      throw new Error('ligne absente');
    }

    expect(fixture.componentInstance['effect'](particuliers)).toContain('de nouveau');
    await fixture.componentInstance['toggle'](particuliers);

    expect(api.patches).toEqual([{ ordersOpenToB2c: true }]);
  });

  it('dit un refus du serveur et garde l’état servi', async () => {
    const api = new FakeOpening(OPEN);
    api.refusal = new Error('refusé');
    const fixture = await mount(api);
    const pros = fixture.componentInstance['rows']()[0];
    if (pros === undefined) {
      throw new Error('ligne absente');
    }

    await fixture.componentInstance['toggle'](pros);
    fixture.detectChanges();

    expect(host(fixture).querySelector('fold-callout')).not.toBeNull();
    expect(row(fixture, 'b2b').textContent).toContain('Ouverte');
  });

  it('propose de réessayer quand la lecture échoue', async () => {
    const fixture = await mount(new FakeOpening(new Error('panne')));

    expect(host(fixture).textContent).toContain("Impossible de charger l'ouverture de la boutique");
  });
});

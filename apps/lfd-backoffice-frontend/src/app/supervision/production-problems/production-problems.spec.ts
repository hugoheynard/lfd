import { HttpErrorResponse } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { ProductionProblemView } from '@lfd/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import { SupervisionService } from '../supervision.service';
import { ProductionProblems } from './production-problems';

/**
 * Les rouges du fournil en Supervision : chacun dit l'attendu, le sorti et la
 * raison ; « Marquer traité » part sous une clé d'intention, n'est montré qu'à
 * qui peut écrire, et un succès fait relire.
 */

const PROBLEM: ProductionProblemView = {
  id: 'pb-1',
  sku: 'CRO',
  productName: 'Croissant',
  expected: 120,
  produced: 80,
  output: 80,
  reason: 'four en panne',
  reportedAt: '2026-11-18T08:12:00.000Z',
  reportedByName: 'Léa Martin',
  version: 1,
};

let resolved: { readonly id: string; readonly key: string }[];
let failure: unknown;

beforeEach(() => {
  resolved = [];
  failure = null;
  TestBed.configureTestingModule({
    providers: [
      {
        provide: SupervisionService,
        useValue: {
          resolveProductionProblem: (id: string, key: string): Promise<void> => {
            resolved.push({ id, key });
            return failure === null ? Promise.resolve() : Promise.reject(failure);
          },
        },
      },
    ],
  });
});

function render(
  canResolve: boolean,
  problems: readonly ProductionProblemView[] = [PROBLEM],
): { fixture: ComponentFixture<ProductionProblems>; el: HTMLElement; emitted: number[] } {
  const fixture = TestBed.createComponent(ProductionProblems);
  fixture.componentRef.setInput('problems', problems);
  fixture.componentRef.setInput('canResolve', canResolve);
  const emitted: number[] = [];
  fixture.componentInstance.resolved.subscribe(() => emitted.push(1));
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement, emitted };
}

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('les problèmes du fournil en Supervision', () => {
  it('dit le produit, l’attendu, le sorti et la raison', () => {
    const { el } = render(false);

    expect(el.textContent).toContain('Croissant');
    expect(el.querySelector('[data-problem-figures]')?.textContent).toContain(
      'Attendu 120 · sorti 80',
    );
    expect(el.querySelector('[data-problem-reason]')?.textContent).toContain('four en panne');
  });

  it('nomme l’écart quand les fournées disent encore plus que le sorti déclaré', () => {
    const { el } = render(false, [{ ...PROBLEM, output: 100 }]);

    expect(el.querySelector('[data-problem-figures]')?.textContent).toContain('encore 100');
  });

  it('sans le droit d’écrire, pas de « Marquer traité »', () => {
    const { el } = render(false);

    expect(el.querySelector('[data-problem-resolve]')).toBeNull();
  });

  it('« Marquer traité » part sous une clé, puis demande la relecture', async () => {
    const { el, emitted } = render(true);

    el.querySelector<HTMLButtonElement>('[data-problem-resolve="pb-1"]')?.click();
    await settle();

    expect(resolved).toHaveLength(1);
    expect(resolved[0]?.id).toBe('pb-1');
    expect(resolved[0]?.key).not.toBe('');
    expect(emitted).toHaveLength(1);
  });

  it('un refus se dit, et le réessai rejoue la même clé', async () => {
    failure = new HttpErrorResponse({ status: 0 });
    const { fixture, el, emitted } = render(true);
    const click = (): void =>
      el.querySelector<HTMLButtonElement>('[data-problem-resolve="pb-1"]')?.click();

    click();
    await settle();
    fixture.detectChanges();
    expect(el.querySelector('[data-problem-refused]')).not.toBeNull();
    expect(emitted).toHaveLength(0);

    failure = null;
    click();
    await settle();

    expect(resolved).toHaveLength(2);
    expect(resolved[1]?.key).toBe(resolved[0]?.key);
    expect(emitted).toHaveLength(1);
  });

  it('sert les lignes à confirmer sous les rouges, sans « Marquer traité »', () => {
    const fixture = TestBed.createComponent(ProductionProblems);
    fixture.componentRef.setInput('problems', []);
    fixture.componentRef.setInput('unconfirmed', [
      { sku: 'PAI', productName: 'Baguette', quantity: 24, output: 0 },
    ]);
    fixture.componentRef.setInput('canResolve', true);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;

    expect(el.querySelector('[data-unconfirmed="PAI"]')?.textContent).toContain('Baguette');
    expect(el.querySelector('[data-unconfirmed-figures]')?.textContent).toContain(
      '24 au compte · 0 déclarée(s)',
    );
    expect(el.querySelector('[data-problem-resolve]')).toBeNull();
  });
});

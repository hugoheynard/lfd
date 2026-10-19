import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import type { CreateBundlePayload } from '@lfd/contracts';
import { FoldPanelRef } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { withChoice } from '../bundle-draft';
import { bundleChoice } from '../bundle.testing';
import { BundlesService } from '../bundles.service';
import { CreateBundlePanel } from './create-bundle-panel';

function setup(create: (payload: CreateBundlePayload) => Promise<{ key: string }>) {
  const closed: (string | undefined)[] = [];
  const sent: CreateBundlePayload[] = [];
  TestBed.configureTestingModule({
    providers: [
      { provide: FoldPanelRef, useValue: { close: (value?: string) => closed.push(value) } },
      {
        provide: BundlesService,
        useValue: {
          searchChoices: async () => [],
          create: (payload: CreateBundlePayload) => {
            sent.push(payload);
            return create(payload);
          },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(CreateBundlePanel);
  fixture.detectChanges();
  return { panel: fixture.componentInstance, fixture, closed, sent };
}

function fill(panel: CreateBundlePanel): void {
  panel['name'].set(' Petit-déjeuner ');
  const [first, second] = panel['groups']();
  if (first === undefined || second === undefined) {
    throw new Error('deux groupes attendus');
  }
  panel['groups'].set([
    { ...first, label: 'Boisson' },
    { ...second, label: 'Viennoiserie' },
  ]);
  panel['groups'].update((groups) => withChoice(groups, first.id, bundleChoice()));
  panel['groups'].update((groups) =>
    withChoice(groups, second.id, bundleChoice({ sku: 'CROI-1' })),
  );
}

describe('CreateBundlePanel', () => {
  it('part avec deux groupes vides, et dit ce qui manque avant l’envoi', () => {
    const { panel } = setup(async () => ({ key: 'x' }));
    expect(panel['groups']()).toHaveLength(2);
    expect(panel['missing']()).toContain('nom');
    panel['name'].set('Goûter');
    expect(panel['missing']()).toContain('libellé');
    panel['groups'].update((groups) => groups.slice(0, 1));
    expect(panel['missing']()).toContain('au moins 2 groupes');
  });

  it('envoie le nom, une description nulle et les groupes, puis ferme sur la clé', async () => {
    const { panel, sent, closed } = setup(async () => ({ key: 'petit-dejeuner' }));
    fill(panel);
    expect(panel['missing']()).toBeNull();
    await panel['submit']();
    expect(sent).toEqual([
      {
        name: 'Petit-déjeuner',
        description: null,
        groups: [
          { label: 'Boisson', choices: ['CAFE-1'] },
          { label: 'Viennoiserie', choices: ['CROI-1'] },
        ],
      },
    ]);
    expect(closed).toEqual(['petit-dejeuner']);
  });

  it('un refus reste dans le panneau, la saisie aussi', async () => {
    const { panel, fixture, closed } = setup(async () => {
      throw new HttpErrorResponse({
        status: 409,
        error: { code: 'bundles.key_taken', message: 'Une formule porte déjà ce nom.' },
      });
    });
    fill(panel);
    await panel['submit']();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Une formule porte déjà ce nom.',
    );
    expect(closed).toEqual([]);
    expect(panel['name']()).toBe(' Petit-déjeuner ');
  });
});

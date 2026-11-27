import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { OptionGroupPayload, OptionGroupView } from '@lfd/pim-contracts';
import { FoldDangerZoneComponent, FoldPanelRef } from 'fold-ng';
import { By } from '@angular/platform-browser';
import { describe, expect, it } from 'vitest';

import { NotifyService } from '../../../notify.service';
import { OptionGroupPanel } from '../option-group-panel/option-group-panel';
import { OptionGroupStore } from '../option-group.store';

const GROUP: OptionGroupView = {
  id: 'og-1',
  name: 'Tranchage',
  archived: false,
  choices: [
    { key: 'tranche', label: 'Tranché', audience: 'both', archived: false },
    { key: 'fin', label: 'Tranché fin', audience: 'pro', archived: false },
    { key: 'epais', label: 'Tranché épais', audience: 'public', archived: true },
  ],
  products: 3,
};

function setup(group?: OptionGroupView, fail = false) {
  const created: OptionGroupPayload[] = [];
  const updated: [string, OptionGroupPayload][] = [];
  const archived: string[] = [];
  const closed: unknown[] = [];
  const refused: string[] = [];
  const outcome = () => (fail ? Promise.reject(new Error('refus')) : Promise.resolve());
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: FoldPanelRef, useValue: { close: (value: unknown) => closed.push(value) } },
      {
        provide: NotifyService,
        useValue: { refused: (_e: unknown, fallback: string) => refused.push(fallback) },
      },
      {
        provide: OptionGroupStore,
        useValue: {
          create: (payload: OptionGroupPayload) => {
            created.push(payload);
            return outcome();
          },
          update: (id: string, payload: OptionGroupPayload) => {
            updated.push([id, payload]);
            return outcome();
          },
          archive: (id: string) => {
            archived.push(id);
            return outcome();
          },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(OptionGroupPanel);
  if (group !== undefined) {
    fixture.componentRef.setInput('data', { group });
  }
  fixture.detectChanges();
  return { fixture, panel: fixture.componentInstance, created, updated, archived, closed, refused };
}

describe('OptionGroupPanel — création', () => {
  it('refuse une clé mal formée ou en double, puis crée le groupe d’un bloc', async () => {
    const { panel, created, closed } = setup();
    panel['draftName'].set('  Tranchage ');
    panel['setKey'](0, 'Tranché');
    panel['setLabel'](0, 'Tranché');
    expect(panel['problem']()).toContain('minuscules');
    panel['setKey'](0, 'tranche');
    panel['addChoice']();
    panel['setKey'](1, 'tranche');
    panel['setLabel'](1, 'Fin');
    expect(panel['problem']()).toContain('même clé');
    panel['setKey'](1, 'fin');
    panel['setAudience'](1, 'pro');
    panel['move'](1, -1);
    expect(panel['canSubmit']()).toBe(true);

    await panel['submit']();
    expect(created).toEqual([
      {
        name: 'Tranchage',
        choices: [
          { key: 'fin', label: 'Fin', audience: 'pro' },
          { key: 'tranche', label: 'Tranché', audience: 'both' },
        ],
      },
    ]);
    expect(closed).toEqual([true]);
  });

  it('un refus laisse le panneau ouvert', async () => {
    const { panel, closed, refused } = setup(undefined, true);
    panel['draftName'].set('Tranchage');
    panel['setKey'](0, 'tranche');
    panel['setLabel'](0, 'Tranché');
    await panel['submit']();
    expect(closed).toEqual([]);
    expect(refused).toEqual(['Opération refusée.']);
  });
});

describe('OptionGroupPanel — modification', () => {
  it('fige les clés enregistrées et ne reprend que les choix en service', () => {
    const { panel } = setup(GROUP);
    expect(panel['choices']().map((choice) => [choice.key, choice.saved])).toEqual([
      ['tranche', true],
      ['fin', true],
    ]);
    expect(panel['archivedChoices']().map((choice) => choice.key)).toEqual(['epais']);
  });

  it('un choix retiré s’archive, un archivé remis en service revient', async () => {
    const { panel, updated } = setup(GROUP);
    panel['removeChoice'](1);
    expect(panel['removedChoices']().map((choice) => choice.key)).toEqual(['fin']);
    panel['bringBack']('epais');
    expect(panel['archivedChoices']()).toEqual([]);
    await panel['submit']();
    expect(updated).toEqual([
      [
        'og-1',
        {
          name: 'Tranchage',
          choices: [
            { key: 'tranche', label: 'Tranché', audience: 'both' },
            { key: 'epais', label: 'Tranché épais', audience: 'public' },
          ],
        },
      ],
    ]);
  });

  it('archive le groupe depuis sa zone dangereuse, en disant combien de fiches l’activent', async () => {
    const { fixture, panel, archived } = setup(GROUP);
    expect(panel['archiveMessage']()).toContain('3 fiche(s)');
    fixture.debugElement
      .query(By.directive(FoldDangerZoneComponent))
      .triggerEventHandler('confirmed', '');
    await fixture.whenStable();
    expect(archived).toEqual(['og-1']);
  });
});

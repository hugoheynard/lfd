import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import {
  ReplacementDeposit,
  type ReplacementDepositOutcome,
} from '../../gestures/replacement-deposit';
import type { ReplaceCandidate } from '../../rules/replace-rules';
import { ReplaceDeposit } from './replace-deposit';

const DESIGNATED: ReplaceCandidate = {
  image: { url: 'b', name: '', alt: { fr: '' }, focal: null, tags: [], series: null },
  described: false,
  alreadyInLibrary: false,
};

function mount(outcome: ReplacementDepositOutcome) {
  const sent: (string | null)[] = [];
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      {
        provide: ReplacementDeposit,
        useValue: {
          deposit: (_file: File, seriesId: string | null): Promise<ReplacementDepositOutcome> => {
            sent.push(seriesId);
            return Promise.resolve(outcome);
          },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(ReplaceDeposit);
  fixture.componentRef.setInput('seriesChoices', () => []);
  fixture.componentRef.setInput('lookup', () => null);
  fixture.componentRef.setInput('seriesId', 'ser_1');
  fixture.detectChanges();
  const screen = fixture.componentInstance;
  const designated: ReplaceCandidate[] = [];
  let started = 0;
  screen.designated.subscribe((candidate) => designated.push(candidate));
  screen.started.subscribe(() => (started += 1));
  return { screen, sent, designated, started: () => started };
}

const file = new File(['octets'], 'b.png', { type: 'image/png' });

describe('déposer la remplaçante', () => {
  it('dépose dans la série choisie, et désigne le fichier déposé', async () => {
    const { screen, sent, designated, started } = mount(DESIGNATED);

    await screen['deposit']([file]);

    expect(sent).toEqual(['ser_1']);
    expect(started()).toBe(1);
    expect(designated).toEqual([DESIGNATED]);
    expect(screen['uploading']()).toBe(false);
  });

  it('dit le refus, et ne désigne rien', async () => {
    const { screen, designated } = mount({ refusal: 'le fichier est vide' });

    await screen['deposit']([file]);

    expect(screen['depositRefusal']()).toBe('le fichier est vide');
    expect(designated).toEqual([]);
  });
});

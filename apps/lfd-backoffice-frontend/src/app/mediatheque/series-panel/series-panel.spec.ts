import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { MediaSeriesPayload, MediaSeriesView } from '@lfd/pim-contracts';
import { FoldPanelRef } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import {
  SeriesPanel,
  type SeriesPanelData,
  type SeriesPanelResult,
  type SeriesSaveOutcome,
} from './series-panel';

/**
 * Ce que ces cas tiennent : **le panneau grise ce que le serveur refuserait,
 * et reste ouvert sur ce qu'il refuse quand même**, saisie intacte.
 */

const TODAY = '2026-10-10';

const EXISTING: MediaSeriesView = {
  id: 's1',
  title: 'Shooting carte 2026',
  shotOn: '2026-03-14',
  note: 'Lumière du matin.',
  images: 12,
  createdAt: '2026-03-20T10:00:00.000Z',
};

function panel(
  series: MediaSeriesView | null,
  answer: (payload: MediaSeriesPayload) => SeriesSaveOutcome = () => ({ id: 'new' }),
) {
  const closed: SeriesPanelResult[] = [];
  const sent: MediaSeriesPayload[] = [];
  const data: SeriesPanelData = {
    series,
    today: TODAY,
    save: async (payload) => {
      sent.push(payload);
      return answer(payload);
    },
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      {
        provide: FoldPanelRef,
        useValue: {
          close: (result?: SeriesPanelResult): void => {
            if (result !== undefined) {
              closed.push(result);
            }
          },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(SeriesPanel);
  fixture.componentRef.setInput('data', data);
  fixture.detectChanges();
  return { screen: fixture.componentInstance, closed, sent };
}

describe('une série — ouvrir', () => {
  it('ne crée rien sans titre, sans le reprocher avant la première lettre', async () => {
    const { screen, sent } = panel(null);

    expect(screen['blocked']()).toBe(true);
    expect(screen['problem']()).toBeNull();
    screen['edit']('title', '   ');
    await screen['submit']();
    expect(sent).toEqual([]);
  });

  it('envoie un titre rogné, et les champs facultatifs vides à `null`', async () => {
    const { screen, sent, closed } = panel(null);

    screen['edit']('title', '  Atelier  ');
    screen['edit']('note', '   ');
    await screen['submit']();

    expect(sent).toEqual([{ title: 'Atelier', shotOn: null, note: null }]);
    expect(closed).toEqual([{ id: 'new' }]);
  });

  it('refuse une prise de vue à venir', () => {
    const { screen } = panel(null);

    screen['edit']('title', 'Atelier');
    screen['edit']('shotOn', '2026-10-11');

    expect(screen['problem']()).toBe('La prise de vue ne peut pas être à venir.');
    expect(screen['blocked']()).toBe(true);
    screen['edit']('shotOn', TODAY);
    expect(screen['blocked']()).toBe(false);
  });

  it('refuse un titre de plus de 120 caractères', () => {
    const { screen } = panel(null);

    screen['edit']('title', 'a'.repeat(121));

    expect(screen['problem']()).toBe('Le titre dépasse 120 caractères.');
  });

  it('refuse une note de plus de 2000 caractères, et la compte', () => {
    const { screen } = panel(null);

    screen['edit']('title', 'Atelier');
    screen['edit']('note', 'n'.repeat(2001));

    expect(screen['noteLength']()).toBe(2001);
    expect(screen['problem']()).toBe('La note dépasse 2000 caractères.');
  });

  it('reste ouvert sur un refus du serveur, et l’efface à la saisie suivante', async () => {
    const { screen, closed } = panel(null, () => ({
      refusal: 'Série refusée : la prise de vue ne peut pas être à venir.',
    }));

    screen['edit']('title', 'Atelier');
    await screen['submit']();

    expect(closed).toEqual([]);
    expect(screen['refusal']()).toBe('Série refusée : la prise de vue ne peut pas être à venir.');
    expect(screen['title']()).toBe('Atelier');
    screen['edit']('title', 'Atelier bis');
    expect(screen['refusal']()).toBeNull();
  });
});

describe('une série — corriger', () => {
  it('part de ce qui est écrit, et rend le même identifiant', async () => {
    const { screen, sent } = panel(EXISTING, () => ({ id: 's1' }));

    expect(screen['editing']()).toBe(true);
    expect(screen['title']()).toBe('Shooting carte 2026');
    expect(screen['shotOn']()).toBe('2026-03-14');

    screen['edit']('shotOn', '');
    await screen['submit']();

    expect(sent).toEqual([
      { title: 'Shooting carte 2026', shotOn: null, note: 'Lumière du matin.' },
    ]);
  });
});

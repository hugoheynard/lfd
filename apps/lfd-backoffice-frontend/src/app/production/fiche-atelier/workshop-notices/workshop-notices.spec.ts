import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { WorkshopDayReader } from '../state/workshop-day.reader';
import { WorkshopGestures } from '../state/workshop-gestures';
import { WorkshopQueueReplay } from '../outbox/workshop-queue-replay';
import { WorkshopNotices } from './workshop-notices';

/** Les bandeaux lisent l'état de la fiche : des signaux qu'on règle à la main. */
const day = {
  state: signal<'loading' | 'ready' | 'error'>('ready'),
  shelvesLost: signal(false),
  workstationsLost: signal(false),
  refreshFailed: signal(false),
  readLabel: signal('4 h 12'),
  dayTurnedLabel: signal<string | null>(null),
  drift: signal(null),
  generatedLabel: signal<string | null>(null),
  acknowledgeDayTurn: () => undefined,
};
const gestures = {
  retakeFailed: signal(false),
  refused: signal<string | null>(null),
  retake: async () => undefined,
};
let flushed = 0;
const queue = {
  queuedLabel: signal<string | null>(null),
  flush: async () => {
    flushed += 1;
  },
};

function render(linkedElsewhere: string | null = null): HTMLElement {
  const fixture = TestBed.createComponent(WorkshopNotices);
  fixture.componentRef.setInput('linkedElsewhere', linkedElsewhere);
  fixture.detectChanges();
  return fixture.nativeElement;
}

beforeEach(() => {
  day.shelvesLost.set(false);
  day.refreshFailed.set(false);
  gestures.refused.set(null);
  queue.queuedLabel.set(null);
  flushed = 0;
  TestBed.configureTestingModule({
    providers: [
      { provide: WorkshopDayReader, useValue: day },
      { provide: WorkshopGestures, useValue: gestures },
      { provide: WorkshopQueueReplay, useValue: queue },
    ],
  });
});

describe('les bandeaux de la fiche', () => {
  it('quand tout va bien, ne dit rien', () => {
    expect(render().querySelectorAll('fold-callout')).toHaveLength(0);
  });

  it('dit une relecture en échec, avec l’heure de la dernière lue', () => {
    day.refreshFailed.set(true);
    expect(render().textContent).toContain('Relecture impossible depuis 4 h 12');
  });

  it('dit un geste refusé avec les mots du serveur', () => {
    gestures.refused.set('Pièces au bac');
    expect(render().querySelector('.fa-refused')?.textContent).toContain('Pièces au bac');
  });

  it('compte les gestes gardés, et « Renvoyer maintenant » relance la file', () => {
    queue.queuedLabel.set('2 fournées');
    const el = render();
    expect(el.querySelector('[data-queued-batches]')?.textContent).toContain('2 fournées');

    el.querySelector<HTMLButtonElement>('[data-queued-batches] button')?.click();
    expect(flushed).toBe(1);
  });

  it('dit que le lien suivi vise une autre journée', () => {
    expect(render('samedi 16 août').querySelector('[data-link-elsewhere]')?.textContent).toContain(
      'samedi 16 août',
    );
  });
});

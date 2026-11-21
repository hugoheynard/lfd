import { TestBed } from '@angular/core/testing';
import { FoldPanelHostService } from 'fold-ng';
import type { WorkshopLine } from '@lfd/contracts';
import { afterEach, describe, expect, it } from 'vitest';

import { WORKSHOP_NARROW } from '../rules/workshop-view';
import { WorkshopProblemPanel } from '../workshop-problem-panel/workshop-problem-panel';
import { WorkshopProblemOpener } from './workshop-problem-opener';

class RecordingPanels {
  readonly opened: { component: unknown; config: { data?: unknown; side?: string } }[] = [];
  answer: boolean | null | undefined = undefined;
  open(
    component: unknown,
    config: { data?: unknown; side?: string },
  ): { closed: Promise<boolean | null | undefined> } {
    this.opened.push({ component, config });
    return { closed: Promise.resolve(this.answer) };
  }
}

const LINE: WorkshopLine = {
  sku: 'SEI',
  productName: 'Pain de seigle',
  quantity: 30,
  saleUnit: 'piece',
  containerLabel: null,
  done: false,
  initials: null,
  doneAt: null,
  produced: 10,
  remaining: 20,
  surplus: 0,
  batches: [],
  container: null,
};

const original = window.matchMedia;

function setNarrow(narrow: boolean): void {
  window.matchMedia = (query: string): MediaQueryList =>
    ({ matches: narrow && query === WORKSHOP_NARROW, media: query }) as MediaQueryList;
}

function setup(): { opener: WorkshopProblemOpener; panels: RecordingPanels } {
  const panels = new RecordingPanels();
  TestBed.configureTestingModule({
    providers: [WorkshopProblemOpener, { provide: FoldPanelHostService, useValue: panels }],
  });
  return { opener: TestBed.inject(WorkshopProblemOpener), panels };
}

describe("le panneau « Problème » de la fiche d'atelier", () => {
  afterEach(() => {
    window.matchMedia = original;
  });

  it('monte du bas sous le seuil étroit, au centre au-dessus', async () => {
    const { opener, panels } = setup();
    setNarrow(false);
    await opener.openFor('2030-01-01', LINE);
    setNarrow(true);
    await opener.openFor('2030-01-01', LINE);
    expect(panels.opened.map((o) => o.config.side)).toEqual(['center', 'bottom']);
    expect(panels.opened[0]?.component).toBe(WorkshopProblemPanel);
  });

  it('passe la journée lue et la ligne au panneau', async () => {
    const { opener, panels } = setup();
    setNarrow(false);
    await opener.openFor('2030-01-01', LINE);
    expect(panels.opened[0]?.config.data).toEqual({ date: '2030-01-01', line: LINE });
  });

  it('rend true quand le serveur a pris le signalement', async () => {
    const { opener, panels } = setup();
    setNarrow(false);
    panels.answer = true;
    await expect(opener.openFor('2030-01-01', LINE)).resolves.toBe(true);
  });

  // Seul un `true` explicite vaut « pris » : fermer, ou rendre autre chose, n'est pas un signalement.
  it("rend false à l'annulation, qu'elle soit false, null ou absente", async () => {
    const { opener, panels } = setup();
    setNarrow(false);
    for (const answer of [false, null, undefined]) {
      panels.answer = answer;
      await expect(opener.openFor('2030-01-01', LINE)).resolves.toBe(false);
    }
  });
});

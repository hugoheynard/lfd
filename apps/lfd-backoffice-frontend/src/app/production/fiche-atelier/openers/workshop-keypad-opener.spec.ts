import { TestBed } from '@angular/core/testing';
import { FoldPanelHostService } from 'fold-ng';
import type { WorkshopLine } from '@lfd/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { WORKSHOP_NARROW } from '../rules/workshop-view';
import { WorkshopKeypad } from '../workshop-keypad/workshop-keypad';
import { WorkshopKeypadOpener } from './workshop-keypad-opener';

/** Le panneau fold, joué : on garde la config reçue, la fermeture se pilote à la main. */
class RecordingPanels {
  readonly opened: { component: unknown; config: { data?: unknown; side?: string } }[] = [];
  answer: number | null | undefined = undefined;
  open(
    component: unknown,
    config: { data?: unknown; side?: string },
  ): { closed: Promise<number | null | undefined> } {
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

/** Joue la largeur : n'est « étroit » que la requête du seuil du fournil, et seulement si `narrow`. */
function setNarrow(narrow: boolean): void {
  window.matchMedia = (query: string): MediaQueryList =>
    ({ matches: narrow && query === WORKSHOP_NARROW, media: query }) as MediaQueryList;
}

function setup(): { opener: WorkshopKeypadOpener; panels: RecordingPanels } {
  const panels = new RecordingPanels();
  TestBed.configureTestingModule({
    providers: [WorkshopKeypadOpener, { provide: FoldPanelHostService, useValue: panels }],
  });
  return { opener: TestBed.inject(WorkshopKeypadOpener), panels };
}

describe("le pavé de la fiche d'atelier", () => {
  beforeEach(() => setNarrow(false));
  afterEach(() => {
    window.matchMedia = original;
  });

  it('monte du bas sous le seuil étroit', async () => {
    setNarrow(true);
    const { opener, panels } = setup();
    await opener.openFor(LINE, 5, []);
    expect(panels.opened[0]?.component).toBe(WorkshopKeypad);
    expect(panels.opened[0]?.config.side).toBe('bottom');
  });

  it("s'ouvre au centre au-dessus du seuil", async () => {
    const { opener, panels } = setup();
    await opener.openFor(LINE, 5, []);
    expect(panels.opened[0]?.config.side).toBe('center');
  });

  it('lit la largeur AU CLIC : la même instance change de côté si la fenêtre change', async () => {
    const { opener, panels } = setup();
    await opener.openFor(LINE, 5, []);
    setNarrow(true);
    await opener.openFor(LINE, 5, []);
    expect(panels.opened.map((o) => o.config.side)).toEqual(['center', 'bottom']);
  });

  it('rend la quantité déclarée à la fermeture', async () => {
    const { opener, panels } = setup();
    panels.answer = 12;
    await expect(opener.openFor(LINE, 5, [])).resolves.toBe(12);
  });

  // `closed` rend `undefined` quand on ferme sans valider : la promesse promet `null`.
  it('rend null quand on annule', async () => {
    const { opener, panels } = setup();
    panels.answer = undefined;
    await expect(opener.openFor(LINE, 5, [])).resolves.toBeNull();
    panels.answer = null;
    await expect(opener.openFor(LINE, 5, [])).resolves.toBeNull();
  });

  // 0 est une valeur, pas une annulation : un `||` à la place de `??` l'avalerait.
  it('ne confond pas une quantité de zéro avec une annulation', async () => {
    const { opener, panels } = setup();
    panels.answer = 0;
    await expect(opener.openFor(LINE, 5, [])).resolves.toBe(0);
  });

  it("prérempli au moins d'une pièce, et porte la ligne dans les données du pavé", async () => {
    const { opener, panels } = setup();
    await opener.openFor(LINE, 0, []);
    await opener.openFor(LINE, -3, []);
    await opener.openFor(LINE, 7, []);
    const presets = panels.opened.map((o) => (o.config.data as { preset: number }).preset);
    expect(presets).toEqual([1, 1, 7]);
    expect(panels.opened[0]?.config.data).toMatchObject({
      productName: 'Pain de seigle',
      remaining: 20,
      container: null,
      saleUnit: 'piece',
      shortcuts: [],
    });
  });
});

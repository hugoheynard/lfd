import { HttpErrorResponse } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { ProductionPrintOptionsView, ProvisionalPrintPayload } from '@lfd/contracts';
import { FoldPanelRef } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { DossierPrintService, type FrozenDossierSelection } from '../../../dossier-print.service';
import { DossierPrintDialog, type DossierPrintDialogData } from './dossier-print-dialog';

/**
 * La fenêtre d'impression du dossier : provisoire avant l'arrêt (un numéro,
 * puis la fenêtre relue), parties du dossier figé après — et une sélection
 * vide ne part pas.
 */

/** Tirage #3 : une date absolue, jamais comparée à l'horloge, seulement affichée. */
const PRINT_3 = {
  id: 'pp_3',
  run: 3,
  printedAt: '2026-11-26T09:42:00.000Z',
  printedByName: 'Ana Lopez',
  functionSheetsReplaced: false,
};

const OPEN_DAY: ProductionPrintOptionsView = {
  arrested: false,
  grouping: 'shelf',
  groups: ['Viennoiseries', 'Pains'],
  orders: [
    { orderId: 'o1', reference: 'ORD-0142', customerLabel: 'Café des Halles' },
    { orderId: 'o2', reference: 'ORD-0143', customerLabel: 'Le Comptoir' },
  ],
  prints: [PRINT_3],
  changedSinceLast: true,
  functionSheets: [],
};

const SHEET = { sheetId: 'fs1', fileName: 'mariage.pdf', eventName: 'Mariage Durand' };

class FakeApi {
  views: ProductionPrintOptionsView[] = [];
  readonly reads: string[] = [];
  readonly draws: { payload: ProvisionalPrintPayload; key: string }[] = [];
  readonly frozen: FrozenDossierSelection[] = [];
  refuse: unknown = null;

  printOptions(date: string): Promise<ProductionPrintOptionsView> {
    this.reads.push(date);
    const view = this.views.length > 1 ? this.views.shift() : this.views[0];
    return view === undefined ? Promise.reject(new Error('absent')) : Promise.resolve(view);
  }

  drawProvisional(_date: string, payload: ProvisionalPrintPayload, key: string): Promise<string> {
    if (this.refuse !== null) return Promise.reject(this.refuse);
    this.draws.push({ payload, key });
    return Promise.resolve(`pp_${String(this.draws.length)}`);
  }

  provisionalPdf(): Promise<Blob> {
    return Promise.resolve(new Blob(['%PDF']));
  }

  frozenPdf(_date: string, selection: FrozenDossierSelection = {}): Promise<Blob> {
    this.frozen.push(selection);
    return Promise.resolve(new Blob(['%PDF']));
  }
}

interface Rendered {
  readonly fixture: ComponentFixture<DossierPrintDialog>;
  readonly presented: Blob[];
  readonly el: () => HTMLElement;
  readonly text: () => string;
  readonly printButton: () => HTMLButtonElement;
  readonly settle: () => Promise<void>;
}

async function render(api: FakeApi, blocked: string | null = null): Promise<Rendered> {
  const presented: Blob[] = [];
  TestBed.configureTestingModule({
    imports: [DossierPrintDialog],
    providers: [
      { provide: DossierPrintService, useValue: api },
      { provide: FoldPanelRef, useValue: new FoldPanelRef<void>(1, () => undefined) },
    ],
  });
  const fixture = TestBed.createComponent(DossierPrintDialog);
  const data: DossierPrintDialogData = {
    date: '2026-11-26',
    dayLabel: 'jeudi 26 novembre',
    present: (pdf) => {
      presented.push(pdf);
      return blocked;
    },
  };
  fixture.componentRef.setInput('data', data);
  const settle = async (): Promise<void> => {
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
  };
  await settle();
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  return {
    fixture,
    presented,
    el,
    text: () => el().textContent ?? '',
    printButton: () => {
      const button = el().querySelector<HTMLButtonElement>('button[data-action="print"]');
      if (button === null) throw new Error('bouton d’impression absent');
      return button;
    },
    settle,
  };
}

/** Coche ou décoche une case par son libellé. */
function checkbox(el: HTMLElement, label: string): HTMLInputElement {
  const box = [...el.querySelectorAll('fold-checkbox')].find((candidate) =>
    (candidate.textContent ?? '').includes(label),
  );
  const input = box?.querySelector<HTMLInputElement>('input[type="checkbox"]') ?? null;
  if (input === null) throw new Error(`case « ${label} » absente`);
  return input;
}

function chooseMode(el: HTMLElement, label: string): void {
  const button = [...el.querySelectorAll<HTMLButtonElement>('fold-choice-row button')].find(
    (candidate) => (candidate.textContent ?? '').includes(label),
  );
  if (button === undefined) throw new Error(`mode « ${label} » absent`);
  button.click();
}

describe('DossierPrintDialog — avant l’arrêt', () => {
  it('dit que la journée a changé depuis la dernière impression', async () => {
    const api = new FakeApi();
    api.views = [OPEN_DAY];
    const { text } = await render(api);
    expect(text()).toMatch(/La journée a changé depuis l’impression #3 \(10:42\)/);
  });

  it('coche tout, et tire une impression provisoire de tout', async () => {
    const api = new FakeApi();
    api.views = [OPEN_DAY];
    const { printButton, settle, presented } = await render(api);

    expect(printButton().textContent).toContain('Imprimer en provisoire');
    printButton().click();
    await settle();

    expect(api.draws[0]?.payload).toEqual({
      parts: ['cover', 'recap', 'calendar', 'orders', 'deliveryNotes', 'resupplies'],
      groups: 'all',
      orders: { kind: 'all' },
    });
    expect(api.draws[0]?.key).not.toBe('');
    expect(presented).toHaveLength(1);
  });

  it('relit la fenêtre après un tirage : le nouveau numéro, l’alerte éteinte', async () => {
    const api = new FakeApi();
    const PRINT_4 = { ...PRINT_3, id: 'pp_4', run: 4 };
    api.views = [OPEN_DAY, { ...OPEN_DAY, prints: [PRINT_3, PRINT_4], changedSinceLast: false }];
    const { printButton, settle, text } = await render(api);

    printButton().click();
    await settle();

    expect(api.reads).toHaveLength(2);
    expect(text()).not.toContain('La journée a changé');
  });

  it('« nouvelles ou modifiées » part sur la dernière impression', async () => {
    const api = new FakeApi();
    api.views = [OPEN_DAY];
    const { el, printButton, settle } = await render(api);

    chooseMode(el(), 'Nouvelles ou modifiées');
    await settle();
    printButton().click();
    await settle();

    expect(api.draws[0]?.payload.orders).toEqual({ kind: 'since', run: 3 });
  });

  it('sans impression, ne propose pas « nouvelles ou modifiées »', async () => {
    const api = new FakeApi();
    api.views = [{ ...OPEN_DAY, prints: [], changedSinceLast: false }];
    const { text } = await render(api);
    expect(text()).not.toContain('Nouvelles ou modifiées');
    expect(text()).not.toContain('La journée a changé');
  });

  it('les commandes choisies, dans l’ordre du dossier', async () => {
    const api = new FakeApi();
    api.views = [OPEN_DAY];
    const { el, printButton, settle } = await render(api);

    checkbox(el(), 'Toutes les commandes').click();
    await settle();
    expect(printButton().disabled).toBe(true);
    checkbox(el(), 'ORD-0143').click();
    await settle();
    printButton().click();
    await settle();

    expect(api.draws[0]?.payload.orders).toEqual({ kind: 'chosen', orderIds: ['o2'] });
  });

  it('sans partie cochée, n’imprime rien', async () => {
    const api = new FakeApi();
    api.views = [OPEN_DAY];
    const { el, printButton, settle } = await render(api);

    for (const label of [
      'Couverture',
      'Totaux par rayon',
      'Calendriers',
      'Fiches de commande',
      'BL',
      'Fiches de réassort',
    ]) {
      checkbox(el(), label).click();
    }
    await settle();

    expect(printButton().disabled).toBe(true);
  });

  it('dit le refus du serveur quand rien n’a changé', async () => {
    const api = new FakeApi();
    api.views = [OPEN_DAY];
    api.refuse = new HttpErrorResponse({
      status: 409,
      error: { code: 'x', message: 'Aucune commande du 2026-11-26 n’est nouvelle ni modifiée.' },
    });
    const { el, printButton, settle, presented } = await render(api);

    printButton().click();
    await settle();

    expect(el().querySelector('[data-error]')?.textContent).toContain('ni modifiée');
    expect(presented).toHaveLength(0);
  });

  it('propose de télécharger quand l’onglet est bloqué', async () => {
    const api = new FakeApi();
    api.views = [OPEN_DAY];
    const { el, printButton, settle } = await render(api, 'blob:x');

    printButton().click();
    await settle();

    expect(el().querySelector('[data-blocked] a')?.getAttribute('href')).toBe('blob:x');
  });
});

describe('DossierPrintDialog — la liste des commandes', () => {
  const THREE: ProductionPrintOptionsView = {
    ...OPEN_DAY,
    orders: [
      ...OPEN_DAY.orders,
      { orderId: 'o3', reference: 'ORD-0150', customerLabel: 'Boulangerie Été' },
    ],
  };

  it('range les sections à gauche et les commandes à droite', async () => {
    const api = new FakeApi();
    api.views = [THREE];
    const { el } = await render(api);
    const sections = el().querySelector('[data-column="sections"]');
    const orders = el().querySelector('[data-column="orders"]');
    expect(sections?.querySelector('[data-part="cover"]')).not.toBeNull();
    expect(orders?.querySelector('[data-order="o1"]')).not.toBeNull();
    expect(orders?.querySelector('fold-search')).not.toBeNull();
  });

  it('coche tout à l’ouverture et le compte', async () => {
    const api = new FakeApi();
    api.views = [THREE];
    const { el } = await render(api);
    expect(checkbox(el(), 'Toutes les commandes').checked).toBe(true);
    expect(el().querySelector('[data-chosen-count]')?.textContent).toContain(
      '3 commandes sélectionnées sur 3',
    );
  });

  it('une commande décochée met la case maître en état mixte et part en « choisies »', async () => {
    const api = new FakeApi();
    api.views = [THREE];
    const { el, printButton, settle } = await render(api);

    checkbox(el(), 'ORD-0143').click();
    await settle();
    const master = checkbox(el(), 'Toutes les commandes');
    expect(master.indeterminate).toBe(true);
    expect(master.checked).toBe(false);
    expect(el().querySelector('[data-chosen-count]')?.textContent).toContain(
      '2 commandes sélectionnées sur 3',
    );
    printButton().click();
    await settle();

    expect(api.draws[0]?.payload.orders).toEqual({ kind: 'chosen', orderIds: ['o1', 'o3'] });
  });

  it('tout recoché à la main repart en « toutes »', async () => {
    const api = new FakeApi();
    api.views = [THREE];
    const { el, printButton, settle } = await render(api);

    checkbox(el(), 'ORD-0143').click();
    await settle();
    checkbox(el(), 'ORD-0143').click();
    await settle();
    expect(checkbox(el(), 'Toutes les commandes').indeterminate).toBe(false);
    printButton().click();
    await settle();

    expect(api.draws[0]?.payload.orders).toEqual({ kind: 'all' });
  });

  it('la recherche masque sans décocher, sur la référence comme sur le client', async () => {
    const api = new FakeApi();
    api.views = [THREE];
    const { fixture, el, printButton, settle } = await render(api);
    const input = el().querySelector<HTMLInputElement>('fold-search input');
    if (input === null) throw new Error('champ de recherche absent');

    input.value = 'ete';
    input.dispatchEvent(new Event('input'));
    await settle();
    expect(el().querySelector('[data-order="o3"]')).not.toBeNull();
    expect(el().querySelector('[data-order="o1"]')).toBeNull();

    input.value = '0142';
    input.dispatchEvent(new Event('input'));
    await settle();
    expect(el().querySelector('[data-order="o1"]')).not.toBeNull();
    expect(el().querySelector('[data-order="o2"]')).toBeNull();
    expect(el().querySelector('[data-chosen-count]')?.textContent).toContain('3 commandes');

    fixture.detectChanges();
    printButton().click();
    await settle();
    expect(api.draws[0]?.payload.orders).toEqual({ kind: 'all' });
  });
});

describe('DossierPrintDialog — fiches de fonction', () => {
  it('sans fiche du jour, la partie est désactivée et ne part pas', async () => {
    const api = new FakeApi();
    api.views = [OPEN_DAY];
    const { el, text } = await render(api);
    expect(checkbox(el(), 'Fiches de fonction').disabled).toBe(true);
    expect(text()).toContain('Aucune fiche de fonction ce jour');
  });

  it('avec des fiches, la partie est cochée, comptée, et part', async () => {
    const api = new FakeApi();
    api.views = [{ ...OPEN_DAY, functionSheets: [SHEET, { ...SHEET, sheetId: 'fs2' }] }];
    const { el, text, printButton, settle } = await render(api);

    expect(checkbox(el(), 'Fiches de fonction').checked).toBe(true);
    expect(text()).toContain('2 fiches du jour');
    printButton().click();
    await settle();

    expect(api.draws[0]?.payload.parts).toContain('functionSheets');
  });

  it('dit qu’une fiche a été remplacée depuis la dernière impression', async () => {
    const api = new FakeApi();
    api.views = [
      {
        ...OPEN_DAY,
        functionSheets: [SHEET],
        prints: [{ ...PRINT_3, functionSheetsReplaced: true }],
      },
    ];
    const { el } = await render(api);
    expect(el().querySelector('[data-sheets-replaced]')?.textContent).toContain(
      'Fiche de fonction remplacée depuis l’impression #3',
    );
  });

  it('après l’arrêt, des fiches toutes cochées demandent le dossier archivé', async () => {
    const api = new FakeApi();
    api.views = [{ ...OPEN_DAY, arrested: true, changedSinceLast: false, functionSheets: [SHEET] }];
    const { printButton, settle } = await render(api);
    printButton().click();
    await settle();
    expect(api.frozen).toEqual([{}]);
  });
});

describe('DossierPrintDialog — après l’arrêt', () => {
  const ARRESTED: ProductionPrintOptionsView = {
    ...OPEN_DAY,
    arrested: true,
    changedSinceLast: false,
  };

  it('sans rien décocher, demande le dossier archivé', async () => {
    const api = new FakeApi();
    api.views = [ARRESTED];
    const { printButton, settle, text } = await render(api);

    expect(printButton().textContent?.trim()).toBe('Imprimer');
    expect(text()).not.toContain('Nouvelles ou modifiées');
    printButton().click();
    await settle();

    expect(api.frozen).toEqual([{}]);
    expect(api.draws).toEqual([]);
  });

  it('les parties et les rayons décochés partent en paramètres', async () => {
    const api = new FakeApi();
    api.views = [ARRESTED];
    const { el, printButton, settle } = await render(api);

    checkbox(el(), 'Couverture').click();
    checkbox(el(), 'Tous').click();
    await settle();
    checkbox(el(), 'Pains').click();
    await settle();
    printButton().click();
    await settle();

    expect(api.frozen[0]).toEqual({
      parts: ['recap', 'calendar', 'orders', 'deliveryNotes', 'resupplies'],
      groups: ['Pains'],
    });
  });
});

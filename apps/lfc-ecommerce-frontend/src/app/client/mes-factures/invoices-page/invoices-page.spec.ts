import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import type { MyIssuedInvoicesView } from '@lfd/contracts';
import { FoldDataTableComponent, FoldListboxComponent, FoldPanelHostService } from 'fold-ng';
import { afterEach, vi } from 'vitest';

import {
  ClientInvoices,
  InvoiceArchiveRefused,
  type InvoiceArchiveRequest,
  type InvoiceFilters,
} from '../../client-invoices.service';
import { FR } from '../../copy/fr';
import {
  asRole,
  bootCard,
  matchMediaAt,
  openedPanel,
  TOMMEUSES,
} from '../../mon-compte/account.fixture';
import { InvoiceDialog } from '../invoice-dialog/invoice-dialog';
import { AUGUST_REJECTED, CREDIT_NOTE, SEPTEMBER } from '../invoice.fixture';
import { InvoicesPage } from './invoices-page';

const COPY = FR.account.invoices;

const VIEW: MyIssuedInvoicesView = {
  invoices: [CREDIT_NOTE, SEPTEMBER, AUGUST_REJECTED],
  amountDue: { totalCents: 30_550, invoiceCount: 2, rejectedCount: 1, rejectedCents: 20_000 },
};

let reads: InvoiceFilters[];
let archives: InvoiceArchiveRequest[];
let answer: () => Promise<MyIssuedInvoicesView>;
let archiveAnswer: () => Promise<{ fileName: string; blob: Blob }>;
let downloaded: string[];
let fixture: ComponentFixture<InvoicesPage>;

async function render(
  role: 'owner' | 'billing' | 'admin' | 'orders' = 'owner',
): Promise<HTMLElement> {
  reads = [];
  archives = [];
  downloaded = [];
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:zip');
  vi.spyOn(URL, 'revokeObjectURL').mockReturnValue(undefined);
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    downloaded.push(this.download);
  });
  fixture = bootCard(
    InvoicesPage,
    [asRole(role, TOMMEUSES)],
    [
      {
        provide: ClientInvoices,
        useValue: {
          list: (_: string, filters: InvoiceFilters) => {
            reads.push(filters);
            return answer();
          },
          archive: (_: string, request: InvoiceArchiveRequest) => {
            archives.push(request);
            return archiveAnswer();
          },
          document: () => Promise.resolve(new Blob(['%PDF-'])),
        },
      },
    ],
  );
  await settle();
  return fixture.nativeElement as HTMLElement;
}

/** Laisse les promesses se résoudre et l'écran se redessiner. */
async function settle(): Promise<void> {
  for (let i = 0; i < 3; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    TestBed.tick();
  }
}

function text(el: HTMLElement, selector: string): string {
  return el.querySelector(selector)?.textContent?.replace(/\s+/gu, ' ').trim() ?? '';
}

afterEach(() => {
  TestBed.inject(FoldPanelHostService).dismissAll();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('InvoicesPage', () => {
  beforeEach(() => {
    answer = () => Promise.resolve(VIEW);
    archiveAnswer = () =>
      Promise.resolve({ fileName: 'factures-tommeuses-tout.zip', blob: new Blob(['PK']) });
  });

  it('dit le total dû, ses rejetées, qu’il ne suit pas les filtres, et les avoirs à part', async () => {
    const el = await render();

    expect(reads).toEqual([{ year: null, month: null, kind: null }]);
    expect(text(el, '[data-due-total]')).toMatch(/305,50\s€/u);
    expect(text(el, '[data-amount-due]')).toContain('2 factures à prélever');
    expect(text(el, '[data-due-rejected]')).toMatch(
      /dont 1 rejetée \(200,00\s€\) — à régulariser/u,
    );
    expect(text(el, '[data-amount-due]')).toContain('ce total ne suit pas les filtres');
    expect(text(el, '[data-credit-notes]')).toMatch(/1 avoir dans la liste : 10,55\s€/u);
  });

  it('montre chaque statut avec sa date et son ton, et le rejet partagé', async () => {
    const el = await render();

    const rejected = el.querySelector('[data-status="inv_0"]');
    expect(rejected?.textContent).toContain('Prélèvement rejeté — à régulariser le 20 sept. 2026');
    const badges = fixture.debugElement.queryAll(By.css('[data-status] fold-badge'));
    const tones = Object.fromEntries(
      badges.map((badge) => [
        (badge.parent?.nativeElement as HTMLElement).dataset['status'],
        (badge.componentInstance as { variant: () => string }).variant(),
      ]),
    );
    expect(tones).toEqual({ inv_1: 'info', inv_0: 'alert' });
    expect(rejected?.querySelector('[data-rejected-with]')?.textContent).toContain(
      'rejeté avec 2 autres factures du même prélèvement',
    );
    expect(text(el, '[data-status="inv_1"]')).toContain('Prélèvement prévu le 15 oct. 2026');
    expect(text(el, '[data-status="cn_1"]')).toBe('—');
  });

  it('relit la liste au serveur à chaque filtre ; sans année, le mois tombe', async () => {
    const el = await render();
    const [year, month, kind] = fixture.debugElement
      .queryAll(By.directive(FoldListboxComponent))
      .map((debug) => debug.componentInstance as FoldListboxComponent<unknown>);
    expect(text(el, '[data-filter-year]')).toContain(COPY.filterYear);
    expect(year?.options()?.map((option) => option.label)).toEqual(['Toutes', '2026']);
    expect(month?.disabled()).toBe(true);

    year?.selectionChange.emit(2026);
    await settle();
    month?.selectionChange.emit(9);
    await settle();
    kind?.selectionChange.emit('credit_note');
    await settle();
    year?.selectionChange.emit(null);
    await settle();

    expect(reads).toEqual([
      { year: null, month: null, kind: null },
      { year: 2026, month: null, kind: null },
      { year: 2026, month: 9, kind: null },
      { year: 2026, month: 9, kind: 'credit_note' },
      { year: null, month: null, kind: 'credit_note' },
    ]);
  });

  it('télécharge la sélection cochée, et rien tant que rien n’est coché', async () => {
    const el = await render();
    const button = el.querySelector<HTMLButtonElement>('[data-download-selection]');
    expect(button?.disabled).toBe(true);

    const table = fixture.debugElement.query(By.directive(FoldDataTableComponent))
      .componentInstance as FoldDataTableComponent<unknown>;
    table.selected.set(new Set(['inv_1', 'inv_0']));
    await settle();
    expect(button?.disabled).toBe(false);
    expect(button?.textContent).toContain('Télécharger la sélection (2)');

    button?.click();
    await settle();

    expect(archives).toEqual([{ ids: ['inv_1', 'inv_0'] }]);
    expect(downloaded).toEqual(['factures-tommeuses-tout.zip']);
  });

  it('en pile, la liste passe en cartes empilées', async () => {
    await render();
    const table = fixture.debugElement.query(By.directive(FoldDataTableComponent))
      .componentInstance as FoldDataTableComponent<unknown>;

    expect(table.narrowLayout()).toBe('cards');
    expect(table.selectable()).toBe(true);
  });

  it('un clic sur « Voir » ouvre le dialogue de la pièce', async () => {
    vi.stubGlobal('matchMedia', matchMediaAt(false));
    const el = await render();

    el.querySelector<HTMLButtonElement>('[data-open="inv_1"]')?.click();

    expect(openedPanel()?.component).toBe(InvoiceDialog);
    expect(openedPanel()?.data).toEqual({ companyId: 'cmp_1', invoiceId: 'inv_1' });
  });

  it('télécharge tout l’affiché en un zip nommé par le serveur', async () => {
    const el = await render();

    el.querySelector<HTMLButtonElement>('[data-download-shown]')?.click();
    await settle();

    expect(archives).toEqual([{ filters: { year: null, month: null, kind: null } }]);
    expect(downloaded).toEqual(['factures-tommeuses-tout.zip']);
  });

  it('un refus du zip s’affiche avec le message du serveur, et la liste reste', async () => {
    archiveAnswer = () =>
      Promise.reject(
        new InvoiceArchiveRefused('Le PDF de FA-LFD-2026-000007 n’est pas encore rendu.'),
      );
    const el = await render();

    el.querySelector<HTMLButtonElement>('[data-download-shown]')?.click();
    await settle();

    expect(text(el, '[data-invoices-problem]')).toBe(
      'Le PDF de FA-LFD-2026-000007 n’est pas encore rendu.',
    );
    expect(el.querySelector('[data-status="inv_1"]')).not.toBeNull();
  });

  it('sans message du serveur, le refus dit le sien', async () => {
    archiveAnswer = () => Promise.reject(new InvoiceArchiveRefused(null));
    const el = await render();

    el.querySelector<HTMLButtonElement>('[data-download-shown]')?.click();
    await settle();

    expect(text(el, '[data-invoices-problem]')).toBe(COPY.archiveFailed);
  });

  it('sans pièce, le dit ; en échec, ne le confond pas avec l’absence', async () => {
    answer = () =>
      Promise.resolve({
        invoices: [],
        amountDue: { totalCents: 0, invoiceCount: 0, rejectedCount: 0, rejectedCents: 0 },
      });
    let el = await render();
    expect(text(el, '[data-invoices-none]')).toContain(COPY.noneTitle);
    expect(text(el, '[data-amount-due]')).toContain(COPY.dueNothing);

    answer = () => Promise.reject(new Error('réseau'));
    el = await render();
    expect(text(el, '[data-invoices-failed]')).toContain(COPY.loadFailedTitle);
    expect(el.querySelector('[data-invoices-none]')).toBeNull();
  });

  it('lit les factures pour le détenteur, la facturation et l’administrateur', async () => {
    for (const role of ['owner', 'billing', 'admin'] as const) {
      const el = await render(role);
      expect(reads.length).toBe(1);
      expect(el.querySelector('[data-invoices-forbidden]')).toBeNull();
    }
  });

  it('à un rôle sans accès aux factures, le dit sans rien lire', async () => {
    const el = await render('orders');

    expect(reads).toEqual([]);
    expect(text(el, '[data-invoices-forbidden]')).toContain(COPY.forbiddenTitle);
  });
});

import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { CompanyOrderSummaryView } from '@lfd/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { NO_DAYS } from '../client-order-history.service';
import {
  type OrderSummaryFile,
  type OrderSummaryFileFormat,
  OrderSummaryRefused,
  type OrderSummarySelection,
  OrderSummaryService,
} from '../order-summary.service';
import { BOTTOM, SUMMARY } from '../order-summary.fixture';
import { OrderSummaryPanel } from './order-summary-panel';

const SELECTION: OrderSummarySelection = {
  companyId: 'co_1',
  orderIds: ['o1', 'o2', 'o9'],
  period: { from: '2026-10-01', to: '2026-10-15' },
};

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve));

let summarized: OrderSummarySelection[];
let files: { selection: OrderSummarySelection; format: OrderSummaryFileFormat }[];
let downloaded: string[];
let fixture: ComponentFixture<OrderSummaryPanel>;

async function boot(
  answer: () => Promise<CompanyOrderSummaryView>,
  fileAnswer: () => Promise<OrderSummaryFile> = () =>
    Promise.resolve({
      fileName: 'recapitulatif-maison-mere-2026-10-21.pdf',
      blob: new Blob(['%PDF']),
    }),
  selection: OrderSummarySelection = SELECTION,
): Promise<HTMLElement> {
  summarized = [];
  files = [];
  downloaded = [];
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:recap');
  vi.spyOn(URL, 'revokeObjectURL').mockReturnValue(undefined);
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    downloaded.push(this.download);
  });
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [OrderSummaryPanel],
    providers: [
      {
        provide: OrderSummaryService,
        useValue: {
          summarize: (asked: OrderSummarySelection) => {
            summarized.push(asked);
            return answer();
          },
          file: (asked: OrderSummarySelection, format: OrderSummaryFileFormat) => {
            files.push({ selection: asked, format });
            return fileAnswer();
          },
        },
      },
    ],
  });
  fixture = TestBed.createComponent(OrderSummaryPanel);
  fixture.componentRef.setInput('data', selection);
  fixture.detectChanges();
  await settle();
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

afterEach(() => {
  vi.restoreAllMocks();
});

const text = (host: HTMLElement): string => (host.textContent ?? '').replace(/\s+/gu, ' ');

describe('OrderSummaryPanel — le récapitulatif à l’écran (plan du récapitulatif, R3)', () => {
  it('demande la sélection au serveur et la dit comme une facture', async () => {
    const host = await boot(() => Promise.resolve(SUMMARY));

    expect(summarized).toEqual([SELECTION]);
    const shown = text(host);
    expect(shown).toContain('Retraits et livraisons du 1 octobre 2026 au 15 octobre 2026');
    expect(shown).toContain('Montants à la commande');
    expect(shown).toContain('Maison mère');
    expect(shown).toContain('VIE-001');
    expect(shown).toContain('Sous-total HT');
    expect(shown).toContain('-12,50 €');
    expect(shown).toContain('TVA 5,5 %');
    expect(shown).toContain('Total TTC');
    expect(shown).toContain('124,00 €');
    expect(shown).toContain('CMD-009 — annulée');
    // Un geste qui n'a pas eu lieu est tu, comme au PDF.
    expect(shown).not.toContain('Bons de fidélité');
  });

  it('une seule société : le total général ne répète pas ses produits', async () => {
    const host = await boot(() => Promise.resolve(SUMMARY));
    const total = host.querySelector('[data-summary-block="total"]');
    expect(total?.textContent).toContain('Total général');
    expect(total?.querySelector('fold-data-table')).toBeNull();
  });

  it('plusieurs sociétés : une table chacune, et le total avec ses produits', async () => {
    const site = {
      companyId: 'co_2',
      name: 'Site Est',
      orderCount: 1,
      products: [{ sku: 'VIE-002', name: 'Pain au chocolat', quantity: 6, htCents: 600 }],
      bottom: BOTTOM,
    };
    const host = await boot(() =>
      Promise.resolve({ ...SUMMARY, companies: [...SUMMARY.companies, site] }),
    );
    expect(host.querySelector('[data-summary-block="co_2"]')).not.toBeNull();
    expect(host.querySelector('[data-summary-block="total"] fold-data-table')).not.toBeNull();
  });

  it('un refus du serveur s’affiche avec SON message', async () => {
    const host = await boot(() =>
      Promise.reject(new OrderSummaryRefused('Commandes introuvables : o9.')),
    );
    expect(host.querySelector('[data-summary-refused]')?.textContent?.trim()).toBe(
      'Commandes introuvables : o9.',
    );
  });

  it('sans période, le sous-titre dit la taille de la sélection', async () => {
    const host = await boot(() => Promise.resolve(SUMMARY), undefined, {
      ...SELECTION,
      period: NO_DAYS,
    });
    expect(text(host)).toContain('Sélection de 3 commandes');
  });

  it('PDF et Tableur renvoient la même sélection, et prennent le nom du serveur', async () => {
    const host = await boot(() => Promise.resolve(SUMMARY));

    host.querySelector<HTMLButtonElement>('[data-summary-pdf]')?.click();
    await settle();
    host.querySelector<HTMLButtonElement>('[data-summary-csv]')?.click();
    await settle();

    expect(files).toEqual([
      { selection: SELECTION, format: 'pdf' },
      { selection: SELECTION, format: 'csv' },
    ]);
    expect(downloaded).toEqual([
      'recapitulatif-maison-mere-2026-10-21.pdf',
      'recapitulatif-maison-mere-2026-10-21.pdf',
    ]);
  });

  it('un export refusé le dit dans le panneau, le récapitulatif reste', async () => {
    const host = await boot(
      () => Promise.resolve(SUMMARY),
      () => Promise.reject(new OrderSummaryRefused('Au plus 200 commandes.')),
    );
    host.querySelector<HTMLButtonElement>('[data-summary-csv]')?.click();
    await settle();
    fixture.detectChanges();

    expect(host.querySelector('[data-summary-export-refused]')?.textContent?.trim()).toBe(
      'Au plus 200 commandes.',
    );
    expect(host.querySelector('[data-summary-block="co_1"]')).not.toBeNull();
    expect(downloaded).toEqual([]);
  });
});

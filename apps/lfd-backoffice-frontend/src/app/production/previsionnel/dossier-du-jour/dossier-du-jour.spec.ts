import { HttpErrorResponse } from '@angular/common/http';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type {
  AtelierSheet,
  ProductionBatchView,
  ProductionDayResuppliesView,
} from '@lfd/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminCatalogService } from '../../../commandes/catalog.service';
import { ProductionService } from '../../production.service';
import { DossierDuJour } from './dossier-du-jour';

/**
 * **Le tirage du dossier** (2026-10-06) : le bouton ouvre le PDF figé du
 * serveur dans un onglet, au lieu de `window.print()` sur l'écran.
 */

/** Une commande d'atelier, figée : ses dates ne sont comparées à aucune horloge. */
const SHEET: AtelierSheet = {
  orderId: 'ord_1',
  reference: 'CMD-1',
  audience: 'atelier',
  customer: { tradeName: 'Café des Halles', legalName: 'Café des Halles SAS' },
  placedAt: '2026-09-07T04:00:00.000Z',
  requestedFor: '2026-09-08',
  fulfillment: {
    method: 'pickup',
    address: null,
    pickupLabel: null,
    window: null,
    contact: null,
    signatureRequired: false,
  },
  note: '',
  origin: 'self_service',
  issuedAt: '2026-09-07T04:00:00.000Z',
  revision: 0,
  lines: [{ sku: 'CRO', productName: 'Croissant', quantity: 12 }],
};

interface Doubles {
  readonly dossierPdf: ReturnType<typeof vi.fn>;
}

async function render(
  dossierPdf: () => Promise<Blob>,
  closed: boolean | null = null,
  day: { sheets?: readonly AtelierSheet[]; resupplies?: ProductionDayResuppliesView } = {},
): Promise<{ fixture: ComponentFixture<DossierDuJour>; doubles: Doubles }> {
  const doubles = { dossierPdf: vi.fn(dossierPdf) };
  const batch = async (date: string): Promise<ProductionBatchView> => ({
    date,
    sheets: day.sheets ?? [SHEET],
  });
  const dayResupplies = async (date: string): Promise<ProductionDayResuppliesView> =>
    day.resupplies ?? { date, frozen: false, resupplies: [] };
  TestBed.configureTestingModule({
    providers: [
      {
        provide: ProductionService,
        useValue: {
          batch,
          dayResupplies,
          dossierPdf: doubles.dossierPdf,
          dueThresholds: async () => ({ date: '', lines: [] }),
        },
      },
      { provide: AdminCatalogService, useValue: { list: async () => [] } },
    ],
  });
  const fixture = TestBed.createComponent(DossierDuJour);
  fixture.componentRef.setInput('closed', closed);
  fixture.detectChanges();
  await fixture.componentInstance['load']();
  fixture.detectChanges();
  if (fixture.componentInstance['state']() !== 'ready') {
    throw new Error(`lot non prêt : ${fixture.componentInstance['state']()}`);
  }
  return { fixture, doubles };
}

function printButton(el: HTMLElement): HTMLButtonElement {
  const button = el.querySelector<HTMLButtonElement>('button.pr-print');
  if (button === null) {
    throw new Error('bouton de tirage absent');
  }
  return button;
}

async function settle(fixture: ComponentFixture<DossierDuJour>): Promise<void> {
  await fixture.whenStable();
  fixture.detectChanges();
}

describe('le tirage du dossier', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:dossier');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('télécharge le PDF de la journée et l’ouvre dans un onglet', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue({} as Window);
    const { fixture, doubles } = await render(async () => new Blob(['%PDF']), true);
    const el = fixture.nativeElement as HTMLElement;

    printButton(el).click();
    await settle(fixture);

    expect(doubles.dossierPdf).toHaveBeenCalledWith(fixture.componentInstance.date());
    expect(open).toHaveBeenCalledWith('blob:dossier', '_blank');
    expect(el.querySelector('.pr-pdf-blocked')).toBeNull();
  });

  it('désactive le bouton et dit pourquoi quand le plan n’est pas arrêté', async () => {
    const { fixture } = await render(async () => new Blob(), false);
    const button = printButton(fixture.nativeElement as HTMLElement);

    expect(button.disabled).toBe(true);
    expect(button.textContent).toContain('Arrêtez d’abord le plan du');
    expect(button.textContent).toContain('pour tirer le dossier');
  });

  it('se désactive sur un refus 409 quand l’arrêt n’était pas connu', async () => {
    const { fixture } = await render(async () => {
      throw new HttpErrorResponse({ status: 409 });
    });
    const el = fixture.nativeElement as HTMLElement;

    printButton(el).click();
    await settle(fixture);

    expect(printButton(el).disabled).toBe(true);
    expect(printButton(el).textContent).toContain('Arrêtez d’abord le plan du');
    expect(el.querySelector('.pr-pdf-failed')).toBeNull();
  });

  it('propose un lien de téléchargement quand l’onglet est bloqué', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    const { fixture } = await render(async () => new Blob(['%PDF']), true);
    const el = fixture.nativeElement as HTMLElement;

    printButton(el).click();
    await settle(fixture);

    const link = el.querySelector<HTMLAnchorElement>('.pr-pdf-blocked a');
    expect(link?.getAttribute('href')).toBe('blob:dossier');
    expect(link?.hasAttribute('download')).toBe(true);
  });

  it('affiche une erreur réseau dans un encadré', async () => {
    const { fixture } = await render(async () => {
      throw new HttpErrorResponse({ status: 0 });
    }, true);
    const el = fixture.nativeElement as HTMLElement;

    printButton(el).click();
    await settle(fixture);

    expect(el.querySelector('fold-callout.pr-pdf-failed')).not.toBeNull();
    expect(printButton(el).disabled).toBe(false);
  });
});

/** Lot R3d : ce que le prévisionnel compte en réassorts se retrouve au dossier. */
describe('les réassorts au dossier', () => {
  beforeEach(() => TestBed.resetTestingModule());

  const VILLAGE = (frozen: boolean): ProductionDayResuppliesView => ({
    date: '',
    frozen,
    resupplies: [
      {
        resupplyId: 'r-1',
        siteId: 'site-v',
        siteLabel: 'Village',
        servedByTransfer: true,
        lines: [{ sku: 'PAC', productName: 'Pain au chocolat', quantity: 18 }],
      },
    ],
  });

  it('montre une journée à réassorts seuls, comptés à part, sans changer le nombre de commandes', async () => {
    const { fixture } = await render(async () => new Blob(), false, {
      sheets: [],
      resupplies: VILLAGE(false),
    });
    const el = fixture.nativeElement as HTMLElement;

    expect(el.textContent).not.toContain('Rien à produire ce jour-là');
    expect(el.querySelector('.pr-count')?.textContent).toContain('0 commande');
    expect(el.querySelector('.pr-count-resupply')?.textContent).toContain(
      '+ 18 pièces de réassort',
    );
    expect(el.querySelector('.pr-resupplies')?.textContent).toContain('Réassort Village');
    expect(el.querySelector('.pr-resupplies-live')).not.toBeNull();
  });

  it('ne dit plus « envoyés » sur une journée arrêtée : ce sont les réassorts figés', async () => {
    const { fixture } = await render(async () => new Blob(), true, { resupplies: VILLAGE(true) });
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('.pr-count')?.textContent).toContain('1 commande');
    expect(el.querySelector('.pr-resupplies')?.textContent).toContain('Pain au chocolat');
    expect(el.querySelector('.pr-resupplies-live')).toBeNull();
  });
});

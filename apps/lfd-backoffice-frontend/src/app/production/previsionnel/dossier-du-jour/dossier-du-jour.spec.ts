import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type {
  AtelierSheet,
  ProductionBatchView,
  ProductionDayResuppliesView,
} from '@lfd/contracts';
import { FoldPanelHostService } from 'fold-ng';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WorkstationsService } from '../../workstations.service';
import { shelfGrouping } from '../../__tests__/shelf-grouping-fixture';
import { ProductionService } from '../../production.service';
import { DossierDuJour } from './dossier-du-jour';
import type { DossierPrintDialogData } from './dossier-print-dialog/dossier-print-dialog';

/**
 * **Le tirage du dossier** : le bouton ouvre la fenêtre d'impression, et
 * l'écran ouvre dans un onglet le PDF qu'elle lui rend.
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
  readonly opened: { readonly data: DossierPrintDialogData }[];
}

async function render(
  day: { sheets?: readonly AtelierSheet[]; resupplies?: ProductionDayResuppliesView } = {},
): Promise<{ fixture: ComponentFixture<DossierDuJour>; doubles: Doubles }> {
  const doubles: Doubles = { opened: [] };
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
          dueThresholds: async () => ({
            date: '',
            trancheMode: 'computed',
            fixedTranches: [],
            lines: [],
          }),
        },
      },
      {
        provide: WorkstationsService,
        useValue: { grouping: async (skus: readonly string[]) => shelfGrouping(skus, []) },
      },
      {
        provide: FoldPanelHostService,
        useValue: {
          open: (_component: unknown, config: { readonly data: DossierPrintDialogData }) => {
            doubles.opened.push(config);
          },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(DossierDuJour);
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

describe('le tirage du dossier', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:dossier');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('ouvre la fenêtre d’impression de la journée affichée, même plan non arrêté', async () => {
    const { fixture, doubles } = await render();
    const el = fixture.nativeElement as HTMLElement;

    expect(printButton(el).disabled).toBe(false);
    printButton(el).click();

    expect(doubles.opened).toHaveLength(1);
    expect(doubles.opened[0]?.data.date).toBe(fixture.componentInstance.date());
  });

  it('ouvre le PDF rendu par la fenêtre dans un onglet', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue({} as Window);
    const { fixture, doubles } = await render();
    printButton(fixture.nativeElement as HTMLElement).click();

    const blocked = doubles.opened[0]?.data.present(new Blob(['%PDF']));

    expect(open).toHaveBeenCalledWith('blob:dossier', '_blank');
    expect(blocked).toBeNull();
  });

  it('rend l’URL à télécharger quand l’onglet est bloqué, et révoque la précédente', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    const { fixture, doubles } = await render();
    printButton(fixture.nativeElement as HTMLElement).click();
    const present = doubles.opened[0]?.data.present;

    expect(present?.(new Blob(['%PDF']))).toBe('blob:dossier');
    present?.(new Blob(['%PDF']));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:dossier');
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
        name: null,
        servedByTransfer: true,
        lines: [
          { sku: 'PAC', productName: 'Pain au chocolat', quantity: 18, saleUnit: 'piece' as const },
        ],
      },
    ],
  });

  it('montre une journée à réassorts seuls : comptés dans le total, nombre de commandes inchangé', async () => {
    const { fixture } = await render({
      sheets: [],
      resupplies: VILLAGE(false),
    });
    const el = fixture.nativeElement as HTMLElement;

    expect(el.textContent).not.toContain('Rien à produire ce jour-là');
    expect(el.querySelector('.pr-count')?.textContent).toContain('0 commande');
    expect(el.querySelector('.pr-count')?.textContent).toContain('18 pièces');
    expect(el.querySelector('.pr-count-resupply')?.textContent).toContain('dont 18 de réassort');
    expect(el.querySelector('.pr-resupplies-live')).not.toBeNull();
  });

  /**
   * Régression R3d-bis : la fiche de poste ne comptait pas le réassort d'une
   * journée arrêtée (Hugo, 2026-10-21) — il était dans une section à part.
   */
  it('compte le réassort sur la fiche de poste, total d’abord, et lui donne son bon', async () => {
    const { fixture } = await render({ resupplies: VILLAGE(true) });
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('.pr-count')?.textContent).toContain('1 commande');
    const rows = [...el.querySelectorAll('.pr-table tr')].map((row) => row.textContent ?? '');
    const chocolat = rows.find((row) => row.includes('Pain au chocolat')) ?? '';
    expect(chocolat).toContain('18');
    expect(chocolat).toContain('dont 18 réassort');
    expect(el.querySelector('.pr-resupplies-live')).toBeNull();
    const bon = el.querySelector('app-bon-reassort');
    expect(bon?.textContent).toContain('Réassort Village');
    expect(bon?.textContent).toContain('réassort 1/1');
    expect(bon?.textContent).not.toContain('€');
  });
});

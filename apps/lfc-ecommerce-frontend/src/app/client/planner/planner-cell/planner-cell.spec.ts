import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { PlannedColumnView, PlannedLineCheckView, ShopItemView } from '@lfd/contracts';

import { plannerCopy } from '../../copy/screens/planner.copy';
import { ShopCatalogue } from '../../shop/shop-catalogue.store';
import type { CellTotal } from '../planner-board.store';
import { cellOfColumn } from '../planner-grid';
import { lineCheck, plannedColumn } from '../planner.fixture';
import { PlannerCellComponent, type PlannerTarget } from './planner-cell';

const COPY = plannerCopy('fr');
const ITEMS: Readonly<Record<string, Partial<ShopItemView>>> = {
  'VIE-001': { sku: 'VIE-001', name: 'Croissant', minQuantity: 6 },
};

let fixture: ComponentFixture<PlannerCellComponent>;
const el = (): HTMLElement => fixture.nativeElement as HTMLElement;

interface Render {
  readonly column?: PlannedColumnView;
  readonly checks?: readonly PlannedLineCheckView[];
  readonly total?: CellTotal;
  readonly editable?: boolean;
  readonly targets?: readonly PlannerTarget[];
  readonly dropState?: string | null;
}

function render(options: Render = {}): void {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [PlannerCellComponent],
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: ShopCatalogue, useValue: { itemOf: (sku: string) => ITEMS[sku] ?? null } },
    ],
  });
  fixture = TestBed.createComponent(PlannerCellComponent);
  fixture.componentRef.setInput('cell', cellOfColumn(options.column ?? plannedColumn()));
  fixture.componentRef.setInput('label', 'mar. 4 mars, 7 h – 9 h');
  fixture.componentRef.setInput('checks', options.checks ?? []);
  fixture.componentRef.setInput('total', options.total);
  fixture.componentRef.setInput('editable', options.editable ?? true);
  fixture.componentRef.setInput('targetsFor', () => options.targets ?? []);
  fixture.componentRef.setInput('dropState', options.dropState ?? null);
  fixture.detectChanges();
}

describe('PlannerCellComponent', () => {
  it('montre le total HT du devis, marqué indicatif', () => {
    render({ total: 8420 });

    expect(el().textContent).toContain('84,20 € HT');
    expect(el().textContent).toContain(COPY.indicative);
  });

  it('une ligne qui bloquerait la commande est en avertissement, avec la phrase du refus', () => {
    render({
      checks: [
        lineCheck({
          columnId: 'col_1',
          blocking: { cause: 'deadline_closed', reason: 'Commandes fermées depuis mar. 10 h.' },
        }),
      ],
    });

    const line = el().querySelector('[data-planner-line="VIE-001"]');
    expect(line?.classList).toContain('is-blocking');
    expect(el().querySelector('[data-planner-blocking]')?.textContent).toContain(
      'Commandes fermées depuis mar. 10 h.',
    );
    expect(el().querySelector('[data-planner-blocking-count]')?.textContent).toContain(
      COPY.blockingOne,
    );
  });

  it('« − » à la quantité minimale retire la ligne entière', () => {
    render({ column: plannedColumn({ lines: [{ sku: 'VIE-001', quantity: 6 }] }) });
    const changes: { sku: string; quantity: number }[] = [];
    fixture.componentInstance.quantityChange.subscribe((change) => changes.push(change));

    el().querySelector<HTMLButtonElement>(`fold-button-icon[icon="minus"] button`)?.click();

    expect(changes).toEqual([{ sku: 'VIE-001', quantity: 0 }]);
  });

  it('« ＋ » ajoute un pas de l’article', () => {
    render({ column: plannedColumn({ lines: [{ sku: 'VIE-001', quantity: 6 }] }) });
    const changes: { sku: string; quantity: number }[] = [];
    fixture.componentInstance.quantityChange.subscribe((change) => changes.push(change));

    el().querySelector<HTMLButtonElement>(`fold-button-icon[icon="plus"] button`)?.click();

    expect(changes).toEqual([{ sku: 'VIE-001', quantity: 7 }]);
  });

  it('pendant un glisser, une case refusée dit pourquoi et ne prend pas le dépôt', () => {
    render({ dropState: 'Pas commandable ce jour-là.' });
    const drops: number[] = [];
    fixture.componentInstance.dropped.subscribe(() => drops.push(1));

    expect(el().querySelector('[data-planner-drop-refusal]')?.textContent).toContain(
      'Pas commandable ce jour-là.',
    );
    el()
      .querySelector('[data-planner-cell]')
      ?.dispatchEvent(new Event('drop', { cancelable: true }));
    expect(drops).toEqual([]);
  });

  it('une case qui accepte prend le dépôt', () => {
    render({ dropState: '' });
    const drops: number[] = [];
    fixture.componentInstance.dropped.subscribe(() => drops.push(1));

    el()
      .querySelector('[data-planner-cell]')
      ?.dispatchEvent(new Event('drop', { cancelable: true }));

    expect(drops).toEqual([1]);
  });

  it('une case commandée le dit et mène à sa commande, sans geste d’édition', () => {
    render({
      column: plannedColumn({ status: 'placed', orderId: 'ord_42' }),
      editable: false,
    });

    expect(el().querySelector('[data-planner-state]')?.textContent).toContain(COPY.states.placed);
    expect(el().querySelector('a')?.getAttribute('href')).toBe('/mes-commandes/ord_42');
    expect(el().querySelector('fold-button-icon')).toBeNull();
  });

  it('une case gelée mais pas encore commandée dit de modifier la commande', () => {
    render({ editable: false });

    expect(el().querySelector('[data-planner-converts]')?.textContent).toContain(COPY.frozen);
  });
});

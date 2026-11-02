import { TestBed } from '@angular/core/testing';
import type { ResupplyArticleView } from '@lfd/contracts';
import { FoldPanelHostService } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { BakehouseQuantityStepper } from './bakehouse-quantity-stepper';

/** La case d'un article du réassort du fournil : les pas, et le dialogue en mobile. */
const CROISSANT: ResupplyArticleView = {
  sku: 'CRO',
  name: 'Croissant',
  categoryId: 'm',
  categoryName: 'Viennoiseries',
  saleUnit: 'piece',
};

class FakePanels {
  readonly asked: unknown[] = [];
  answer: number | undefined = 7;
  open(_component: unknown, config: { data: unknown }) {
    this.asked.push(config.data);
    return { closed: Promise.resolve(this.answer) };
  }
}

function mount(quantity: number | null, phone = false) {
  const panels = new FakePanels();
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [BakehouseQuantityStepper],
    providers: [{ provide: FoldPanelHostService, useValue: panels }],
  });
  const fixture = TestBed.createComponent(BakehouseQuantityStepper);
  fixture.componentRef.setInput('article', CROISSANT);
  fixture.componentRef.setInput('quantity', quantity);
  fixture.componentRef.setInput('phone', phone);
  fixture.detectChanges();
  const emitted: (number | null)[] = [];
  fixture.componentInstance.quantityChange.subscribe((value) => emitted.push(value));
  return { fixture, stepper: fixture.componentInstance, panels, emitted };
}

describe('BakehouseQuantityStepper', () => {
  it('un pas ajoute ou retire, sans descendre sous zéro', () => {
    const { stepper, emitted } = mount(3);
    stepper.step(10);
    stepper.step(-5);
    expect(emitted).toEqual([13, 0]);
  });

  it('en mobile, toucher la case ouvre le dialogue et rend sa quantité', async () => {
    const { fixture, panels, emitted } = mount(null, true);
    (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('.cell')?.click();
    await fixture.whenStable();
    expect(panels.asked).toEqual([{ label: 'Croissant', quantity: null, saleUnit: 'piece' }]);
    expect(emitted).toEqual([7]);
  });

  it('au bureau, la case se saisit sur place : aucun dialogue', () => {
    const { fixture, panels } = mount(null);
    (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('.cell')?.click();
    expect(panels.asked).toEqual([]);
  });
});

import { TestBed } from '@angular/core/testing';
import { FoldPanelRef } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { QuantityDialog } from './quantity-dialog';

/** Le dialogue de la quantité en mobile (Hugo, 2026-10-28). */
describe('QuantityDialog', () => {
  function mount(quantity: number | null) {
    const closed: (number | undefined)[] = [];
    TestBed.configureTestingModule({
      imports: [QuantityDialog],
      providers: [
        { provide: FoldPanelRef, useValue: { close: (value?: number) => closed.push(value) } },
      ],
    });
    const fixture = TestBed.createComponent(QuantityDialog);
    fixture.componentRef.setInput('data', { label: 'Croissant', quantity });
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const press = (step: number): void => {
      root.querySelector<HTMLButtonElement>(`[data-quantity-step="${String(step)}"]`)?.click();
      fixture.detectChanges();
    };
    const submit = (): void => {
      root.querySelector<HTMLButtonElement>('[data-quantity-submit]')?.click();
    };
    return { closed, press, submit };
  }

  it('part de la quantité saisie, ajoute et retire par les pas, et rend le total validé', () => {
    const { closed, press, submit } = mount(20);

    press(100);
    press(-10);
    submit();

    expect(closed).toEqual([110]);
  });

  it('ne descend pas sous zéro : zéro retire l’article', () => {
    const { closed, press, submit } = mount(5);

    press(-50);
    submit();

    expect(closed).toEqual([0]);
  });
});

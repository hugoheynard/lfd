import { TestBed } from '@angular/core/testing';
import { FoldPanelRef } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { QuantityDialog } from './quantity-dialog';

/** Le dialogue de la quantité en mobile (Hugo, 2026-10-28). */
describe('QuantityDialog', () => {
  function mount(quantity: number | null, saleUnit?: 'piece' | 'weight') {
    const closed: (number | undefined)[] = [];
    TestBed.configureTestingModule({
      imports: [QuantityDialog],
      providers: [
        { provide: FoldPanelRef, useValue: { close: (value?: number) => closed.push(value) } },
      ],
    });
    const fixture = TestBed.createComponent(QuantityDialog);
    fixture.componentRef.setInput('data', { label: 'Croissant', quantity, saleUnit });
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const press = (step: number): void => {
      root.querySelector<HTMLButtonElement>(`[data-quantity-step="${String(step)}"]`)?.click();
      fixture.detectChanges();
    };
    const submit = (): void => {
      root.querySelector<HTMLButtonElement>('[data-quantity-submit]')?.click();
    };
    return { closed, press, submit, root };
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

  it('au poids, saisit des grammes, les relit « 1,25 kg » et ne propose pas les pas de pièces (L2b-4)', () => {
    const { closed, submit, root } = mount(1250, 'weight');

    expect(root.querySelector('[data-quantity-step="10"]')).toBeNull();
    expect(root.textContent).toContain('Quantité en grammes');
    expect(root.textContent).toContain('1,25 kg');
    submit();

    expect(closed).toEqual([1250]);
  });

  it('au poids, ajoute et retire par pas de 100 g, 500 g et 1 kg, dits en grammes et kilos', () => {
    const { closed, press, submit, root } = mount(1250, 'weight');

    expect(root.querySelector('[data-quantity-step="1000"]')?.textContent?.trim()).toBe('+1 kg');
    expect(root.querySelector('[data-quantity-step="-500"]')?.textContent?.trim()).toBe('−500 g');
    press(1000);
    press(-100);
    submit();

    expect(closed).toEqual([2150]);
  });
});

import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { ORDER_SUMMARY_MAX_ORDERS } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { FR } from '../../copy/fr';
import { OrderSelectionBar } from './order-selection-bar';

describe('OrderSelectionBar — la sélection et son plafond (plan du récapitulatif, R3)', () => {
  let fixture: ComponentFixture<OrderSelectionBar>;
  let asked: number;

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const button = (): HTMLButtonElement => {
    const found = el().querySelector<HTMLButtonElement>('[data-summarize]');
    if (found === null) {
      throw new Error('Pas de bouton « Récapitulatif ».');
    }
    return found;
  };

  function boot(count: number): void {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [OrderSelectionBar] });
    fixture = TestBed.createComponent(OrderSelectionBar);
    fixture.componentRef.setInput('count', count);
    asked = 0;
    fixture.componentInstance.summarize.subscribe(() => asked++);
    fixture.detectChanges();
  }

  it('rien de coché : le compteur le dit, le bouton est gris', () => {
    boot(0);
    expect(el().querySelector('[data-selection-count]')?.textContent?.trim()).toBe(
      FR.orders.summary.selectedNone,
    );
    expect(button().disabled).toBe(true);
  });

  it('compte, dit le plafond avant qu’on l’atteigne, et demande le récapitulatif', () => {
    boot(3);
    expect(el().querySelector('[data-selection-count]')?.textContent?.trim()).toBe(
      '3 sélectionnées',
    );
    expect(el().querySelector('[data-selection-hint]')?.textContent).toContain(
      String(ORDER_SUMMARY_MAX_ORDERS),
    );
    button().click();
    expect(asked).toBe(1);
  });

  it('au-delà du plafond : le bouton se grise et la barre dit combien retirer', () => {
    boot(ORDER_SUMMARY_MAX_ORDERS + 5);
    expect(button().disabled).toBe(true);
    expect(el().querySelector('[data-selection-cap]')?.textContent?.trim()).toBe(
      `Le récapitulatif porte au plus ${String(ORDER_SUMMARY_MAX_ORDERS)} commandes : retirez-en 5.`,
    );
  });

  it('pile au plafond, on peut encore envoyer', () => {
    boot(ORDER_SUMMARY_MAX_ORDERS);
    expect(button().disabled).toBe(false);
    expect(el().querySelector('[data-selection-cap]')).toBeNull();
  });
});

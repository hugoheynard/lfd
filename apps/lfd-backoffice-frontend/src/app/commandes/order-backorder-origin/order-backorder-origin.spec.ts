import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { AdminBackorderOriginView } from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { OrderBackorderOrigin } from './order-backorder-origin';

function mount(origin: AdminBackorderOriginView | null): HTMLElement {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(OrderBackorderOrigin);
  fixture.componentRef.setInput('origin', origin);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('OrderBackorderOrigin — la commande issue d’un reliquat', () => {
  it('dit « Issue du reliquat de ORD-… » et mène à la commande d’origine', () => {
    const el = mount({
      backorderId: 'bo_1',
      origin: { orderId: 'ord_1', orderNumber: 'ORD-0042' },
    });
    expect((el.textContent ?? '').replace(/\s+/gu, ' ')).toContain('Issue du reliquat de ORD-0042');
    expect(el.querySelector('[data-backorder-origin-link]')?.getAttribute('href')).toBe(
      '/commandes/ord_1',
    );
  });

  it('ne dit rien pour une commande ordinaire', () => {
    expect(mount(null).querySelector('[data-backorder-origin]')).toBeNull();
  });
});

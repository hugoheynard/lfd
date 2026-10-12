import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import type { OrderHeader } from '../order-header';
import { OrderDetailHeaderComponent } from './order-detail-header';

function render(header: OrderHeader): HTMLElement {
  const fixture = TestBed.createComponent(OrderDetailHeaderComponent);
  fixture.componentRef.setInput('header', header);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

const PRO: OrderHeader = {
  number: 'CMD-0042',
  subtitle: 'Retrait le 12/10/2026 — Les Halles',
  clientele: { label: 'Pro', variant: 'info' },
};

describe('OrderDetailHeaderComponent', () => {
  it("met le badge en TÊTE de la ligne du mode, et non dans l'action à droite du titre", () => {
    const el = render(PRO);
    expect(el.querySelector('[titleAction]')).toBeNull();
    const badge = el.querySelector('[data-order-clientele]');
    const subtitle = el.querySelector('[data-order-subtitle]');
    expect(badge?.parentElement).toBe(subtitle?.parentElement);
    expect(badge?.nextElementSibling).toBe(subtitle);
    expect(badge?.textContent).toContain('Pro');
    expect(subtitle?.textContent).toContain('Retrait le 12/10/2026');
  });

  it('nomme la référence en titre', () => {
    expect(render(PRO).querySelector('fold-element-title')?.textContent).toContain('CMD-0042');
  });

  it("sans clientèle connue, aucun badge n'est deviné", () => {
    const el = render({ ...PRO, clientele: null });
    expect(el.querySelector('[data-order-clientele]')).toBeNull();
    expect(el.querySelector('[data-order-subtitle]')?.textContent).toContain('Les Halles');
  });
});

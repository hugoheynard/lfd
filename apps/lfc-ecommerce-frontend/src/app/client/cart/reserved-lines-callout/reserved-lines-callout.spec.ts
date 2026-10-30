import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ShopItemView } from '@lfd/contracts';
import { describe, expect, it, vi } from 'vitest';

import { LOCKED_ITEM } from '../../shop/shop-catalogue.fixture';
import { ClientCart } from '../client-cart.service';
import { ReservedLinesCallout } from './reserved-lines-callout';

/** `plan-articles-sur-mesure.md`, L3 : la ligne gardée qu'on ne peut plus commander. */
function render(items: readonly ShopItemView[]): {
  host: HTMLElement;
  dropReserved: ReturnType<typeof vi.fn>;
} {
  const dropReserved = vi.fn();
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [{ provide: ClientCart, useValue: { reservedLines: signal(items), dropReserved } }],
  });
  const fixture = TestBed.createComponent(ReservedLinesCallout);
  fixture.detectChanges();
  return { host: fixture.nativeElement as HTMLElement, dropReserved };
}

describe('ReservedLinesCallout', () => {
  it('dit, article par article, qu’il est réservé à un autre compte et ne sera pas commandé', () => {
    const { host } = render([LOCKED_ITEM]);

    const said = [...host.querySelectorAll('[data-reserved-line]')].map((node) =>
      node.textContent?.trim(),
    );
    expect(said).toEqual([
      'L’article Entremets sur mesure est réservé à un autre compte : il ne sera pas commandé.',
    ]);
  });

  it('s’annonce au lecteur d’écran', () => {
    const { host } = render([LOCKED_ITEM]);

    expect(host.querySelector('fold-callout')?.getAttribute('role')).not.toBeNull();
  });

  it('retire les lignes au bouton', () => {
    const { host, dropReserved } = render([LOCKED_ITEM]);

    host.querySelector<HTMLButtonElement>('button')?.click();
    expect(dropReserved).toHaveBeenCalledTimes(1);
  });

  it('ne montre rien sans ligne verrouillée', () => {
    expect(render([]).host.querySelector('fold-callout')).toBeNull();
  });
});

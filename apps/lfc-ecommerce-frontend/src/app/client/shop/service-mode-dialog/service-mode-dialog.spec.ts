import { TestBed } from '@angular/core/testing';
import { FoldPanelRef } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { ServiceModeDialog, type ServiceMode } from './service-mode-dialog';

function boot(): { readonly el: HTMLElement; readonly closed: (ServiceMode | undefined)[] } {
  const closed: (ServiceMode | undefined)[] = [];
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [ServiceModeDialog],
    providers: [
      {
        provide: FoldPanelRef,
        useValue: { close: (v: ServiceMode | undefined) => closed.push(v) },
      },
    ],
  });
  const fixture = TestBed.createComponent(ServiceModeDialog);
  fixture.detectChanges();
  return { el: fixture.nativeElement as HTMLElement, closed };
}

describe('ServiceModeDialog', () => {
  /**
   * Régression (Hugo, 2026-10-13, O6) : un pro entré par la boutique ne se
   * voyait proposer que le retrait. Les deux portes de l'accueil, ici.
   */
  it('propose le retrait et le coursier, et rend la porte choisie', () => {
    const { el, closed } = boot();

    el.querySelector<HTMLButtonElement>('.door-courier')?.click();
    el.querySelector<HTMLButtonElement>('.door-pickup')?.click();

    expect(closed).toEqual(['delivery', 'pickup']);
  });
});

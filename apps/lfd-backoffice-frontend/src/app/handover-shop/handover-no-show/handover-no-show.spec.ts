import { HttpErrorResponse } from '@angular/common/http';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { StaffPermission } from '@lfd/contracts';
import { describe, expect, it, vi } from 'vitest';

import { PermissionsStore } from '../../auth/permissions.store';
import { CounterParticularsService } from '../../comptoir/counter-particulars.service';
import { HandoverNoShow } from './handover-no-show';

const COUNTER: readonly StaffPermission[] = ['b2b_place_order:write'];

function mount(
  granted: readonly StaffPermission[],
  declareNoShow = vi.fn(() => Promise.resolve()),
) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: CounterParticularsService, useValue: { declareNoShow } },
      { provide: PermissionsStore, useValue: { can: (p: StaffPermission) => granted.includes(p) } },
    ],
  });
  const fixture = TestBed.createComponent(HandoverNoShow);
  fixture.componentRef.setInput('orderId', 'o1');
  let declared = 0;
  fixture.componentInstance.declared.subscribe(() => (declared += 1));
  fixture.detectChanges();
  return { fixture, declareNoShow, declared: () => declared };
}

const el = (f: ComponentFixture<HandoverNoShow>) => f.nativeElement as HTMLElement;

describe('HandoverNoShow — le client n’est pas venu, au retrait', () => {
  it('se propose sous le droit de passation, et se tait sans lui', () => {
    expect(el(mount(COUNTER).fixture).querySelector('[data-no-show-declare]')).not.toBeNull();
    expect(el(mount([]).fixture).querySelector('[data-no-show-declare]')).toBeNull();
  });

  it('déclare sous une clé d’intention, puis le dit à son parent', async () => {
    const { fixture, declareNoShow, declared } = mount(COUNTER);
    await fixture.componentInstance['declare']();
    expect(declareNoShow).toHaveBeenCalledWith('o1', expect.any(String));
    expect(declared()).toBe(1);
  });

  it('affiche tel quel le refus « trop tôt » du serveur, sans rien dire au parent', async () => {
    const tooEarly = new HttpErrorResponse({
      status: 409,
      error: { code: 'orders.no_show.too_early', message: 'Le créneau n’est pas fini.' },
    });
    const { fixture, declared } = mount(
      COUNTER,
      vi.fn(() => Promise.reject(tooEarly)),
    );
    await fixture.componentInstance['declare']();
    fixture.detectChanges();
    expect(el(fixture).querySelector('[data-no-show-error]')?.textContent).toContain(
      'Le créneau n’est pas fini.',
    );
    expect(declared()).toBe(0);
  });
});

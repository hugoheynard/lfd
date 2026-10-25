import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type { PackingDeliveryNotePrint, StaffNote, StaffPermission } from '@lfd/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PermissionsStore } from '../../auth/permissions.store';
import { NotifyService } from '../../notify.service';
import { DeliveryNotesService } from '../delivery-notes.service';
import { DeliveryNotePrintNotice, toPrint } from './delivery-note-print-notice';

type Note = Pick<StaffNote, 'number' | 'reprintNeeded' | 'status'>;

function mount(
  state: PackingDeliveryNotePrint | null,
  options: {
    readonly permissions?: readonly StaffPermission[];
    readonly notes?: readonly Note[];
  } = {},
) {
  const openCarrier = vi.fn(async () => undefined);
  const permissions = options.permissions ?? ['b2b_orders:read'];
  TestBed.configureTestingModule({
    providers: [
      {
        provide: DeliveryNotesService,
        useValue: { ofOrder: () => Promise.resolve(options.notes ?? []), openCarrier },
      },
      { provide: NotifyService, useValue: { error: () => undefined } },
      {
        provide: PermissionsStore,
        useValue: { can: (p: StaffPermission): boolean => permissions.includes(p) },
      },
    ],
  });
  const fixture = TestBed.createComponent(DeliveryNotePrintNotice);
  fixture.componentRef.setInput('orderId', 'ord_1');
  fixture.componentRef.setInput('state', state);
  const printed = vi.fn();
  fixture.componentInstance.printed.subscribe(printed);
  fixture.detectChanges();
  return { fixture, openCarrier, printed };
}

const el = (f: ComponentFixture<DeliveryNotePrintNotice>) => f.nativeElement as HTMLElement;

/** Seuls ces trois champs sont lus : le reste du BL n'intéresse pas la règle. */
function note(
  number: string,
  reprintNeeded: boolean,
  status: StaffNote['status'] = 'planned',
): Note {
  return { number, reprintNeeded, status };
}

describe('« BL à réimprimer » (plan E6, § 14)', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('ne dit rien quand le papier est à jour', () => {
    expect(el(mount(null).fixture).textContent?.trim()).toBe('');
  });

  it('ouvre les BL changés, puis demande de relire', async () => {
    const { fixture, openCarrier, printed } = mount('to_reprint', {
      notes: [note('BL-1', true), note('BL-2', false)],
    });
    expect(el(fixture).querySelector('[data-delivery-note-to-reprint]')?.textContent).toContain(
      'BL à réimprimer',
    );
    el(fixture).querySelector<HTMLButtonElement>('[data-delivery-note-print]')?.click();
    await fixture.whenStable();

    expect(openCarrier).toHaveBeenCalledExactlyOnceWith('ord_1', 'BL-1');
    expect(printed).toHaveBeenCalledOnce();
  });

  it('renvoie à la fiche sans `b2b_orders:read`', () => {
    const { fixture } = mount('to_reprint', { permissions: [] });
    expect(el(fixture).querySelector('[data-delivery-note-print]')).toBeNull();
    expect(el(fixture).textContent).toContain('depuis la fiche de la commande');
  });

  it('dit « Nouveau BL imprimé » une fois réimprimé', () => {
    expect(
      el(mount('reprinted').fixture).querySelector('[data-delivery-note-reprinted]'),
    ).not.toBeNull();
  });
});

describe('toPrint', () => {
  it('les BL changés depuis leur impression, sinon tous les vivants (jamais imprimé)', () => {
    expect(toPrint([note('BL-1', true), note('BL-2', false)]).map((n) => n.number)).toEqual([
      'BL-1',
    ]);
    expect(
      toPrint([note('BL-1', false), note('BL-0', false, 'voided')]).map((n) => n.number),
    ).toEqual(['BL-1']);
  });
});

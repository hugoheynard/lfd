import { HttpErrorResponse } from '@angular/common/http';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import type {
  AmendedMercurialeResponse,
  CarryOverMercurialeLinePayload,
  StaffPermission,
} from '@lfd/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../../../auth/permissions.store';
import { SaleReferenceDecisionsService } from '../../../../b2b/tarification/sale-reference-decisions.service';
import { MercurialeCarryOver } from './mercuriale-carry-over';

/**
 * **Reporter une mercuriale sur la référence détachée**
 * (`plan-tarif-date-sur-une-reference.md`, § 6, T5) : le motif prérempli,
 * modifiable, jamais vide ; l'appel nomme l'ancienne et la nouvelle
 * référence ; un refus du serveur reste à l'écran.
 */

const CAN: readonly StaffPermission[] = ['b2b_pricing:read', 'b2b_pricing:write'];

class StubDecisions {
  readonly calls: {
    fromSku: string;
    mercurialeId: string;
    payload: CarryOverMercurialeLinePayload;
  }[] = [];
  constructor(private readonly refusal: HttpErrorResponse | null = null) {}
  carryOver(
    fromSku: string,
    mercurialeId: string,
    payload: CarryOverMercurialeLinePayload,
  ): Promise<AmendedMercurialeResponse> {
    this.calls.push({ fromSku, mercurialeId, payload });
    return this.refusal === null
      ? Promise.resolve({ amendmentId: 'amd_1' })
      : Promise.reject(this.refusal);
  }
}

function mount(
  decisions: StubDecisions,
  permissions: readonly StaffPermission[] = CAN,
): { fixture: ComponentFixture<MercurialeCarryOver>; carried: string[] } {
  TestBed.configureTestingModule({
    providers: [
      { provide: SaleReferenceDecisionsService, useValue: decisions },
      {
        provide: PermissionsStore,
        useValue: { can: (p: StaffPermission): boolean => permissions.includes(p) },
      },
    ],
  });
  const fixture = TestBed.createComponent(MercurialeCarryOver);
  fixture.componentRef.setInput('mercurialeId', 'mer_1');
  fixture.componentRef.setInput('fromSku', 'CHO-000-2');
  fixture.componentRef.setInput('toSku', 'CHO-001-1');
  const carried: string[] = [];
  fixture.componentInstance.carried.subscribe(() => carried.push('carried'));
  fixture.detectChanges();
  return { fixture, carried };
}

const el = (f: ComponentFixture<MercurialeCarryOver>) => f.nativeElement as HTMLElement;

function open(f: ComponentFixture<MercurialeCarryOver>): void {
  f.componentInstance['onOpenChange'](true);
  f.detectChanges();
}

describe('<app-mercuriale-carry-over>', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('n’existe pas sans `b2b_pricing:write`', () => {
    const { fixture } = mount(new StubDecisions(), ['b2b_pricing:read']);

    expect(el(fixture).querySelector('[data-carry-over-trigger]')).toBeNull();
  });

  it('nomme la nouvelle référence, et le motif ne s’ouvre qu’avec la confirmation, prérempli', () => {
    const { fixture } = mount(new StubDecisions());

    expect(el(fixture).querySelector('[data-carry-over-trigger]')?.textContent).toContain(
      'Reporter sur CHO-001-1',
    );
    expect(el(fixture).querySelector('[data-carry-over-reason]')).toBeNull();

    open(fixture);
    expect(fixture.componentInstance['reason']()).toBe(
      'Report de la déclinaison détachée CHO-000-2',
    );
  });

  it('reporte avec le motif saisi, puis prévient le parent', async () => {
    const decisions = new StubDecisions();
    const { fixture, carried } = mount(decisions);
    open(fixture);
    fixture.componentInstance['reason'].set('  Demande du chef  ');

    await fixture.componentInstance['confirm']();

    expect(decisions.calls).toEqual([
      {
        fromSku: 'CHO-000-2',
        mercurialeId: 'mer_1',
        payload: { toSku: 'CHO-001-1', reason: 'Demande du chef' },
      },
    ]);
    expect(carried).toEqual(['carried']);
  });

  it('n’envoie rien sans motif', async () => {
    const decisions = new StubDecisions();
    const { fixture } = mount(decisions);
    open(fixture);
    fixture.componentInstance['reason'].set('   ');

    await fixture.componentInstance['confirm']();

    expect(decisions.calls).toEqual([]);
  });

  it('garde à l’écran le refus du serveur', async () => {
    const refusal = new HttpErrorResponse({
      status: 409,
      error: {
        code: 'pricing.mercuriale.amendment.already_negotiated',
        message: 'L’article « CHO-001-1 » est déjà dans la grille.',
      },
    });
    const { fixture, carried } = mount(new StubDecisions(refusal));
    open(fixture);

    await fixture.componentInstance['confirm']();
    fixture.detectChanges();

    expect(el(fixture).querySelector('[data-carry-over-error]')?.textContent).toContain(
      'déjà dans la grille',
    );
    expect(carried).toEqual([]);
  });
});

import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { FoldPanelRef } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { LOYALTY_REASON_MAX, type LoyaltyVoucherView } from '@lfd/contracts';

import { LoyaltyService } from '../../loyalty.service';
import { CancelVoucherPanel } from './cancel-voucher-panel';

/**
 * Annuler un bon demande un motif (1–500), et le panneau dit que les points
 * reviennent au titulaire. Un refus du serveur reste dans le panneau.
 */

const VOUCHER: LoyaltyVoucherView = {
  id: 'v1',
  holder: { kind: 'user', id: 'u1', label: 'Camille Martin' },
  valueCents: 1_000,
  pointsCost: 2_000,
  ratio: { pointsPerStep: 1_000, stepValueCents: 500 },
  issuedAt: '2026-09-20T09:00:00.000Z',
  expiresAt: '2027-09-20T09:00:00.000Z',
  status: 'available',
  cancelledAt: null,
  cancellationReason: null,
  usedOn: null,
};

class FakeApi {
  calls: { id: string; reason: string }[] = [];
  refuse: unknown = null;

  cancelVoucher(id: string, reason: string): Promise<void> {
    if (this.refuse !== null) {
      return Promise.reject(this.refuse);
    }
    this.calls.push({ id, reason });
    return Promise.resolve();
  }
}

interface Rendered {
  readonly fixture: ComponentFixture<CancelVoucherPanel>;
  readonly closedWith: (boolean | undefined)[];
}

async function render(api: FakeApi): Promise<Rendered> {
  const closedWith: (boolean | undefined)[] = [];
  TestBed.configureTestingModule({
    imports: [CancelVoucherPanel],
    providers: [
      { provide: LoyaltyService, useValue: api },
      {
        provide: FoldPanelRef,
        useValue: new FoldPanelRef<boolean>(1, (result) => closedWith.push(result)),
      },
    ],
  });
  const fixture = TestBed.createComponent(CancelVoucherPanel);
  fixture.componentRef.setInput('data', VOUCHER);
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, closedWith };
}

const root = (fixture: ComponentFixture<CancelVoucherPanel>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

function type(fixture: ComponentFixture<CancelVoucherPanel>, value: string): void {
  const area = root(fixture).querySelector('textarea');
  if (area === null) {
    throw new Error('textarea introuvable');
  }
  area.value = value;
  area.dispatchEvent(new Event('input'));
  fixture.detectChanges();
}

function submit(fixture: ComponentFixture<CancelVoucherPanel>): HTMLButtonElement {
  const found = Array.from(root(fixture).querySelectorAll<HTMLButtonElement>('button')).find(
    (b) => b.textContent?.trim() === 'Annuler le bon',
  );
  if (found === undefined) {
    throw new Error('bouton « Annuler le bon » introuvable');
  }
  return found;
}

describe('CancelVoucherPanel', () => {
  it('dit que les points du bon reviennent au titulaire', async () => {
    const { fixture } = await render(new FakeApi());
    expect(root(fixture).textContent).toMatch(/2\s000 points/u);
    expect(root(fixture).textContent).toContain('reviennent');
  });

  it('ne permet pas d’annuler sans motif, ni avec un motif trop long', async () => {
    const { fixture } = await render(new FakeApi());
    expect(submit(fixture).disabled).toBe(true);

    type(fixture, '   ');
    expect(submit(fixture).disabled).toBe(true);

    type(fixture, 'x'.repeat(LOYALTY_REASON_MAX + 1));
    expect(submit(fixture).disabled).toBe(true);
  });

  it('envoie le motif nettoyé, et ferme sur un succès', async () => {
    const api = new FakeApi();
    const { fixture, closedWith } = await render(api);
    type(fixture, '  Émis par erreur  ');

    submit(fixture).click();
    await fixture.whenStable();

    expect(api.calls).toEqual([{ id: 'v1', reason: 'Émis par erreur' }]);
    expect(closedWith).toEqual([true]);
  });

  it('un refus du serveur reste dans le panneau, avec ses mots', async () => {
    const api = new FakeApi();
    api.refuse = { status: 409, error: { message: "Ce bon n'est plus disponible." } };
    const { fixture, closedWith } = await render(api);
    type(fixture, 'Demande du client');

    submit(fixture).click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(root(fixture).textContent).toContain("Ce bon n'est plus disponible.");
    expect(closedWith).toEqual([]);
  });
});

import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { FoldPanelRef } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { type AdjustLoyaltyPointsPayload, LOYALTY_REASON_MAX } from '@lfd/contracts';

import { LoyaltyService } from '../../loyalty.service';
import { AdjustPointsPanel } from './adjust-points-panel';

/**
 * L'ajustement demande un nombre entier non nul et un motif (1–500) : l'écran
 * n'envoie pas ce que le serveur refuserait. Un refus du serveur reste dans le
 * panneau, mot pour mot, et le panneau reste ouvert.
 */

class FakeApi {
  calls: AdjustLoyaltyPointsPayload[] = [];
  refuse: unknown = null;

  adjust(payload: AdjustLoyaltyPointsPayload): Promise<void> {
    if (this.refuse !== null) {
      return Promise.reject(this.refuse);
    }
    this.calls.push(payload);
    return Promise.resolve();
  }
}

interface Rendered {
  readonly fixture: ComponentFixture<AdjustPointsPanel>;
  readonly closedWith: (boolean | undefined)[];
}

async function render(api: FakeApi): Promise<Rendered> {
  const closedWith: (boolean | undefined)[] = [];
  TestBed.configureTestingModule({
    imports: [AdjustPointsPanel],
    providers: [
      { provide: LoyaltyService, useValue: api },
      {
        provide: FoldPanelRef,
        useValue: new FoldPanelRef<boolean>(1, (result) => closedWith.push(result)),
      },
    ],
  });
  const fixture = TestBed.createComponent(AdjustPointsPanel);
  fixture.componentRef.setInput('data', {
    holder: { kind: 'company', id: 'c1', label: 'Le Lac' },
    points: 1_000,
  });
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, closedWith };
}

const root = (fixture: ComponentFixture<AdjustPointsPanel>): HTMLElement =>
  fixture.nativeElement as HTMLElement;

function fill(fixture: ComponentFixture<AdjustPointsPanel>, selector: string, value: string): void {
  const field = root(fixture).querySelector<HTMLInputElement | HTMLTextAreaElement>(selector);
  if (field === null) {
    throw new Error(`${selector} introuvable`);
  }
  field.value = value;
  field.dispatchEvent(new Event('input'));
  field.dispatchEvent(new Event('blur'));
  fixture.detectChanges();
}

const points = (f: ComponentFixture<AdjustPointsPanel>, v: string): void =>
  fill(f, 'fold-number-input input', v);
const reason = (f: ComponentFixture<AdjustPointsPanel>, v: string): void => fill(f, 'textarea', v);

function submit(fixture: ComponentFixture<AdjustPointsPanel>): HTMLButtonElement {
  const found = Array.from(root(fixture).querySelectorAll<HTMLButtonElement>('button')).find(
    (b) => b.textContent?.trim() === 'Ajuster',
  );
  if (found === undefined) {
    throw new Error('bouton Ajuster introuvable');
  }
  return found;
}

describe('AdjustPointsPanel', () => {
  it('ne permet pas d’ajuster sans points ou sans motif', async () => {
    const { fixture } = await render(new FakeApi());
    expect(submit(fixture).disabled).toBe(true);

    points(fixture, '200');
    expect(submit(fixture).disabled).toBe(true);

    reason(fixture, '   ');
    expect(submit(fixture).disabled).toBe(true);
  });

  it('refuse zéro point, et un motif de plus de 500 caractères', async () => {
    const { fixture } = await render(new FakeApi());
    points(fixture, '0');
    reason(fixture, 'Geste commercial');
    expect(submit(fixture).disabled).toBe(true);

    points(fixture, '10');
    reason(fixture, 'x'.repeat(LOYALTY_REASON_MAX + 1));
    expect(submit(fixture).disabled).toBe(true);
  });

  it('annonce le solde qu’on obtiendrait', async () => {
    const { fixture } = await render(new FakeApi());
    points(fixture, '-200');
    expect(root(fixture).textContent).toMatch(/Solde après ajustement : 800 points/u);
  });

  it('envoie un retrait motivé sur le titulaire, et ferme sur un succès', async () => {
    const api = new FakeApi();
    const { fixture, closedWith } = await render(api);
    points(fixture, '-200');
    reason(fixture, '  Commande créditée deux fois  ');

    submit(fixture).click();
    await fixture.whenStable();

    expect(api.calls).toEqual([
      {
        holderKind: 'company',
        holderId: 'c1',
        points: -200,
        reason: 'Commande créditée deux fois',
      },
    ]);
    expect(closedWith).toEqual([true]);
  });

  it('un refus du serveur reste dans le panneau, avec ses mots', async () => {
    const api = new FakeApi();
    api.refuse = { status: 409, error: { message: 'Le solde passerait sous zéro.' } };
    const { fixture, closedWith } = await render(api);
    points(fixture, '-5000');
    reason(fixture, 'Correction');

    submit(fixture).click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(root(fixture).textContent).toContain('Le solde passerait sous zéro.');
    expect(closedWith).toEqual([]);
  });
});

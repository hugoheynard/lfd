import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type {
  PickupAddressPayload,
  PickupAddressUpdatePayload,
  PickupAddressView,
} from '@lfd/contracts';
import { postalDraftFrom } from '@lfd/b2b-ui/company';
import { FoldPanelRef } from 'fold-ng';
import { describe, expect, it, vi } from 'vitest';

import { NotifyService } from '../../../notify.service';
import { PickupAddressesService } from '../pickup-addresses.service';
import { PickupPanel } from './pickup-panel';

/**
 * **Les clientèles de la réduction d'un point** (plan « remise et livraison par
 * clientèle », D2) : deux cases sous la réduction, grisées sans elle, envoyées à
 * la création comme à la modification — et un refus du serveur qui reste dans
 * le panneau.
 */

const LABO: PickupAddressView = {
  id: 'pick_1',
  label: 'Labo',
  ligne1: '3 rue du Four',
  ligne2: '',
  codePostal: '75011',
  ville: 'Paris',
  pays: 'France',
  isDefault: true,
  discount: { mode: 'amount', cents: 800 },
  discountAudiences: { b2b: true, b2c: false },
  opening: { publicOpening: null, proPickup: null },
};

class FakePickups {
  readonly created: PickupAddressPayload[] = [];
  readonly updated: PickupAddressUpdatePayload[] = [];
  refusal: unknown = null;

  create(payload: PickupAddressPayload): Promise<{ id: string }> {
    this.created.push(payload);
    return this.refusal === null
      ? Promise.resolve({ id: 'pick_new' })
      : Promise.reject(this.refusal);
  }

  update(_id: string, payload: PickupAddressUpdatePayload): Promise<void> {
    this.updated.push(payload);
    return this.refusal === null ? Promise.resolve() : Promise.reject(this.refusal);
  }
}

interface Harness {
  readonly fixture: ComponentFixture<PickupPanel>;
  readonly pickups: FakePickups;
  readonly ref: FoldPanelRef<boolean>;
}

async function mount(address: PickupAddressView | null): Promise<Harness> {
  const pickups = new FakePickups();
  const ref = new FoldPanelRef<boolean>(1, () => undefined);
  TestBed.configureTestingModule({
    imports: [PickupPanel],
    providers: [
      { provide: PickupAddressesService, useValue: pickups },
      { provide: FoldPanelRef, useValue: ref },
      { provide: NotifyService, useValue: { success: () => undefined, error: () => undefined } },
    ],
  });
  const fixture = TestBed.createComponent(PickupPanel);
  fixture.componentRef.setInput('data', { address });
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, pickups, ref };
}

/** Les cases natives des deux clientèles, B2B puis B2C. */
const audienceBoxes = (fixture: ComponentFixture<PickupPanel>): HTMLInputElement[] =>
  Array.from(fixture.nativeElement.querySelectorAll('fold-fieldset fold-checkbox input'));

describe('PickupPanel — les clientèles de la réduction', () => {
  it('reprend les clientèles du point, et les renvoie à la modification', async () => {
    const { fixture, pickups } = await mount(LABO);

    await fixture.componentInstance['submit']();

    expect(pickups.updated[0]?.discountAudiences).toEqual({ b2b: true, b2c: false });
  });

  it('envoie une case changée', async () => {
    const { fixture, pickups } = await mount(LABO);
    fixture.componentInstance['setAudience']('b2c', true);

    await fixture.componentInstance['submit']();

    expect(pickups.updated[0]?.discountAudiences).toEqual({ b2b: true, b2c: true });
  });

  it('crée un point avec les deux clientèles par défaut — l’existant', async () => {
    const { fixture, pickups } = await mount(null);
    fixture.componentInstance['draft'].set(postalDraftFrom(LABO));
    fixture.componentInstance['setDiscount']({ direction: 'decrease', mode: 'amount', cents: 500 });

    await fixture.componentInstance['submit']();

    expect(pickups.created[0]?.discountAudiences).toEqual({ b2b: true, b2c: true });
  });

  it('grise les cases tant qu’il n’y a pas de réduction', async () => {
    const { fixture } = await mount({ ...LABO, discount: null });

    expect(audienceBoxes(fixture).map((box) => box.disabled)).toEqual([true, true]);
  });

  it('les rend cochables dès qu’une réduction existe', async () => {
    const { fixture } = await mount(LABO);

    expect(audienceBoxes(fixture).map((box) => box.disabled)).toEqual([false, false]);
  });

  it('🔴 retirer la réduction ne remet pas les cases à zéro', async () => {
    // Sans réduction, le serveur ne les lit pas ; les effacer ferait perdre un
    // choix qu'on retrouverait en rouvrant la réduction.
    const { fixture, pickups } = await mount(LABO);
    fixture.componentInstance['setDiscount'](null);

    await fixture.componentInstance['submit']();

    expect(pickups.updated[0]).toMatchObject({
      discount: null,
      discountAudiences: { b2b: true, b2c: false },
    });
  });

  it('refuse d’envoyer une réduction qui ne vise personne, et le dit', async () => {
    const { fixture, pickups } = await mount(LABO);
    fixture.componentInstance['setAudience']('b2b', false);
    fixture.detectChanges();

    await fixture.componentInstance['submit']();

    expect(pickups.updated).toEqual([]);
    expect(fixture.nativeElement.textContent).toContain('Cochez au moins une clientèle');
  });

  it('🔴 garde le refus du serveur DANS le panneau, sans le fermer', async () => {
    const { fixture, pickups, ref } = await mount(LABO);
    const close = vi.spyOn(ref, 'close');
    pickups.refusal = {
      status: 400,
      error: {
        code: 'validation',
        message: 'Cochez au moins une clientèle, ou retirez la réduction',
      },
    };

    await fixture.componentInstance['submit']();
    fixture.detectChanges();

    expect(close).not.toHaveBeenCalled();
    const alert: HTMLElement | null = fixture.nativeElement.querySelector('fold-callout.v-alert');
    expect(alert?.textContent).toContain('Cochez au moins une clientèle, ou retirez la réduction');
  });
});

import { TestBed } from '@angular/core/testing';
import {
  DEFAULT_DELIVERY_PRICING,
  type CustomerAudience,
  type DeliveryPricingPatch,
  type DeliveryPricingView,
} from '@lfd/contracts';
import { FoldPanelRef } from 'fold-ng';
import { describe, expect, it, vi } from 'vitest';

import { NotifyService } from '../../../../notify.service';
import { DeliveryZonesService } from '../../delivery-zones.service';
import { GlobalPricingDialog } from './global-pricing-dialog';

/**
 * **Le dialogue du réglage global de livraison** (0b) : il n'écrit que les
 * clientèles ouvertes, « revenir au frais de chaque zone » efface la valeur,
 * et un refus reste dans le dialogue.
 */

class FakeZones {
  readonly patches: DeliveryPricingPatch[] = [];
  refusal: unknown = null;

  updatePricing(patch: DeliveryPricingPatch): Promise<void> {
    this.patches.push(patch);
    return this.refusal === null ? Promise.resolve() : Promise.reject(this.refusal);
  }
}

const PRICED: DeliveryPricingView = {
  ...DEFAULT_DELIVERY_PRICING,
  b2b: { fee: { mode: 'amount', cents: 900 }, freeDeliveryThresholdCents: 5_000 },
  b2c: { fee: { mode: 'amount', cents: 1_500 }, freeDeliveryThresholdCents: null },
};

async function mount(audiences: readonly CustomerAudience[]) {
  const zones = new FakeZones();
  const ref = new FoldPanelRef<boolean>(1, () => undefined);
  TestBed.configureTestingModule({
    imports: [GlobalPricingDialog],
    providers: [
      { provide: DeliveryZonesService, useValue: zones },
      { provide: FoldPanelRef, useValue: ref },
      { provide: NotifyService, useValue: { success: () => undefined, error: () => undefined } },
    ],
  });
  const fixture = TestBed.createComponent(GlobalPricingDialog);
  fixture.componentRef.setInput('data', { pricing: PRICED, audiences });
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, zones, ref };
}

describe('GlobalPricingDialog', () => {
  it('rien de changé : rien à envoyer', async () => {
    const { fixture, zones } = await mount(['b2b', 'b2c']);

    expect(fixture.componentInstance['dirty']()).toBe(false);
    await fixture.componentInstance['submit']();
    expect(zones.patches).toEqual([]);
  });

  it('n’écrit que les clientèles ouvertes : une clientèle masquée garde ses valeurs', async () => {
    const { fixture, zones, ref } = await mount(['b2b']);
    const close = vi.spyOn(ref, 'close');

    fixture.componentInstance['setFee']('b2b', {
      direction: 'increase',
      mode: 'amount',
      cents: 1_200,
    });
    await fixture.componentInstance['submit']();

    expect(zones.patches).toEqual([
      { b2b: { fee: { mode: 'amount', cents: 1_200 }, freeDeliveryThresholdCents: 5_000 } },
    ]);
    expect(close).toHaveBeenCalledWith(true);
  });

  it('« revenir au frais de chaque zone » envoie un frais vide', async () => {
    const { fixture, zones } = await mount(['b2b', 'b2c']);

    fixture.componentInstance['clear']('b2c');
    await fixture.componentInstance['submit']();

    expect(zones.patches[0]?.b2c).toEqual({ fee: null, freeDeliveryThresholdCents: null });
  });

  it('un refus reste dans le dialogue, sans le fermer', async () => {
    const { fixture, zones, ref } = await mount(['b2b']);
    const close = vi.spyOn(ref, 'close');
    zones.refusal = { status: 400, error: { message: 'Frais invalide.' } };

    fixture.componentInstance['clear']('b2b');
    await fixture.componentInstance['submit']();
    fixture.detectChanges();

    expect(close).not.toHaveBeenCalled();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('fold-callout.v-alert')?.textContent,
    ).toContain('Frais invalide.');
  });

  it('un seuil saisi en euros part en centimes entiers', async () => {
    const { fixture, zones } = await mount(['b2b', 'b2c']);

    fixture.componentInstance['setThreshold']('b2c', 80);
    expect(fixture.componentInstance['dirty']()).toBe(true);
    await fixture.componentInstance['submit']();

    expect(zones.patches[0]?.b2c).toEqual({
      fee: { mode: 'amount', cents: 1_500 },
      freeDeliveryThresholdCents: 8_000,
    });
  });

  it('« retirer la livraison offerte » envoie null, jamais 0', async () => {
    const { fixture, zones } = await mount(['b2b']);

    fixture.componentInstance['clearThreshold']('b2b');
    await fixture.componentInstance['submit']();

    expect(zones.patches[0]?.b2b?.freeDeliveryThresholdCents).toBeNull();
  });

  it('un seuil négatif ou plus fin que le centime bloque l’enregistrement', async () => {
    const { fixture, zones } = await mount(['b2b']);

    fixture.componentInstance['setThreshold']('b2b', 10.005);
    expect(fixture.componentInstance['invalid']()).toBe(true);
    await fixture.componentInstance['submit']();
    fixture.componentInstance['setThreshold']('b2b', -5);
    await fixture.componentInstance['submit']();

    expect(zones.patches).toEqual([]);
  });

  it('une clientèle fermée est montrée grisée, avec où l’ouvrir, et n’est pas envoyée', async () => {
    const { fixture, zones } = await mount(['b2b']);
    const host = fixture.nativeElement as HTMLElement;

    const fieldsets = [...host.querySelectorAll('fieldset')];
    expect(fieldsets.map((f) => f.disabled)).toEqual([false, true]);
    expect(host.textContent).toContain('Particuliers');
    expect(host.querySelector('fold-callout[data-closed]')?.textContent).toContain(
      '« B2C » dans « Disponibilité de la livraison »',
    );

    fixture.componentInstance['setThreshold']('b2b', 60);
    await fixture.componentInstance['submit']();
    expect(Object.keys(zones.patches[0] ?? {})).toEqual(['b2b']);
  });
});

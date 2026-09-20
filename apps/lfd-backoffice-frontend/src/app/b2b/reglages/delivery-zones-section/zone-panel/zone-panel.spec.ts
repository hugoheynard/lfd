import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { DeliveryZonePayload, DeliveryZoneView } from '@lfd/contracts';
import { FoldPanelRef } from 'fold-ng';
import { describe, expect, it, vi } from 'vitest';

import { NotifyService } from '../../../../notify.service';
import { DeliveryZonesService } from '../../delivery-zones.service';
import { ZonePanel } from './zone-panel';

/**
 * **Le panneau d'une zone de livraison.** Ce qu'il tient depuis le 2026-09-15 :
 * la suppression vit dans sa zone dangereuse — elle était une entrée du menu de
 * la liste, confirmée d'un clic —, et un refus du serveur reste DANS le panneau
 * au lieu de partir dans une notification qu'on ne relit pas.
 */

const VAL: DeliveryZoneView = {
  id: 'zone_1',
  postalPrefixes: ['73150'],
  label: 'Val d’Isère',
  fee: { mode: 'amount', cents: 500 },
};

class FakeZones {
  readonly created: DeliveryZonePayload[] = [];
  readonly updated: DeliveryZonePayload[] = [];
  readonly removed: string[] = [];
  refusal: unknown = null;

  create(payload: DeliveryZonePayload): Promise<{ id: string }> {
    this.created.push(payload);
    return this.refusal === null
      ? Promise.resolve({ id: 'zone_new' })
      : Promise.reject(this.refusal);
  }

  update(_id: string, payload: DeliveryZonePayload): Promise<void> {
    this.updated.push(payload);
    return this.settle();
  }

  remove(id: string): Promise<void> {
    this.removed.push(id);
    return this.settle();
  }

  private settle(): Promise<void> {
    return this.refusal === null ? Promise.resolve() : Promise.reject(this.refusal);
  }
}

interface Harness {
  readonly fixture: ComponentFixture<ZonePanel>;
  readonly zones: FakeZones;
  readonly ref: FoldPanelRef<boolean>;
}

async function mount(zone: DeliveryZoneView | null): Promise<Harness> {
  const zones = new FakeZones();
  const ref = new FoldPanelRef<boolean>(1, () => undefined);
  TestBed.configureTestingModule({
    imports: [ZonePanel],
    providers: [
      { provide: DeliveryZonesService, useValue: zones },
      { provide: FoldPanelRef, useValue: ref },
      { provide: NotifyService, useValue: { success: () => undefined, error: () => undefined } },
    ],
  });
  const fixture = TestBed.createComponent(ZonePanel);
  fixture.componentRef.setInput('data', { zone });
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, zones, ref };
}

const zone = (fixture: ComponentFixture<ZonePanel>): HTMLElement | null =>
  fixture.nativeElement.querySelector('fold-danger-zone');

const alert = (fixture: ComponentFixture<ZonePanel>): HTMLElement | null =>
  fixture.nativeElement.querySelector('fold-callout.v-alert');

describe('ZonePanel — la zone dangereuse', () => {
  it('n’existe pas à la création : il n’y a rien à supprimer', async () => {
    const { fixture } = await mount(null);

    expect(zone(fixture)).toBeNull();
  });

  it('fait taper le libellé de la zone pour supprimer', async () => {
    const { fixture } = await mount(VAL);

    expect(zone(fixture)).not.toBeNull();
    expect(fixture.componentInstance['confirmPhrase']()).toBe('Val d’Isère');
  });

  it('une zone sans libellé se confirme par ses codes postaux', async () => {
    const { fixture } = await mount({ ...VAL, label: '  ', postalPrefixes: ['73150', '731'] });

    expect(fixture.componentInstance['confirmPhrase']()).toBe('73150, 731');
  });

  it('supprime, puis ferme en demandant de recharger la liste', async () => {
    const { fixture, zones, ref } = await mount(VAL);
    const close = vi.spyOn(ref, 'close');

    await fixture.componentInstance['remove']();

    expect(zones.removed).toEqual(['zone_1']);
    expect(close).toHaveBeenCalledWith(true);
  });

  it('un refus de suppression reste dans le panneau, sans le fermer', async () => {
    const { fixture, zones, ref } = await mount(VAL);
    const close = vi.spyOn(ref, 'close');
    zones.refusal = { status: 409, error: { message: 'Zone encore utilisée.' } };

    await fixture.componentInstance['remove']();
    fixture.detectChanges();

    expect(close).not.toHaveBeenCalled();
    expect(alert(fixture)?.textContent).toContain('Zone encore utilisée.');
  });
});

describe('ZonePanel — l’enregistrement', () => {
  /**
   * Régression (2026-09-15) : un refus partait dans une notification et le
   * panneau restait ouvert sans rien dire de ce qui n'allait pas.
   */
  it('🔴 garde le refus du serveur DANS le panneau, sans le fermer', async () => {
    const { fixture, zones, ref } = await mount(VAL);
    const close = vi.spyOn(ref, 'close');
    zones.refusal = { status: 400, error: { message: 'Préfixe déjà couvert par une autre zone.' } };

    await fixture.componentInstance['submit']();
    fixture.detectChanges();

    expect(zones.updated).toHaveLength(1);
    expect(close).not.toHaveBeenCalled();
    expect(alert(fixture)?.textContent).toContain('Préfixe déjà couvert par une autre zone.');
  });
});

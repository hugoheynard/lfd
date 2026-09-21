import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type {
  PublicPickupSchedulePayload,
  PublicPickupScheduleView,
  PublicPickupSlotRuleView,
} from '@lfd/contracts';
import { describe, expect, it } from 'vitest';

import { NotifyService } from '../../../../notify.service';
import { PickupAddressesService } from '../../pickup-addresses.service';
import { PublicSlotsCard } from './public-slots-card';

/**
 * **Les créneaux publics d'un point**, côté écran (plan
 * `documentation/order/plan-creneaux-de-retrait.md`, lot B).
 *
 * Ce qui s'y joue vraiment : la grille d'aperçu est dérivée de ce qui est À
 * L'ÉCRAN — donc d'un brouillon non enregistré —, et l'enregistrement renvoie
 * l'horaire **sans les identifiants locaux**, que le serveur ne connaît pas.
 */

const MATIN: PublicPickupSlotRuleView = {
  id: 'rule_1',
  weekday: null,
  startTime: '07:00',
  endTime: '10:00',
  slotMinutes: 60,
  badge: 'Tout est chaud',
  serviceCapacity: 5,
};

class FakePickups {
  readonly saved: PublicPickupSchedulePayload[] = [];
  refusal: unknown = null;

  constructor(private readonly schedule: PublicPickupScheduleView) {}

  publicSchedule(): Promise<PublicPickupScheduleView> {
    return Promise.resolve(this.schedule);
  }

  savePublicSchedule(_id: string, payload: PublicPickupSchedulePayload): Promise<void> {
    this.saved.push(payload);
    return this.refusal === null ? Promise.resolve() : Promise.reject(this.refusal);
  }
}

interface Harness {
  readonly fixture: ComponentFixture<PublicSlotsCard>;
  readonly pickups: FakePickups;
}

async function mount(schedule: PublicPickupScheduleView): Promise<Harness> {
  const pickups = new FakePickups(schedule);
  TestBed.configureTestingModule({
    imports: [PublicSlotsCard],
    providers: [
      { provide: PickupAddressesService, useValue: pickups },
      { provide: NotifyService, useValue: { success: () => undefined, error: () => undefined } },
    ],
  });
  const fixture = TestBed.createComponent(PublicSlotsCard);
  fixture.componentRef.setInput('pickupId', 'pick_1');
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, pickups };
}

describe('PublicSlotsCard — ce que le point annonce', () => {
  it('🔴 dit qu’un point sans plage n’est PAS réglé, et ce que la première changera', async () => {
    const { fixture } = await mount({ rules: [], closures: [] });

    expect(fixture.componentInstance['configured']()).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('Dès la première plage');
  });

  it('se dit réglé dès qu’une plage existe', async () => {
    const { fixture } = await mount({ rules: [MATIN], closures: [] });

    expect(fixture.componentInstance['configured']()).toBe(true);
  });

  it('dérive le compte de créneaux plutôt que de le faire saisir', async () => {
    const { fixture } = await mount({ rules: [MATIN], closures: [] });

    expect(fixture.componentInstance['countOf'](MATIN)).toBe('3 créneaux de 60 min');
  });

  it('dit l’absence de limite plutôt que d’afficher un zéro', async () => {
    const { fixture } = await mount({ rules: [MATIN], closures: [] });

    expect(fixture.componentInstance['placesOf']({ ...MATIN, serviceCapacity: null })).toBe(
      'Sans limite',
    );
  });
});

describe('PublicSlotsCard — l’enregistrement en bloc', () => {
  it('🔴 envoie l’horaire SANS les identifiants locaux', async () => {
    // Les brouillons portent un id pour que l'aperçu puisse les dériver ; le
    // serveur ne le connaît pas, et le lui envoyer ferait refuser la charge.
    const { fixture, pickups } = await mount({ rules: [MATIN], closures: [] });
    fixture.componentInstance['dirty'].set(true);

    await fixture.componentInstance['save']();

    expect(pickups.saved[0]?.rules[0]).not.toHaveProperty('id');
    expect(pickups.saved[0]?.rules[0]).toMatchObject({ startTime: '07:00', slotMinutes: 60 });
  });

  it('n’envoie rien tant que rien n’a bougé', async () => {
    const { fixture, pickups } = await mount({ rules: [MATIN], closures: [] });

    await fixture.componentInstance['save']();

    expect(pickups.saved).toEqual([]);
  });

  it('🔴 garde le refus du serveur DANS la carte', async () => {
    // Un chevauchement refusé ne doit pas partir en toast : on cherche quoi
    // corriger, et le message doit rester sous les yeux.
    const { fixture, pickups } = await mount({ rules: [MATIN], closures: [] });
    pickups.refusal = {
      status: 409,
      error: { message: 'Les plages 07:00–10:00 et 09:00–11:00 se chevauchent.' },
    };
    fixture.componentInstance['dirty'].set(true);

    await fixture.componentInstance['save']();
    fixture.detectChanges();

    expect(fixture.componentInstance['refusal']()).toContain('se chevauchent');
  });
});

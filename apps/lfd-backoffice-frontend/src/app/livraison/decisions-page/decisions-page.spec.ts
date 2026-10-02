import { HttpErrorResponse } from '@angular/common/http';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type {
  PendingStopDecisionsView,
  PendingStopDecisionView,
  StaffPermission,
} from '@lfd/contracts';
import { By } from '@angular/platform-browser';
import { FoldListboxComponent } from 'fold-ng';
import { describe, expect, it } from 'vitest';

import { PermissionsStore } from '../../auth/permissions.store';
import { NotifyService } from '../../notify.service';
import { DoorstepSettingsService } from '../doorstep-settings.service';
import { StopDecisionsService } from '../stop-decisions.service';
import { DecisionsPage } from './decisions-page';

function decisionOf(overrides: Partial<PendingStopDecisionView> = {}): PendingStopDecisionView {
  return {
    roundId: 'r-1',
    vehicleName: 'Kangoo',
    passage: 1,
    serviceDay: '2030-03-12',
    stopId: 's-1',
    orderId: 'o-1',
    reference: 'CMD-1',
    customerLabel: 'Refuge 1950',
    signatureRequired: true,
    decision: { state: 'pending', source: null, decidedAt: null, decidedByName: null },
    incidents: [
      {
        id: 'inc-1',
        roundId: 'r-1',
        stopId: 's-1',
        orderReference: 'CMD-1',
        family: 'doorstep',
        reason: 'nobody_present',
        note: 'trois coups, rien',
        hasPhoto: false,
        reportedAt: '2030-03-12T08:10:00.000Z',
        reportedBy: { staffUserId: 'staff-paul', name: 'Paul Roux' },
      },
    ],
    ...overrides,
  };
}

/** Le transport doublé : ce qu'il rend, et les gestes qu'il a reçus. */
class FakeDecisions {
  current: PendingStopDecisionsView = { decisions: [decisionOf()] };
  calls: string[] = [];
  refuse: HttpErrorResponse | null = null;

  pending(): Promise<PendingStopDecisionsView> {
    this.calls.push('pending');
    return Promise.resolve(this.current);
  }

  authorizeDeposit(stopId: string): Promise<void> {
    this.calls.push(`autoriser ${stopId}`);
    return this.refuse === null ? Promise.resolve() : Promise.reject(this.refuse);
  }

  photo(stopId: string, incidentId: string): Promise<Blob> {
    this.calls.push(`photo ${stopId} ${incidentId}`);
    return Promise.resolve(new Blob(['x'], { type: 'image/jpeg' }));
  }

  bringBack(stopId: string): Promise<void> {
    this.calls.push(`rapporter ${stopId}`);
    return Promise.resolve();
  }
}

/** Les lectures du réglage global de la porte, pour savoir si la carte l'a demandé. */
let doorstepReads = 0;

async function boot(
  fake: FakeDecisions,
  grants: readonly StaffPermission[] = [],
): Promise<{ fixture: ComponentFixture<DecisionsPage>; element: HTMLElement }> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      {
        provide: StopDecisionsService,
        useValue: fake satisfies Pick<
          StopDecisionsService,
          'pending' | 'authorizeDeposit' | 'bringBack' | 'photo'
        >,
      },
      {
        provide: PermissionsStore,
        useValue: { can: (permission: StaffPermission) => grants.includes(permission) },
      },
      {
        provide: DoorstepSettingsService,
        useValue: {
          settings: () => {
            doorstepReads += 1;
            return Promise.resolve({ rule: 'ask' as const, source: 'default' as const });
          },
        },
      },
      { provide: NotifyService, useValue: { success: () => undefined } },
    ],
  });
  doorstepReads = 0;
  const fixture = TestBed.createComponent(DecisionsPage);
  await settle(fixture);
  return { fixture, element: fixture.nativeElement as HTMLElement };
}

async function settle(fixture: ComponentFixture<DecisionsPage>): Promise<void> {
  fixture.detectChanges();
  await new Promise((resolve) => setTimeout(resolve));
  await fixture.whenStable();
  fixture.detectChanges();
}

const ruleChoice = (fixture: ComponentFixture<DecisionsPage>): FoldListboxComponent<string> =>
  fixture.debugElement.query(By.css('[data-doorstep-rule-choice]'))
    .componentInstance as FoldListboxComponent<string>;

describe('DecisionsPage — « À décider » (B3)', () => {
  it('montre l’arrêt, sa signature exigée, le signalement et sa note', async () => {
    const { element } = await boot(new FakeDecisions());

    const card = element.querySelector('[data-decision]');
    expect(card?.textContent).toContain('CMD-1 · Refuge 1950');
    expect(card?.textContent).toContain('Signature exigée');
    expect(card?.querySelector('[data-decision-status]')?.textContent).toContain('À décider');
    expect(card?.querySelector('[data-decision-incident]')?.textContent).toContain(
      'trois coups, rien',
    );
  });

  it('« Autoriser le dépôt cette fois » répond, puis relit la liste', async () => {
    const fake = new FakeDecisions();
    const { fixture, element } = await boot(fake);

    (element.querySelector('[data-authorize]') as HTMLButtonElement).click();
    await settle(fixture);

    expect(fake.calls).toEqual(['pending', 'autoriser s-1', 'pending']);
  });

  it('une autorisation en vigueur ne se repropose pas ; « Rapporter » reste possible', async () => {
    const fake = new FakeDecisions();
    fake.current = {
      decisions: [
        decisionOf({
          decision: {
            state: 'authorize_deposit',
            source: 'staff',
            decidedAt: '2030-03-12T08:12:00.000Z',
            decidedByName: 'Léa Martin',
          },
        }),
      ],
    };
    const { element } = await boot(fake);

    expect(element.querySelector('[data-authorize]')).toBeNull();
    expect(element.querySelector('[data-bring-back]')).not.toBeNull();
    expect(element.querySelector('[data-decision-status]')?.textContent).toContain('Léa Martin');
  });

  it('un refus du serveur s’affiche sur la carte, tel quel', async () => {
    const fake = new FakeDecisions();
    fake.refuse = new HttpErrorResponse({
      status: 409,
      error: { message: 'L’arrêt de la commande CMD-1 est déjà clos.' },
    });
    const { fixture, element } = await boot(fake);

    (element.querySelector('[data-authorize]') as HTMLButtonElement).click();
    await settle(fixture);

    expect(element.querySelector('[data-decision-refusal]')?.textContent).toContain(
      'est déjà clos',
    );
  });

  it('rien à décider : un état vide fold', async () => {
    const fake = new FakeDecisions();
    fake.current = { decisions: [] };
    const { element } = await boot(fake);

    expect(element.querySelector('[data-empty]')).not.toBeNull();
  });

  it('la photo du signalement s’ouvre par la route des commerciaux, avec son arrêt', async () => {
    const fake = new FakeDecisions();
    const base = decisionOf();
    fake.current = {
      decisions: [
        decisionOf({
          incidents: base.incidents.map((incident) => ({ ...incident, hasPhoto: true })),
        }),
      ],
    };
    const { fixture, element } = await boot(fake);

    element.querySelector<HTMLButtonElement>('app-incident-photo button')?.click();
    await settle(fixture);

    expect(fake.calls).toContain('photo s-1 inc-1');
  });

  describe('la décision réglée d’avance à la porte, en tête (B3 bis, 2026-10-02)', () => {
    it('sans delivery_procedures:read, la carte n’est pas là et rien n’est lu', async () => {
      const { element } = await boot(new FakeDecisions());

      expect(element.querySelector('[data-doorstep-rule]')).toBeNull();
      expect(doorstepReads).toBe(0);
    });

    it('avec :read seul, la carte se lit sans pouvoir changer le réglage', async () => {
      const { fixture, element } = await boot(new FakeDecisions(), ['delivery_procedures:read']);

      expect(element.querySelector('[data-doorstep-rule]')).not.toBeNull();
      expect(doorstepReads).toBe(1);
      expect(ruleChoice(fixture).disabled()).toBe(true);
    });

    it('avec :write, le commercial peut changer le réglage', async () => {
      const { fixture } = await boot(new FakeDecisions(), [
        'delivery_procedures:read',
        'delivery_procedures:write',
      ]);

      expect(ruleChoice(fixture).disabled()).toBe(false);
    });
  });
});

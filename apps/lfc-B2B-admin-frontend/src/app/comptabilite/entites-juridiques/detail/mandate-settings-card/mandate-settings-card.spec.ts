import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import type { LegalEntityView, SepaScheme, SetMandateSchemePayload } from '@lfd/contracts';
import { FoldListboxComponent, FoldPanelHostService } from 'fold-ng';
import { beforeEach, describe, expect, it } from 'vitest';

import { LegalEntitiesService } from '../../../legal-entities.service';
import { MandateSchemeDialog } from '../mandate-scheme-dialog/mandate-scheme-dialog';
import { MandateSettingsCard } from './mandate-settings-card';

function entity(over: Partial<LegalEntityView> = {}): LegalEntityView {
  return {
    id: 'le1',
    name: 'La Folie Douce',
    legalForm: 'SAS',
    siren: '552100554',
    vatNumber: '',
    rcs: '',
    shareCapitalCents: 0,
    addressLine1: '12 rue du Fournil',
    addressLine2: '',
    postalCode: '73000',
    city: 'Chambéry',
    countryCode: 'FR',
    ics: '',
    creditorBic: '',
    creditorAccountHolder: '',
    creditorAccountLine1: '',
    creditorAccountLine2: '',
    creditorAccountPostalCode: '',
    creditorAccountCity: '',
    creditorAccountCountryCode: '',
    creditorAccountLast4: '',
    creditorIdentityFrozen: false,
    preNotificationDays: 14,
    mandateContractDescription: '',
    mandatePaymentType: 'recurrent',
    mandateScheme: 'B2B',
    archivedAt: null,
    canCollect: false,
    hasLogo: false,
    isLastActive: false,
    missingToCollect: [],
    ...over,
  };
}

interface Opened {
  readonly component: unknown;
  readonly data: unknown;
}

interface Wire {
  opened: Opened[];
  /** Ferme le dialogue ouvert avec la réponse donnée. */
  answer: (result: boolean | undefined) => void;
  writes: { id: string; payload: SetMandateSchemePayload }[];
  saved: { action: () => Promise<unknown>; said: string }[];
}

let wire: Wire;

function boot(current: SepaScheme = 'B2B'): ComponentFixture<MandateSettingsCard> {
  wire = { opened: [], answer: () => undefined, writes: [], saved: [] };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [MandateSettingsCard],
    providers: [
      {
        provide: LegalEntitiesService,
        useValue: {
          setMandateScheme: (id: string, payload: SetMandateSchemePayload): Promise<void> => {
            wire.writes.push({ id, payload });
            return Promise.resolve();
          },
        },
      },
      {
        provide: FoldPanelHostService,
        useValue: {
          open: (component: unknown, config: { data: unknown }) => {
            wire.opened.push({ component, data: config.data });
            return {
              closed: new Promise<boolean | undefined>((resolve) => {
                wire.answer = resolve;
              }),
            };
          },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(MandateSettingsCard);
  fixture.componentRef.setInput('entity', entity({ mandateScheme: current }));
  fixture.componentInstance.saved.subscribe((request) => wire.saved.push(request));
  fixture.detectChanges();
  return fixture;
}

function schemeListbox(
  fixture: ComponentFixture<MandateSettingsCard>,
): ReturnType<ComponentFixture<MandateSettingsCard>['debugElement']['query']> {
  const found = fixture.debugElement
    .queryAll(By.directive(FoldListboxComponent))
    .find(
      (node) =>
        (node.componentInstance as FoldListboxComponent<unknown>).label() === 'Schéma du mandat',
    );
  if (found === undefined) {
    throw new Error('Le sélecteur « Schéma du mandat » est absent.');
  }
  return found;
}

function choose(fixture: ComponentFixture<MandateSettingsCard>, scheme: SepaScheme | null): void {
  schemeListbox(fixture).triggerEventHandler('valueChange', scheme);
  fixture.detectChanges();
}

const shownScheme = (fixture: ComponentFixture<MandateSettingsCard>): unknown =>
  (schemeListbox(fixture).componentInstance as FoldListboxComponent<SepaScheme>).value();

async function settle(fixture: ComponentFixture<MandateSettingsCard>): Promise<void> {
  await fixture.whenStable();
  fixture.detectChanges();
}

describe('MandateSettingsCard — le schéma du mandat', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('montre le schéma en vigueur, avec ses deux choix libellés', () => {
    const fixture = boot('B2B');
    const listbox = schemeListbox(fixture).componentInstance as FoldListboxComponent<SepaScheme>;

    expect(listbox.value()).toBe('B2B');
    expect(listbox.options()?.map((option) => option.label)).toEqual([
      'SEPA CORE',
      'SEPA interentreprises (B2B)',
    ]);
  });

  it('choisir un autre schéma ouvre la confirmation, et n’écrit rien avant elle', () => {
    const fixture = boot('B2B');
    choose(fixture, 'CORE');

    expect(wire.opened).toEqual([
      { component: MandateSchemeDialog, data: { entityId: 'le1', from: 'B2B', to: 'CORE' } },
    ]);
    expect(wire.saved).toEqual([]);
  });

  it('confirmé : passe l’écriture à la page, qui relit', async () => {
    const fixture = boot('B2B');
    choose(fixture, 'CORE');
    wire.answer(true);
    await settle(fixture);

    expect(wire.saved.map((request) => request.said)).toEqual([
      'Schéma des mandats enregistré : SEPA CORE.',
    ]);
    await wire.saved[0]?.action();
    expect(wire.writes).toEqual([{ id: 'le1', payload: { scheme: 'CORE' } }]);
  });

  it('🔴 annulé : rien ne part, et la liste revient au schéma en vigueur', async () => {
    const fixture = boot('B2B');
    choose(fixture, 'CORE');
    expect(shownScheme(fixture)).toBe('CORE');

    wire.answer(undefined);
    await settle(fixture);

    expect(wire.saved).toEqual([]);
    expect(shownScheme(fixture)).toBe('B2B');
  });

  it('le schéma en vigueur, ou un effacement, n’ouvrent rien', () => {
    const fixture = boot('CORE');
    choose(fixture, 'CORE');
    choose(fixture, null);

    expect(wire.opened).toEqual([]);
    expect(shownScheme(fixture)).toBe('CORE');
  });
});

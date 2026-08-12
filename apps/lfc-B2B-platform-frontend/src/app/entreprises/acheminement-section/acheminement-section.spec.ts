import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { CompanyAddressesView, FulfillmentPreferenceView } from '@lfd/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import type { Company } from '../../account/account.model';
import { AccountService } from '../../account/account.service';
import { AddressesService } from '../addresses.service';
import { PickupAddressesService } from '../pickup-addresses.service';
import { PlatformSettingsService } from '../platform-settings.service';
import { AcheminementSection } from './acheminement-section';

function company(over: Partial<Company> = {}): Company {
  return {
    id: 'c1',
    reference: 'C-TEST01',
    raisonSociale: 'Boulangerie du Marais SAS',
    enseigne: '',
    formeJuridique: 'SAS',
    siret: '81245678900021',
    tvaIntracom: '',
    vatNumberRequired: true,
    status: 'active',
    grantedTerms: [],
    requestedTerm: null,
    role: 'company_admin',
    primaryContact: {
      id: null,
      firstName: 'Camille',
      lastName: 'Rousseau',
      fonction: '',
      email: 'camille@halles.fr',
      phone: '',
      role: null,
    },
    contacts: [],
    kbis: null,
    fulfillmentPreference: { method: null, pickupAddressId: null, deliveryAddressId: null },
    ...over,
  } as Company;
}

interface Harness {
  readonly host: HTMLElement;
  /** Ce que le container a demandé d'enregistrer. */
  readonly saved: FulfillmentPreferenceView[];
  readonly section: AcheminementSection;
}

function render(over: Partial<Company> = {}, deliveryHidden = false): Harness {
  const saved: FulfillmentPreferenceView[] = [];

  TestBed.configureTestingModule({
    providers: [
      {
        provide: AccountService,
        useValue: {
          preferFulfillment: (_id: string, preference: FulfillmentPreferenceView): void => {
            saved.push(preference);
          },
        },
      },
      {
        provide: AddressesService,
        useValue: {
          view: signal<CompanyAddressesView | null>({ billing: null, deliveries: [] }),
          loadFor: (): void => undefined,
        },
      },
      { provide: PickupAddressesService, useValue: { addresses: signal([]) } },
      { provide: PlatformSettingsService, useValue: { deliveryHidden: signal(deliveryHidden) } },
    ],
  });

  const fixture = TestBed.createComponent(AcheminementSection);
  fixture.componentRef.setInput('company', company(over));
  fixture.detectChanges();
  return {
    host: fixture.nativeElement as HTMLElement,
    saved,
    section: fixture.componentInstance,
  };
}

describe("section Préférences d'acheminement (client)", () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('parle au CLIENT, pas de lui à la troisième personne', () => {
    // La carte est partagée avec le back-office : c'est le container qui lui
    // donne les mots de son camp.
    const { host } = render();

    expect(host.textContent).toContain('Comment vous êtes servi');
    expect(host.textContent).not.toContain('ce client');
  });

  it('laisse le GESTIONNAIRE régler la préférence', () => {
    const { section } = render({ role: 'company_admin' });

    expect(section['canManage']()).toBe(true);
  });

  it('MONTRE sans laisser régler à un simple membre', () => {
    // Le serveur refuserait de toute façon (403) : l'écran dit la même chose
    // que lui, plutôt que d'offrir un geste qui échouera.
    const { section } = render({ role: 'member' });

    expect(section['canManage']()).toBe(false);
  });

  it('transmet la préférence choisie au service', () => {
    const { section, saved } = render();

    section['save']({ method: 'pickup', pickupAddressId: null, deliveryAddressId: null });

    expect(saved).toEqual([{ method: 'pickup', pickupAddressId: null, deliveryAddressId: null }]);
  });

  it('MASQUE la livraison quand le service est fermé', () => {
    // Proposer un acheminement que la plateforme ne rend pas serait une
    // promesse que personne ne peut tenir.
    const { section } = render({}, true);

    expect(section['deliveryOffered']()).toBe(false);
  });
});

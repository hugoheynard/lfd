import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DELIVERY_SERVICE_OPEN } from '@lfd/b2b-ui/flags';
import type { CompanyAddressesView, FulfillmentPreferenceView } from '@lfd/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import type { Company } from '../../account/account.model';
import { AccountService } from '../../account/account.service';
import { AddressesService } from '../addresses.service';
import { PickupAddressesService } from '../pickup-addresses.service';
import { AcheminementSection } from './acheminement-section';

function company(over: Partial<Company> = {}): Company {
  return {
    id: 'c1',
    reference: 'C-TEST01',
    raisonSociale: 'Boulangerie du Marais SAS',
    enseigne: '',
    formeJuridique: 'SAS',
    siret: '81245678900021',
    vatNumber: '',
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
    fulfillmentPreference: {
      method: null,
      pickupAddressId: null,
      deliveryAddressId: null,
      signatureRequired: false,
    },
    ...over,
  } as Company;
}

interface Harness {
  readonly host: HTMLElement;
  /** Ce que le container a demandé d'enregistrer. */
  readonly saved: FulfillmentPreferenceView[];
  readonly section: AcheminementSection;
}

function render(over: Partial<Company> = {}): Harness {
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

    section['save']({
      method: 'pickup',
      pickupAddressId: null,
      deliveryAddressId: null,
      signatureRequired: false,
    });

    expect(saved).toEqual([
      {
        method: 'pickup',
        pickupAddressId: null,
        deliveryAddressId: null,
        signatureRequired: false,
      },
    ]);
  });

  it('offre la livraison exactement quand le service est ouvert', () => {
    // Ce qui est tenu ici n'est pas la valeur du jour — elle a déjà changé une
    // fois — mais le fait qu'UN SEUL interrupteur la gouverne. Proposer un
    // acheminement que la plateforme ne rend pas serait une promesse que
    // personne ne peut tenir ; le masquer alors qu'elle le rend ferait perdre
    // une commande. `DELIVERY_SERVICE_OPEN` tranche, pour les cinq écrans.
    //
    // Une valeur recopiée en dur passerait tant qu'elle coïncide — et
    // tomberait ici au prochain basculement, c'est-à-dire au moment où ça
    // compte.
    const { section } = render();

    expect(section['deliveryOffered']).toBe(DELIVERY_SERVICE_OPEN);
  });
});

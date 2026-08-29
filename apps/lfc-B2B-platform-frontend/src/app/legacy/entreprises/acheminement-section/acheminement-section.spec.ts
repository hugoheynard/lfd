import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DELIVERY_SERVICE_OPEN } from '@lfd/b2b-ui/flags';
import type { CompanyAddressesView, FulfillmentPreferenceView } from '@lfd/contracts';
import { beforeEach, describe, expect, it } from 'vitest';

import type { Company } from '../../../account/account.model';
import { AccountService } from '../../../account/account.service';
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
    role: 'admin',
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
  /** Fait retomber toutes les écritures en vol — le serveur a répondu. */
  readonly settle: () => void;
  readonly section: AcheminementSection;
}

function render(over: Partial<Company> = {}): Harness {
  const saved: FulfillmentPreferenceView[] = [];
  // Les écritures restent EN VOL tant qu'on ne les fait pas retomber : c'est la
  // seule façon d'observer ce que fait un second clic pendant le premier.
  const pending: (() => void)[] = [];

  TestBed.configureTestingModule({
    providers: [
      {
        provide: AccountService,
        useValue: {
          preferFulfillment: (
            _id: string,
            preference: FulfillmentPreferenceView,
          ): Promise<boolean> => {
            saved.push(preference);
            return new Promise((resolve) => pending.push(() => resolve(true)));
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
    settle: (): void => {
      pending.splice(0).forEach((resolve) => resolve());
    },
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
    const { section } = render({ role: 'admin' });

    expect(section['canManage']()).toBe(true);
  });

  it('MONTRE sans laisser régler à un simple membre', () => {
    // Le serveur refuserait de toute façon (403) : l'écran dit la même chose
    // que lui, plutôt que d'offrir un geste qui échouera.
    const { section } = render({ role: 'orders' });

    expect(section['canManage']()).toBe(false);
  });

  it("n'écrit qu'une préférence à la FOIS", async () => {
    // Les trois contrôles écrivent la même préférence, chacun sur un clic.
    // Deux gestes rapprochés partaient en parallèle, et c'est le rechargement
    // le plus lent qui gagnait l'affichage : l'écran finissait sur
    // l'avant-dernier choix sans rien signaler.
    const { section, saved, settle } = render();
    const pickup: FulfillmentPreferenceView = {
      method: 'pickup',
      pickupAddressId: null,
      deliveryAddressId: null,
      signatureRequired: false,
    };
    const delivery: FulfillmentPreferenceView = { ...pickup, method: 'delivery' };

    const first = section['save'](pickup);
    void section['save'](delivery);

    expect(saved).toEqual([pickup]);

    // Le vol terminé, l'écran réécrit — le drapeau retombe, il ne gèle pas.
    settle();
    await first;
    void section['save'](delivery);

    expect(saved).toEqual([pickup, delivery]);
  });

  it('ÉCRIT la méthode à qui ne peut que lire', () => {
    // « Montrer sans laisser régler » se vérifiait sur le drapeau, pas à
    // l'écran — et à l'écran, les boutons portaient seuls la méthode. Un
    // simple membre lisait donc « Méthode habituelle » suivi de rien.
    const { host } = render({
      role: 'orders',
      fulfillmentPreference: {
        method: 'pickup',
        pickupAddressId: null,
        deliveryAddressId: null,
        signatureRequired: false,
      },
    } as Partial<Company>);

    expect(host.textContent).toContain('Méthode habituelle');
    expect(host.textContent).toContain('Retrait');
    expect(host.querySelector('button')).toBeNull();
  });

  it('transmet la préférence choisie au service', () => {
    const { section, saved } = render();

    void section['save']({
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

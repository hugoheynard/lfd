import type { Provider, Type } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { CompanyMemberRole, CompanyView, ContactView, ProfileView } from '@lfd/contracts';
import { FoldPanelHostService } from 'fold-ng';

import { AccountService } from '../../account/account.service';
import { NARROW_QUERY } from '../panel-side';

/**
 * **Le dossier de référence** des suites de `/mon-compte`, construit en
 * entier plutôt que forcé par un cast : un champ ajouté au contrat fait
 * échouer la compilation ici, pas un test plus loin.
 */

/** Le contact PRINCIPAL : `id` nul, c'est ce qui le distingue au contrat. */
export const HOLDER: ContactView = {
  id: null,
  firstName: 'Hugo',
  lastName: 'Heynard',
  fonction: 'Directeur',
  email: 'hheynard@gmail.com',
  phone: '06 12 44 08 71',
  role: null,
};

/** Un contact additionnel, sans espace utilisateur ni téléphone au dossier. */
export const COMPTA: ContactView = {
  id: 'ct_1',
  firstName: 'Cabinet',
  lastName: 'Ferrand',
  fonction: 'Comptabilité',
  email: 'compta@cabinet-ferrand.fr',
  phone: '',
  role: 'billing',
};

export const TOMMEUSES: CompanyView = {
  id: 'cmp_1',
  reference: 'C-6KTQAT',
  raisonSociale: 'SAS Les Tommeuses',
  enseigne: "La Folie Douce Val d'Isère",
  formeJuridique: 'SAS',
  siret: '81245678900021',
  siren: '',
  vatNumber: 'FR45812456789',
  vatNumberRequired: true,
  status: 'active',
  grantedTerms: ['monthly'],
  requestedTerm: null,
  role: 'owner',
  primaryContact: HOLDER,
  contacts: [COMPTA],
  kbis: { fileName: 'kbis-tommeuses.pdf', uploadedAt: '2026-02-12T00:00:00.000Z', certified: true },
  fulfillmentPreference: {
    method: null,
    pickupAddressId: null,
    deliveryAddressId: null,
    signatureRequired: false,
  },
};

/** La même société, vue par un autre rôle. */
export function asRole(role: CompanyMemberRole, company: CompanyView = TOMMEUSES): CompanyView {
  return { ...company, role };
}

/** La personne connectée : le détenteur de TOMMEUSES, sous son profil à elle. */
export const PROFILE: ProfileView = {
  userId: 'usr_1',
  firstName: 'Hugo',
  lastName: 'Heynard',
  email: 'hheynard@gmail.com',
  phone: '06 12 44 08 71',
};

/** `GET /me` déjà lu : ces sociétés-là, ce profil-là, et rien en vol. */
export function accountWith(
  companies: readonly CompanyView[],
  profile: ProfileView | null = PROFILE,
): Provider {
  return {
    provide: AccountService,
    useValue: {
      companies: () => companies,
      profile: () => profile,
      status: () => 'ready',
      // Le compte relu, dont `ClientWorkspace` tire l'espace : sans préférence,
      // une société seule est l'espace courant (plan D5).
      account: () =>
        profile === null
          ? null
          : { profile, companies, navPrefs: { catalogueView: null, workspace: null } },
    },
  };
}

/** Monte une carte sur ces sociétés, avec les doublés propres à sa suite. */
export function bootCard<T>(
  component: Type<T>,
  companies: readonly CompanyView[],
  providers: readonly Provider[] = [],
): ComponentFixture<T> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [component],
    providers: [accountWith(companies), ...providers],
  });
  const fixture = TestBed.createComponent(component);
  fixture.detectChanges();
  return fixture;
}

/** Ce que `matchMedia` répond à une largeur donnée — `panelSide()` le lit au clic. */
export function matchMediaAt(
  narrow: boolean,
): (query: string) => { matches: boolean; media: string } {
  return (query) => ({ matches: narrow && query === NARROW_QUERY, media: query });
}

/** Le panneau que la carte a ouvert : son composant, sa charge, son côté. */
export function openedPanel(): { component: unknown; data: unknown; side: string } | null {
  const [panel] = TestBed.inject(FoldPanelHostService).panels();
  if (panel?.kind !== 'component') {
    return null;
  }
  return { component: panel.component, data: panel.data, side: panel.side };
}

/** Le bouton du bas d'une carte mobile. */
export function footButton(host: HTMLElement): HTMLButtonElement {
  const button = host.querySelector<HTMLButtonElement>('app-card-foot button');
  if (button === null) {
    throw new Error('Pas de bouton en bas de carte.');
  }
  return button;
}

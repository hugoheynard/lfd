import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { CompanyView } from '@lfd/contracts';

import { AccountService } from '../../../account/account.service';
import { FR } from '../../copy/fr';
import { ComptePage } from './compte-page';

/** La société du client de référence, telle que `GET /me` la rend. */
const TOMMEUSES = {
  id: 'cmp_1',
  reference: 'C-6KTQAT',
  raisonSociale: 'SAS Les Tommeuses',
  enseigne: "La Folie Douce Val d'Isère",
  formeJuridique: 'SAS',
  siret: '81245678900021',
  vatNumber: 'FR45812456789',
  status: 'active',
  grantedTerms: ['monthly'],
  requestedTerm: null,
  role: 'owner',
  primaryContact: {
    id: null,
    firstName: 'Hugo',
    lastName: 'Heynard',
    fonction: 'Directeur',
    email: 'hheynard@gmail.com',
    phone: '06 12 44 08 71',
    role: null,
  },
  contacts: [
    {
      id: 'ct_1',
      firstName: 'Cabinet',
      lastName: 'Ferrand',
      fonction: 'Comptabilité',
      email: 'compta@cabinet-ferrand.fr',
      phone: '',
      role: 'billing',
    },
  ],
  kbis: { fileName: 'kbis-tommeuses.pdf', uploadedAt: '2026-02-12T00:00:00.000Z', certified: true },
  fulfillmentPreference: {
    method: null,
    pickupAddressId: null,
    deliveryAddressId: null,
    signatureRequired: false,
  },
} as unknown as CompanyView;

function boot(companies: readonly CompanyView[]): ComponentFixture<ComptePage> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [ComptePage],
    providers: [
      provideRouter([]),
      { provide: AccountService, useValue: { companies: () => companies } },
    ],
  });
  const fixture = TestBed.createComponent(ComptePage);
  fixture.detectChanges();
  return fixture;
}

/**
 * 🔴 **Cet écran était le dossier d'une autre maison.** « Brasserie Marchand »,
 * son SIRET, son KBIS « vérifié par Léa », ses cinq utilisateurs, son mandat
 * SEPA — tout écrit en dur. Il lit désormais `GET /me`.
 */
describe('ComptePage', () => {
  let fixture: ComponentFixture<ComptePage>;

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;

  beforeEach(() => {
    fixture = boot([TOMMEUSES]);
  });

  it('donne sept cartes, et un sommaire qui pointe LEURS ancres', () => {
    // Le sommaire fait défiler, il ne change pas d'écran : une entrée qui
    // pointerait une ancre absente romprait la promesse écrite sous la liste.
    const anchors = Array.from(el().querySelectorAll('.summary-link')).map((a) =>
      a.getAttribute('href')?.slice(1),
    );
    expect(anchors.length).toBe(7);
    for (const anchor of anchors) {
      expect(el().querySelector(`#${anchor}`)).not.toBeNull();
    }
  });

  it('dit la règle plutôt que de griser le champ', () => {
    // Un champ mort se lit comme une panne ; une phrase se lit comme une règle.
    expect(el().textContent).toContain(FR.account.identityNote);
    expect(el().querySelectorAll('input[disabled]').length).toBe(0);
  });

  it('porte l’identité légale de LA société, pas celle d’une maquette', () => {
    const shown = el().textContent ?? '';

    expect(shown).toContain('SAS Les Tommeuses');
    expect(shown).toContain('81245678900021');
    expect(shown).not.toContain('Marchand');
  });

  /** Le fil ne porte ni la date de vérification ni son auteur : on ne les invente pas. */
  it('dit si l’extrait est certifié, et rien de plus', () => {
    expect(el().querySelector('.kbis-verified')?.textContent).toContain(FR.account.kbisCertified);
    expect(el().textContent).toContain('kbis-tommeuses.pdf');
  });

  it('sort le détenteur de la liste, et compte tout le monde', () => {
    expect(el().querySelectorAll('.holder').length).toBe(1);
    expect(el().querySelectorAll('.person').length).toBe(1);
  });

  it('n’offre les deux gestes irréversibles qu’en BORDÉ, dans leur territoire', () => {
    // Un aplat rouge invite au clic.
    const zone = el().querySelector('.danger');
    expect(zone?.querySelectorAll('.danger-cta').length).toBe(2);
    expect(zone?.textContent).toContain(FR.account.closeBody);
  });

  /**
   * Aucune société ⇒ **aucun dossier**. L'écran affichait un compte complet à
   * qui n'est pas connecté ; c'était le dossier de personne.
   */
  it('ne montre aucun dossier quand personne n’est reconnu', () => {
    fixture = boot([]);

    expect((el().textContent ?? '').includes('Tommeuses')).toBe(false);
    expect(el().textContent).toContain(FR.account.cardUnknown);
  });
});

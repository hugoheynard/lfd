import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { CompanyView } from '@lfd/contracts';

import { AccountService } from '../../../account/account.service';
import { ClientCompany } from '../../client-company.service';
import { FR } from '../../copy/fr';
import { AccountCard } from './account-card';

/** La société telle que `GET /me` la rend — celle du client de référence. */
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
  contacts: [],
  kbis: null,
} as unknown as CompanyView;

function boot(companies: readonly CompanyView[]): ComponentFixture<AccountCard> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [AccountCard],
    providers: [
      {
        provide: AccountService,
        useValue: {
          companies: () => companies,
          status: () => 'ready',
          // Le compte relu, dont `ClientWorkspace` tire l'espace : une société seule est l'espace.
          account: () => ({
            profile: null,
            companies,
            navPrefs: { catalogueView: null, workspace: null },
          }),
        },
      },
    ],
  });
  // Le VRAI dépôt, pas un doublé : c'est lui qui choisit l'enseigne plutôt que
  // la raison sociale, et cette règle-là doit être traversée.
  TestBed.inject(ClientCompany);
  const fixture = TestBed.createComponent(AccountCard);
  fixture.detectChanges();
  return fixture;
}

/**
 * 🔴 **Cette carte affichait « Brasserie Marchand »** — écrit en dur, avec sa
 * remise, son plafond et sa date d'entrée. Quelqu'un de connecté y lisait le nom
 * d'une autre maison, sur l'écran censé lui dire qui il est chez nous.
 */
describe('la carte de compte', () => {
  const text = (fixture: ComponentFixture<AccountCard>): string =>
    (fixture.nativeElement as HTMLElement).textContent ?? '';

  it('porte l’ENSEIGNE de la société, pas sa raison sociale', () => {
    // On s'appelle « La Folie Douce », pas « SAS Les Tommeuses ».
    const shown = text(boot([TOMMEUSES]));

    expect(shown).toContain("La Folie Douce Val d'Isère");
    expect(shown).toContain('C-6KTQAT');
  });

  it('retombe sur la raison sociale quand il n’y a pas d’enseigne', () => {
    expect(text(boot([{ ...TOMMEUSES, enseigne: '' }]))).toContain('SAS Les Tommeuses');
  });

  /** À la commande est toujours ouvert ; au compte attend tant qu'il n'est pas accordé. */
  it('dit les deux modes de paiement, et ce qu’attend le paiement au compte', () => {
    const granted = text(boot([TOMMEUSES]));
    expect(granted).toContain(FR.account.cardPaymentOnOrder);
    expect(granted).toContain(FR.account.cardPaymentOnAccount);
    expect(granted).not.toContain(FR.account.cardPaymentPending);

    expect(text(boot([{ ...TOMMEUSES, grantedTerms: [] }]))).toContain(
      FR.account.cardPaymentPending,
    );
  });

  /** Le badge l'affirmait sans regarder ; il dit l'état du dossier. */
  it('dit l’état du dossier en badge, et « en cours » ne se peint pas en vert', () => {
    const active = boot([TOMMEUSES]);
    expect(text(active)).toContain(FR.account.states.active);

    const pending = boot([{ ...TOMMEUSES, status: 'pending' }]);
    expect(text(pending)).toContain(FR.account.states.pending);
    const badge = (pending.nativeElement as HTMLElement).querySelector('.state');
    expect(badge?.getAttribute('data-tone')).toBe('wait');
  });

  /**
   * Personne de reconnu ⇒ **aucun nom**. Un nom d'exemple serait celui de
   * quelqu'un d'autre — c'est vrai d'une adresse, plus encore d'un SIRET.
   */
  it('ne montre aucune société quand personne n’est reconnu', () => {
    const shown = text(boot([]));

    expect(shown).toContain(FR.account.cardUnknown);
    expect(shown).not.toContain('Tommeuses');
  });
});

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
    providers: [{ provide: AccountService, useValue: { companies: () => companies } }],
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

  /** Un terme ACCORDÉ n'est pas le défaut, et les deux écrans diffèrent. */
  it('dit le terme convenu, et le défaut quand il n’y en a pas', () => {
    expect(text(boot([TOMMEUSES]))).toContain(FR.account.cardTermMonthly);
    expect(text(boot([{ ...TOMMEUSES, grantedTerms: [] }]))).toContain(FR.account.cardTermOrder);
  });

  /** La pastille l'affirmait sans regarder ; elle regarde. */
  it('n’affirme « Actif » que si le compte l’est', () => {
    expect(text(boot([TOMMEUSES]))).toContain(FR.account.cardActive);
    expect(text(boot([{ ...TOMMEUSES, status: 'pending' }]))).not.toContain(FR.account.cardActive);
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

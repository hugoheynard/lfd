import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { CompanyView, ContactView } from '@lfd/contracts';

import { AccountService } from '../../../account/account.service';
import { FR } from '../../copy/fr';
import { UsersCard } from './users-card';

/** Le contact PRINCIPAL : `id` nul, c'est ce qui le distingue au contrat. */
const HOLDER: ContactView = {
  id: null,
  firstName: 'Hugo',
  lastName: 'Heynard',
  fonction: 'Directeur',
  email: 'hheynard@gmail.com',
  phone: '06 12 44 08 71',
  role: null,
};

/** Un contact additionnel, sans espace utilisateur ni téléphone au dossier. */
const COMPTA: ContactView = {
  id: 'ct_1',
  firstName: 'Cabinet',
  lastName: 'Ferrand',
  fonction: 'Comptabilité',
  email: 'compta@cabinet-ferrand.fr',
  phone: '',
  role: 'billing',
};

const TOMMEUSES = {
  primaryContact: HOLDER,
  contacts: [COMPTA],
} as unknown as CompanyView;

function boot(companies: readonly CompanyView[]): ComponentFixture<UsersCard> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [UsersCard],
    providers: [{ provide: AccountService, useValue: { companies: () => companies } }],
  });
  const fixture = TestBed.createComponent(UsersCard);
  fixture.detectChanges();
  return fixture;
}

/**
 * 🔴 **Cette carte listait cinq personnes qui n'existent pas** — Pierre, Hélène,
 * Karim, le cabinet Ferrand, Léna — avec leurs droits et leurs dates
 * d'invitation, tous écrits en dur. Elle lit `GET /me`.
 */
describe('UsersCard', () => {
  let fixture: ComponentFixture<UsersCard>;

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;

  beforeEach(() => {
    fixture = boot([TOMMEUSES]);
  });

  /**
   * DEUX états, et non trois. Le fil ne dit pas qu'une invitation court : ça
   * existe au domaine, pas sur ce fil-ci. On ne le devine pas.
   */
  it('sort le détenteur de la liste, et marque les autres comme contacts', () => {
    expect(el().querySelector('.holder-name')?.textContent).toContain('Hugo Heynard');
    const tags = Array.from(el().querySelectorAll('.people .tag')).map((n) =>
      n.textContent?.trim(),
    );
    expect(tags).toEqual([FR.account.tagContact]);
  });

  /** La sous-ligne dit la fonction ET le rôle — trois booléens inventés disaient moins. */
  it('dit la fonction ET le rôle sur la même ligne', () => {
    expect(el().querySelector('.person-line')?.textContent?.trim()).toBe(
      'Comptabilité · Facturation',
    );
  });

  it('ouvre le panneau sur la personne cliquée', () => {
    expect(el().querySelector('app-client-dialog')).toBeNull();
    el().querySelector<HTMLButtonElement>('.person')?.click();
    fixture.detectChanges();

    const panel = el().querySelector('app-client-dialog');
    expect(panel?.textContent).toContain('Cabinet Ferrand');
    // Un contact reçoit les factures et rien d'autre : le bloc d'espace propose
    // d'inviter, il ne prétend pas que la personne a déjà un accès.
    expect(panel?.textContent).toContain(FR.account.spaceInvite);
  });

  it('le détenteur lit POURQUOI son accès ne se retire pas d’ici', () => {
    el().querySelector<HTMLButtonElement>('.holder')?.click();
    fixture.detectChanges();

    const panel = el().querySelector('app-client-dialog');
    expect(panel?.textContent).toContain(FR.account.spaceSelf);
    expect(panel?.querySelector('.space-danger')).toBeNull();
  });

  it('écrit « non renseigné » plutôt qu’un vide', () => {
    el().querySelector<HTMLButtonElement>('.person')?.click();
    fixture.detectChanges();

    expect(el().querySelector('.facts dd.absent')?.textContent).toContain(FR.account.noPhone);
  });

  /** Le nom identifie ; à défaut, c'est l'adresse — jamais une ligne muette. */
  it('retombe sur l’e-mail quand la personne n’a pas de nom', () => {
    fixture = boot([
      { ...TOMMEUSES, contacts: [{ ...COMPTA, firstName: '', lastName: '' }] } as CompanyView,
    ]);

    expect(el().querySelector('.person-name')?.textContent).toContain('compta@cabinet-ferrand.fr');
  });

  it('ne montre personne quand aucune société n’est connue', () => {
    fixture = boot([]);

    expect(el().querySelectorAll('.person')).toHaveLength(0);
    expect(el().querySelector('.holder')).toBeNull();
  });
});

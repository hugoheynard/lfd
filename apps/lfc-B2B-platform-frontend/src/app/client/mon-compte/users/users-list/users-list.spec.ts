import { ComponentFixture } from '@angular/core/testing';

import { FR } from '../../../copy/fr';
import { bootCard, COMPTA, TOMMEUSES } from '../../account.fixture';
import { UsersList } from './users-list';

/**
 * 🔴 **Cette liste portait cinq personnes qui n'existent pas** — Pierre, Hélène,
 * Karim, le cabinet Ferrand, Léna — avec leurs droits et leurs dates
 * d'invitation, tous écrits en dur. Elle lit `GET /me`.
 */
describe('UsersList', () => {
  let fixture: ComponentFixture<UsersList>;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;

  beforeEach(() => {
    fixture = bootCard(UsersList, [TOMMEUSES]);
  });

  it('sort le détenteur de la liste, et marque les autres comme contacts', () => {
    expect(el().querySelector('.holder-name')?.textContent).toContain('Hugo Heynard');
    const tags = Array.from(el().querySelectorAll('.people .tag')).map((n) =>
      n.textContent?.trim(),
    );
    expect(tags).toEqual([FR.account.tagContact]);
  });

  it('dit la fonction ET le rôle sur la même ligne', () => {
    expect(el().querySelector('.person-line')?.textContent?.trim()).toBe(
      'Comptabilité · Facturation',
    );
  });

  it('ouvre la fiche de la personne cliquée', () => {
    expect(el().querySelector('app-client-dialog')).toBeNull();
    el().querySelector<HTMLButtonElement>('.person')?.click();
    fixture.detectChanges();

    const panel = el().querySelector('app-client-dialog');
    expect(panel?.textContent).toContain('Cabinet Ferrand');
    expect(panel?.textContent).toContain(FR.account.spaceInvite);
  });

  it('le détenteur lit POURQUOI son accès ne se retire pas d’ici', () => {
    el().querySelector<HTMLButtonElement>('.holder')?.click();
    fixture.detectChanges();

    expect(el().querySelector('app-client-dialog')?.textContent).toContain(FR.account.spaceSelf);
  });

  it('retombe sur l’e-mail quand la personne n’a pas de nom', () => {
    fixture = bootCard(UsersList, [
      { ...TOMMEUSES, contacts: [{ ...COMPTA, firstName: '', lastName: '' }] },
    ]);

    expect(el().querySelector('.person-name')?.textContent).toContain('compta@cabinet-ferrand.fr');
  });

  it('ne montre personne quand aucune société n’est connue', () => {
    fixture = bootCard(UsersList, []);

    expect(el().querySelectorAll('.person')).toHaveLength(0);
    expect(el().querySelector('.holder')).toBeNull();
  });
});

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FoldPanelHostService } from 'fold-ng';
import { afterEach, vi } from 'vitest';

import { FR } from '../../../copy/fr';
import {
  asRole,
  bootCard,
  COMPTA,
  matchMediaAt,
  openedPanel,
  TOMMEUSES,
} from '../../account.fixture';
import { ContactEditPanel } from '../contact-edit-panel/contact-edit-panel';
import { draftOf } from '../users-section';
import { UsersList } from './users-list';

afterEach(() => {
  TestBed.inject(FoldPanelHostService).dismissAll();
  vi.unstubAllGlobals();
});

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

  /** Plus de fiche intermédiaire (règle « Saisir », 2026-09-14) : le clic ouvre le dialogue. */
  it('un clic sur une personne ouvre directement son dialogue', () => {
    vi.stubGlobal('matchMedia', matchMediaAt(false));
    el().querySelector<HTMLButtonElement>('.person')?.click();

    expect(openedPanel()).toEqual({
      component: ContactEditPanel,
      side: 'center',
      data: { companyId: 'cmp_1', contactId: 'ct_1', initial: draftOf(COMPTA), canManage: true },
    });
    expect(el().querySelector('app-client-dialog')).toBeNull();
  });

  it('le détenteur s’ouvre aussi en dialogue — en lecture seule pour un rôle qui ne gère pas', () => {
    fixture = bootCard(UsersList, [asRole('orders')]);
    vi.stubGlobal('matchMedia', matchMediaAt(true));
    el().querySelector<HTMLButtonElement>('.holder')?.click();

    expect(openedPanel()?.component).toBe(ContactEditPanel);
    expect(openedPanel()?.side).toBe('bottom');
    expect(openedPanel()?.data).toMatchObject({ contactId: null, canManage: false });
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

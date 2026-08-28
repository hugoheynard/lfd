import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FR } from '../../copy/fr';
import { UsersCard } from './users-card';

describe('UsersCard', () => {
  let fixture: ComponentFixture<UsersCard>;

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [UsersCard] });
    fixture = TestBed.createComponent(UsersCard);
    fixture.detectChanges();
  });

  it('distingue les TROIS états, jamais deux', () => {
    const tags = Array.from(el().querySelectorAll('.tag')).map((n) => n.textContent?.trim());
    expect(tags).toEqual([
      FR.account.tagActive,
      FR.account.tagActive,
      FR.account.tagContact,
      FR.account.tagInvited,
    ]);
  });

  it('dit la fonction ET les droits sur la même ligne', () => {
    const lines = Array.from(el().querySelectorAll('.person-line')).map((n) =>
      n.textContent?.trim(),
    );
    expect(lines[2]).toBe(`Comptable · ${FR.account.canInvoices}`);
  });

  it('ouvre le panneau sur la personne cliquée, et le referme', () => {
    expect(el().querySelector('app-client-dialog')).toBeNull();
    el().querySelectorAll<HTMLButtonElement>('.person')[2]?.click();
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
    el().querySelectorAll<HTMLButtonElement>('.person')[2]?.click();
    fixture.detectChanges();
    expect(el().querySelector('.facts dd.absent')?.textContent).toContain(FR.account.noPhone);
  });
});

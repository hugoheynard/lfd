import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ContactFields } from '@lfd/b2b-ui/company';
import { FoldPanelRef } from 'fold-ng';

import type { ContactDraft } from '../../../../account/account.model';
import { AccountService } from '../../../../account/account.service';
import { FR } from '../../../copy/fr';
import { UserAddPanel } from './user-add-panel';

interface Wire {
  saves: { companyId: string; draft: ContactDraft }[];
  answer: string | null;
  closes: unknown[];
}

let wire: Wire;

function boot(): ComponentFixture<UserAddPanel> {
  wire = { saves: [], answer: null, closes: [] };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [UserAddPanel],
    providers: [
      {
        provide: AccountService,
        useValue: {
          saveContact: (companyId: string, draft: ContactDraft): Promise<string | null> => {
            wire.saves.push({ companyId, draft });
            return Promise.resolve(wire.answer);
          },
        },
      },
      { provide: FoldPanelRef, useValue: new FoldPanelRef(1, (r) => wire.closes.push(r)) },
    ],
  });
  const fixture = TestBed.createComponent(UserAddPanel);
  fixture.componentRef.setInput('data', { companyId: 'cmp_1' });
  fixture.detectChanges();
  return fixture;
}

describe('UserAddPanel', () => {
  let fixture: ComponentFixture<UserAddPanel>;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const submit = (): HTMLButtonElement | undefined =>
    Array.from(el().querySelectorAll<HTMLButtonElement>('fold-panel-footer button')).at(-1);

  const fill = (draft: ContactDraft): void => {
    const fields = fixture.debugElement.query(By.directive(ContactFields))
      .componentInstance as ContactFields;
    fields.value.set(draft);
    fixture.detectChanges();
  };

  const save = async (): Promise<void> => {
    submit()?.click();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const FERRAND: ContactDraft = {
    firstName: ' Cabinet ',
    lastName: 'Ferrand',
    fonction: 'Comptabilité',
    email: ' compta@cabinet-ferrand.fr ',
    phone: '',
    role: 'billing',
  };

  /** Un ajout crée un contact, pas un accès : le panneau le dit avant qu'on enregistre. */
  it('dit qu’un contact existe sans espace, et n’arme Enregistrer qu’avec l’e-mail et le rôle', () => {
    fixture = boot();

    expect(el().textContent).toContain(FR.account.usersNote);
    expect(submit()?.disabled).toBe(true);

    fill({ ...FERRAND, role: '' });
    expect(submit()?.disabled).toBe(true);

    fill(FERRAND);
    expect(submit()?.disabled).toBe(false);
  });

  it('poste le contact nettoyé, puis se ferme avec `true`', async () => {
    fixture = boot();
    fill(FERRAND);
    await save();

    expect(wire.saves).toEqual([
      {
        companyId: 'cmp_1',
        draft: {
          firstName: 'Cabinet',
          lastName: 'Ferrand',
          fonction: 'Comptabilité',
          email: 'compta@cabinet-ferrand.fr',
          phone: '',
          role: 'billing',
        },
      },
    ]);
    expect(wire.closes).toEqual([true]);
  });

  it('sur un refus, reste ouvert, se réarme et montre le message du serveur', async () => {
    fixture = boot();
    fill(FERRAND);
    wire.answer = 'Cette adresse est déjà au carnet.';
    await save();

    expect(wire.closes).toEqual([]);
    expect(submit()?.disabled).toBe(false);
    const callout = el().querySelector('fold-callout');
    expect(callout?.textContent).toContain(FR.account.usersAddFailed);
    expect(callout?.textContent).toContain('Cette adresse est déjà au carnet.');
  });
});

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FoldPanelRef } from 'fold-ng';

import type { UserProfileDraft } from '../../../account/account.model';
import { AccountService } from '../../../account/account.service';
import { FR } from '../../copy/fr';
import { EmailDialog } from './email-dialog';

const HUGO: UserProfileDraft = {
  firstName: 'Hugo',
  lastName: 'Heynard',
  email: 'hheynard@gmail.com',
  phone: '06 12 44 08 71',
};

interface Wire {
  saves: UserProfileDraft[];
  /** Le refus du serveur, ou `null` pour un succès. */
  answer: string | null;
  closed: unknown[];
}

let wire: Wire;

function boot(): ComponentFixture<EmailDialog> {
  wire = { saves: [], answer: null, closed: [] };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [EmailDialog],
    providers: [
      {
        provide: AccountService,
        useValue: {
          saveMyProfile: (draft: UserProfileDraft): Promise<string | null> => {
            wire.saves.push(draft);
            return Promise.resolve(wire.answer);
          },
        },
      },
      {
        provide: FoldPanelRef,
        useValue: {
          close: (result?: unknown): void => {
            wire.closed.push(result);
          },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(EmailDialog);
  fixture.componentRef.setInput('data', HUGO);
  fixture.detectChanges();
  return fixture;
}

describe('EmailDialog', () => {
  let fixture: ComponentFixture<EmailDialog>;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;

  /** Les deux champs, dans l'ordre : la nouvelle adresse, puis sa confirmation. */
  const inputs = (): readonly HTMLInputElement[] => {
    const found = Array.from(el().querySelectorAll('fold-input input'));
    if (found.length !== 2 || !found.every((node) => node instanceof HTMLInputElement)) {
      throw new Error(`Attendu deux champs d'adresse, trouvé ${String(found.length)}.`);
    }
    return found;
  };

  const typeIn = (index: 0 | 1, value: string): void => {
    const field = inputs()[index];
    if (field === undefined) {
      throw new Error('Champ absent.');
    }
    field.value = value;
    field.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };

  /**
   * Quitter le champ. `fold-input` n'affiche ses erreurs qu'une fois TOUCHÉ —
   * il ne crie pas pendant la frappe, et c'est ce qu'on veut : la confirmation
   * est forcément différente de la nouvelle adresse au premier caractère.
   */
  const leave = (index: 0 | 1): void => {
    inputs()[index]?.dispatchEvent(new Event('blur'));
    fixture.detectChanges();
  };

  /** Les deux champs d'un coup, ce qu'on fait dans presque tous les cas. */
  const type = (value: string, confirmation: string = value): void => {
    typeIn(0, value);
    typeIn(1, confirmation);
  };

  const saveButton = (): HTMLButtonElement => {
    const found = Array.from(el().querySelectorAll<HTMLButtonElement>('button')).find(
      (b) => (b.textContent ?? '').trim() === FR.account.save,
    );
    if (!found) {
      throw new Error(`Pas de bouton « ${FR.account.save} ».`);
    }
    return found;
  };

  const save = async (): Promise<void> => {
    saveButton().click();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  beforeEach(() => {
    fixture = boot();
  });

  /**
   * Les champs partent **vides** : les pré-remplir obligerait à effacer avant
   * d'écrire, et rendrait la confirmation absurde — il suffirait de ne toucher
   * à rien. L'adresse actuelle est donc rappelée à côté, pas dans un champ.
   */
  it('ouvre sur deux champs vides, rappelle l’adresse actuelle et ce que la changer emporte', () => {
    expect(inputs().map((field) => field.value)).toEqual(['', '']);
    expect(el().textContent).toContain(FR.account.loginMethodEmailCurrent);
    expect(el().textContent).toContain('hheynard@gmail.com');
    expect(el().querySelector('fold-callout[variant="warning"]')?.textContent).toContain(
      FR.account.profileEmailChange,
    );
  });

  /**
   * Le second champ n'est pas une politesse : une adresse de connexion mal
   * tapée part chez Auth0, devient l'identifiant, et le courriel de
   * vérification s'en va chez personne. On le DIT sous le champ plutôt que de
   * griser un bouton sans raison visible (Hugo, 2026-09-22).
   */
  it('refuse deux adresses différentes, et dit pourquoi', () => {
    type('hugo@lafoliedouce.fr', 'hugo@lafoliedouce.f');
    leave(1);

    expect(saveButton().disabled).toBe(true);
    expect(el().textContent).toContain(FR.account.loginMethodEmailMismatch);

    typeIn(1, 'hugo@lafoliedouce.fr');
    expect(saveButton().disabled).toBe(false);
    expect(el().textContent).not.toContain(FR.account.loginMethodEmailMismatch);
  });

  /** La casse et les blancs ne sont pas une faute de frappe : même boîte. */
  it('accepte une confirmation qui ne diffère que par la casse ou les blancs', () => {
    type('hugo@lafoliedouce.fr', '  HUGO@LaFolieDouce.FR  ');

    expect(saveButton().disabled).toBe(false);
  });

  /** Renvoyer la même adresse ne servirait à rien — et partirait chez Auth0. */
  it('n’arme Enregistrer que sur une adresse différente, casse et blancs compris', () => {
    expect(saveButton().disabled).toBe(true);

    type(' HHeynard@gmail.com ');
    leave(0);
    expect(saveButton().disabled).toBe(true);
    expect(el().textContent).toContain(FR.account.loginMethodEmailSame);

    type('hugo@lafoliedouce.fr');
    expect(saveButton().disabled).toBe(false);

    type('   ');
    expect(saveButton().disabled).toBe(true);
  });

  /**
   * `PATCH /me/profile` remplace les quatre champs : le nom et le téléphone
   * repartent tels que `/me` les a rendus, sinon les enregistrer les effacerait.
   */
  it('envoie l’adresse rognée avec le reste du profil inchangé, puis ferme', async () => {
    type('  hugo@lafoliedouce.fr ');
    await save();

    expect(wire.saves).toEqual([
      {
        firstName: 'Hugo',
        lastName: 'Heynard',
        email: 'hugo@lafoliedouce.fr',
        phone: '06 12 44 08 71',
      },
    ]);
    expect(wire.closed).toEqual([true]);
  });

  it('sur un refus, reste ouvert et montre le message du serveur', async () => {
    wire.answer = 'Cette adresse e-mail est déjà utilisée par un compte.';
    type('deja@pris.fr');
    await save();

    expect(wire.closed).toEqual([]);
    const callout = el().querySelector('fold-callout[variant="alert"]');
    expect(callout?.textContent).toContain(FR.account.profileSaveFailed);
    expect(callout?.textContent).toContain('Cette adresse e-mail est déjà utilisée par un compte.');
    expect(saveButton().disabled).toBe(false);
  });

  it('ferme sans rien écrire sur Annuler', async () => {
    type('hugo@lafoliedouce.fr');
    const cancel = Array.from(el().querySelectorAll<HTMLButtonElement>('button')).find(
      (b) => (b.textContent ?? '').trim() === FR.account.cancel,
    );
    cancel?.click();
    await fixture.whenStable();

    expect(wire.saves).toEqual([]);
    expect(wire.closed).toEqual([undefined]);
  });
});

import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { CompanyView, ContactView } from '@lfd/contracts';
import { FoldPanelHostService } from 'fold-ng';
import { afterEach, vi } from 'vitest';

import { AccountService } from '../../../account/account.service';
import { FR } from '../../copy/fr';
import { asRole, COMPTA, HOLDER, matchMediaAt, openedPanel, TOMMEUSES } from '../account.fixture';
import { ContactEditPanel } from '../users/contact-edit-panel/contact-edit-panel';
import { draftOf } from '../users/users-section';
import { UserPanel } from './user-panel';

/** Ce que les doublés ont vu passer : les retraits demandés, les fermetures de la fiche. */
interface Wire {
  deletes: { companyId: string; contactId: string }[];
  answer: string | null;
  closes: number;
}

let wire: Wire;

function boot(company: CompanyView, contact: ContactView): ComponentFixture<UserPanel> {
  wire = { deletes: [], answer: null, closes: 0 };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [UserPanel],
    providers: [
      {
        provide: AccountService,
        useValue: {
          companies: () => [company],
          status: () => 'ready',
          deleteContact: (companyId: string, contactId: string): Promise<string | null> => {
            wire.deletes.push({ companyId, contactId });
            return Promise.resolve(wire.answer);
          },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(UserPanel);
  fixture.componentInstance.closed.subscribe(() => {
    wire.closes += 1;
  });
  fixture.componentRef.setInput('contact', contact);
  fixture.detectChanges();
  return fixture;
}

describe('UserPanel', () => {
  let fixture: ComponentFixture<UserPanel>;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;

  /** Les boutons dont le texte est exactement `text`. */
  const buttons = (text: string): HTMLButtonElement[] =>
    Array.from(el().querySelectorAll<HTMLButtonElement>('button')).filter(
      (b) => (b.textContent ?? '').trim() === text,
    );

  const only = (text: string): HTMLButtonElement => {
    const [found] = buttons(text);
    if (!found) {
      throw new Error(`Pas de bouton « ${text} ».`);
    }
    return found;
  };

  const settle = async (): Promise<void> => {
    await fixture.whenStable();
    fixture.detectChanges();
  };

  afterEach(() => {
    TestBed.inject(FoldPanelHostService).dismissAll();
    vi.unstubAllGlobals();
  });

  describe('les gestes selon le rôle', () => {
    for (const role of ['owner', 'admin'] as const) {
      it(`${role} : le détenteur se modifie, mais ne se supprime pas`, () => {
        fixture = boot(asRole(role), HOLDER);

        expect(buttons(FR.account.edit)).toHaveLength(1);
        expect(el().querySelector('fold-inline-confirm')).toBeNull();
        expect(buttons(FR.account.contactRemove)).toHaveLength(0);
      });

      it(`${role} : un contact se modifie et se supprime`, () => {
        fixture = boot(asRole(role), COMPTA);

        expect(buttons(FR.account.edit)).toHaveLength(1);
        expect(el().querySelector('fold-inline-confirm')).not.toBeNull();
        expect(buttons(FR.account.contactRemove)).toHaveLength(1);
      });
    }

    /** L'API refuse ces écritures hors `owner`/`admin` : pas de bouton qui finirait en refus. */
    for (const role of ['orders', 'billing'] as const) {
      it(`${role} : ni Modifier ni Supprimer, sur personne`, () => {
        for (const person of [HOLDER, COMPTA]) {
          fixture = boot(asRole(role), person);

          expect(el().querySelector('button[foldButton]')).toBeNull();
          expect(el().querySelector('fold-inline-confirm')).toBeNull();
          expect(el().textContent).toContain(person.email);
        }
      });
    }
  });

  /**
   * « Inviter à créer son espace » n'avait aucune action, et aucune route client
   * n'invite un contact (2026-09-14) : le bouton mort est retiré.
   */
  it('ne propose plus d’inviter un contact', () => {
    fixture = boot(TOMMEUSES, COMPTA);

    expect(el().textContent).not.toContain('Inviter');
    expect(el().textContent).toContain(FR.account.spaceContactBody);
    expect(el().querySelector('.space-cta')).toBeNull();
  });

  describe('Modifier', () => {
    it('ferme la fiche PUIS ouvre le panneau d’édition du contact', () => {
      vi.stubGlobal('matchMedia', matchMediaAt(false));
      fixture = boot(TOMMEUSES, COMPTA);

      only(FR.account.edit).click();

      expect(wire.closes).toBe(1);
      const panel = openedPanel();
      expect(panel?.component).toBe(ContactEditPanel);
      expect(panel?.data).toEqual({
        companyId: 'cmp_1',
        contactId: 'ct_1',
        initial: draftOf(COMPTA),
      });
    });

    it('ouvre le détenteur avec un identifiant nul', () => {
      vi.stubGlobal('matchMedia', matchMediaAt(true));
      fixture = boot(asRole('admin'), HOLDER);

      only(FR.account.edit).click();

      expect(openedPanel()?.data).toMatchObject({ companyId: 'cmp_1', contactId: null });
      expect(openedPanel()?.side).toBe('bottom');
    });
  });

  describe('Supprimer', () => {
    beforeEach(() => {
      fixture = boot(TOMMEUSES, COMPTA);
    });

    const ask = (): void => {
      only(FR.account.contactRemove).click();
      fixture.detectChanges();
    };

    it('demande confirmation en place, dans la langue de l’app, sans rien envoyer', () => {
      ask();

      expect(buttons(FR.account.contactRemoveConfirm)).toHaveLength(1);
      expect(el().textContent).toContain(FR.account.contactRemoveMessage);
      expect(wire.deletes).toEqual([]);
    });

    it('Annuler replie la confirmation sans appeler l’API', async () => {
      ask();
      const cancel = buttons(FR.account.cancel).at(-1);
      cancel?.click();
      await settle();

      expect(wire.deletes).toEqual([]);
      expect(wire.closes).toBe(0);
      expect(buttons(FR.account.contactRemoveConfirm)).toHaveLength(0);
      expect(buttons(FR.account.contactRemove)).toHaveLength(1);
    });

    it('confirmé, retire CE contact de CETTE société, puis ferme la fiche', async () => {
      ask();
      only(FR.account.contactRemoveConfirm).click();
      await settle();

      expect(wire.deletes).toEqual([{ companyId: 'cmp_1', contactId: 'ct_1' }]);
      expect(wire.closes).toBe(1);
    });

    it('sur un refus, reste ouverte, replie la confirmation et montre le message', async () => {
      wire.answer = 'Contact introuvable.';
      ask();
      only(FR.account.contactRemoveConfirm).click();
      await settle();

      expect(wire.closes).toBe(0);
      const callout = el().querySelector('fold-callout');
      expect(callout?.textContent).toContain(FR.account.contactRemoveFailed);
      expect(callout?.textContent).toContain('Contact introuvable.');
      expect(buttons(FR.account.contactRemove)).toHaveLength(1);
    });

    it('une autre personne ouverte n’hérite pas du refus de la précédente', async () => {
      wire.answer = 'Contact introuvable.';
      ask();
      only(FR.account.contactRemoveConfirm).click();
      await settle();
      expect(el().querySelector('fold-callout')).not.toBeNull();

      fixture.componentRef.setInput('contact', { ...COMPTA, id: 'ct_2' });
      fixture.detectChanges();

      expect(el().querySelector('fold-callout')).toBeNull();
    });
  });
});

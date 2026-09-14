import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ContactFields } from '@lfd/b2b-ui/company';
import { FoldPanelHostService, FoldPanelRef } from 'fold-ng';
import { afterEach, vi } from 'vitest';

import type { ContactDraft } from '../../../../account/account.model';
import { AccountService, type HolderDraft } from '../../../../account/account.service';
import { FR } from '../../../copy/fr';
import {
  asRole,
  COMPTA,
  HOLDER,
  matchMediaAt,
  openedPanel,
  TOMMEUSES,
} from '../../account.fixture';
import { draftOf } from '../users-section';
import { ContactEditPanel, type ContactEditPanelData } from './contact-edit-panel';

/** Ce que les doublés ont vu passer : chaque écriture, et les fermetures. */
interface Wire {
  holders: { companyId: string; draft: HolderDraft }[];
  contacts: { companyId: string; contactId: string; draft: ContactDraft }[];
  answer: string | null;
  closes: unknown[];
}

let wire: Wire;

const AS_HOLDER: ContactEditPanelData = {
  companyId: 'cmp_1',
  contactId: null,
  initial: draftOf(HOLDER),
};

const AS_CONTACT: ContactEditPanelData = {
  companyId: 'cmp_1',
  contactId: 'ct_1',
  initial: draftOf(COMPTA),
};

function boot(data: ContactEditPanelData): ComponentFixture<ContactEditPanel> {
  wire = { holders: [], contacts: [], answer: null, closes: [] };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [ContactEditPanel],
    providers: [
      {
        provide: AccountService,
        useValue: {
          saveHolder: (companyId: string, draft: HolderDraft): Promise<string | null> => {
            wire.holders.push({ companyId, draft });
            return Promise.resolve(wire.answer);
          },
          saveContactEdit: (
            companyId: string,
            contactId: string,
            draft: ContactDraft,
          ): Promise<string | null> => {
            wire.contacts.push({ companyId, contactId, draft });
            return Promise.resolve(wire.answer);
          },
        },
      },
      { provide: FoldPanelRef, useValue: new FoldPanelRef(1, (r) => wire.closes.push(r)) },
    ],
  });
  const fixture = TestBed.createComponent(ContactEditPanel);
  fixture.componentRef.setInput('data', data);
  fixture.detectChanges();
  return fixture;
}

describe('ContactEditPanel', () => {
  let fixture: ComponentFixture<ContactEditPanel>;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;

  const fields = (): ContactFields =>
    fixture.debugElement.query(By.directive(ContactFields)).componentInstance as ContactFields;

  const fill = (patch: Partial<ContactDraft>): void => {
    fields().value.update((draft) => ({ ...draft, ...patch }));
    fixture.detectChanges();
  };

  const button = (text: string): HTMLButtonElement => {
    const found = Array.from(
      el().querySelectorAll<HTMLButtonElement>('fold-panel-footer button'),
    ).find((b) => (b.textContent ?? '').trim() === text);
    if (!found) {
      throw new Error(`Pas de bouton « ${text} ».`);
    }
    return found;
  };

  const save = async (): Promise<void> => {
    button(FR.account.save).click();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('le détenteur', () => {
    beforeEach(() => {
      fixture = boot(AS_HOLDER);
    });

    it('se titre « détenteur », dit que l’adresse de connexion n’est pas ici, sans liste de rôles', () => {
      const header = el().querySelector('fold-panel-header')?.textContent ?? '';
      expect(header).toContain(FR.account.contactEditHolderTitle);
      expect(header).toContain(FR.account.contactEditHolderSubtitle);
      expect(el().querySelector('fold-listbox')).toBeNull();
    });

    it('préremplit les coordonnées que la fiche montrait', () => {
      expect(fields().value()).toEqual({
        firstName: 'Hugo',
        lastName: 'Heynard',
        fonction: 'Directeur',
        email: 'hheynard@gmail.com',
        phone: '06 12 44 08 71',
        role: '',
      });
    });

    it('n’arme Enregistrer qu’avec un changement ET une adresse', () => {
      expect(button(FR.account.save).disabled).toBe(true);

      fill({ phone: '06 00 00 00 00' });
      expect(button(FR.account.save).disabled).toBe(false);

      fill({ email: '   ' });
      expect(button(FR.account.save).disabled).toBe(true);

      fill({ email: 'hheynard@gmail.com', phone: ' 06 12 44 08 71 ' });
      expect(button(FR.account.save).disabled).toBe(true);
    });

    it('écrit le détenteur, nettoyé et SANS rôle, puis se ferme avec `true`', async () => {
      fill({ firstName: ' Hugo ', lastName: 'Heynard-Roux ', phone: '' });
      await save();

      expect(wire.contacts).toEqual([]);
      expect(wire.holders).toEqual([
        {
          companyId: 'cmp_1',
          draft: {
            firstName: 'Hugo',
            lastName: 'Heynard-Roux',
            fonction: 'Directeur',
            email: 'hheynard@gmail.com',
            phone: '',
          },
        },
      ]);
      expect(Object.keys(wire.holders[0]?.draft ?? {})).not.toContain('role');
      expect(wire.closes).toEqual([true]);
    });
  });

  describe('un contact du carnet', () => {
    beforeEach(() => {
      fixture = boot(AS_CONTACT);
    });

    it('se titre « contact », préremplit le rôle et le propose', () => {
      expect(el().querySelector('fold-panel-header')?.textContent).toContain(
        FR.account.contactEditTitle,
      );
      expect(el().querySelector('fold-listbox')).not.toBeNull();
      expect(fields().value().role).toBe('billing');
    });

    it('un changement de rôle seul suffit à armer Enregistrer', () => {
      fill({ role: 'orders' });
      expect(button(FR.account.save).disabled).toBe(false);
    });

    it('écrit le contact, rôle compris, sur SON identifiant', async () => {
      fill({ fonction: ' Expert-comptable ', role: 'orders' });
      await save();

      expect(wire.holders).toEqual([]);
      expect(wire.contacts).toEqual([
        {
          companyId: 'cmp_1',
          contactId: 'ct_1',
          draft: {
            firstName: 'Cabinet',
            lastName: 'Ferrand',
            fonction: 'Expert-comptable',
            email: 'compta@cabinet-ferrand.fr',
            phone: '',
            role: 'orders',
          },
        },
      ]);
      expect(wire.closes).toEqual([true]);
    });

    /** Le serveur exige un rôle : un contact d'avant les rôles doit en recevoir un. */
    it('un contact sans rôle part vide, et Enregistrer attend qu’on en choisisse un', () => {
      fixture = boot({ ...AS_CONTACT, initial: draftOf({ ...COMPTA, role: null }) });
      fill({ fonction: 'Comptable' });
      expect(button(FR.account.save).disabled).toBe(true);

      fill({ role: 'billing' });
      expect(button(FR.account.save).disabled).toBe(false);
    });

    it('sur un refus, reste ouvert, se réarme et montre le message du serveur', async () => {
      wire.answer = 'Cette adresse est déjà au carnet.';
      fill({ email: 'hheynard@gmail.com' });
      await save();

      expect(wire.closes).toEqual([]);
      expect(button(FR.account.save).disabled).toBe(false);
      const callout = el().querySelector('fold-callout');
      expect(callout?.textContent).toContain(FR.account.contactEditFailed);
      expect(callout?.textContent).toContain('Cette adresse est déjà au carnet.');
    });

    it('Annuler ferme sans rien écrire', () => {
      fill({ fonction: 'Brouillon abandonné' });
      button(FR.account.cancel).click();

      expect(wire.contacts).toEqual([]);
      expect(wire.closes).toEqual([undefined]);
    });
  });

  describe('open()', () => {
    afterEach(() => {
      TestBed.inject(FoldPanelHostService).dismissAll();
    });

    it('ouvre sur la personne, en empilant, du côté que la largeur dicte', () => {
      boot(AS_CONTACT);
      vi.stubGlobal('matchMedia', matchMediaAt(true));

      ContactEditPanel.open(TestBed.inject(FoldPanelHostService), TOMMEUSES, COMPTA);

      const panel = openedPanel();
      expect(panel?.component).toBe(ContactEditPanel);
      expect(panel?.side).toBe('bottom');
      expect(panel?.data).toEqual({
        companyId: 'cmp_1',
        contactId: 'ct_1',
        initial: draftOf(COMPTA),
      });
    });

    it('le détenteur s’ouvre avec un identifiant nul', () => {
      boot(AS_HOLDER);
      vi.stubGlobal('matchMedia', matchMediaAt(false));

      ContactEditPanel.open(TestBed.inject(FoldPanelHostService), asRole('admin'), HOLDER);

      expect(openedPanel()?.data).toMatchObject({ contactId: null });
      expect(openedPanel()?.side).toBe('right');
    });

    /** L'API refuse l'écriture hors `owner`/`admin` : le panneau ne s'ouvre même pas. */
    it('n’ouvre rien aux rôles que l’API refuse', () => {
      boot(AS_CONTACT);
      vi.stubGlobal('matchMedia', matchMediaAt(false));
      const panels = TestBed.inject(FoldPanelHostService);

      for (const role of ['orders', 'billing'] as const) {
        ContactEditPanel.open(panels, asRole(role), COMPTA);
        expect(openedPanel()).toBeNull();
      }
    });
  });
});

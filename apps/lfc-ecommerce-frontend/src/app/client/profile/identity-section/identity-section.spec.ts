import { ComponentFixture, TestBed } from '@angular/core/testing';

import type { UserProfileDraft } from '../../../account/account.model';
import { AccountService } from '../../../account/account.service';
import { FR } from '../../copy/fr';
import { IdentitySection } from './identity-section';

interface Wire {
  saves: UserProfileDraft[];
  answer: string | null;
}

let wire: Wire;

const HUGO: UserProfileDraft = {
  firstName: 'Hugo',
  lastName: 'Heynard',
  email: 'hheynard@gmail.com',
  phone: '06 12 44 08 71',
};

function boot(data: UserProfileDraft = HUGO): ComponentFixture<IdentitySection> {
  wire = { saves: [], answer: null };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [IdentitySection],
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
    ],
  });
  const fixture = TestBed.createComponent(IdentitySection);
  fixture.componentRef.setInput('data', data);
  fixture.detectChanges();
  return fixture;
}

describe('IdentitySection', () => {
  let fixture: ComponentFixture<IdentitySection>;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;

  const field = (label: string): HTMLInputElement => {
    const host = Array.from(el().querySelectorAll('fold-input')).find((node) =>
      (node.textContent ?? '').includes(label),
    );
    const input = host?.querySelector('input');
    if (!input) {
      throw new Error(`Pas de champ « ${label} ».`);
    }
    return input;
  };

  const type = (label: string, value: string): void => {
    const input = field(label);
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };

  const saveButton = (): HTMLButtonElement => {
    const found = Array.from(el().querySelectorAll<HTMLButtonElement>('.actions button')).find(
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

  it('préremplit les trois champs du profil', () => {
    expect(field(FR.account.profileFirstName).value).toBe('Hugo');
    expect(field(FR.account.profileLastName).value).toBe('Heynard');
    expect(field(FR.account.panelPhone).value).toBe('06 12 44 08 71');
  });

  /**
   * L'adresse est la CLÉ D'ACCÈS, pas une coordonnée : elle vit sur sa méthode
   * de connexion (Hugo, 2026-09-22), et une seule fois sur la page.
   */
  it('ne montre ni ne modifie l’adresse de connexion', () => {
    expect(el().textContent).not.toContain(FR.account.profileEmail);
    expect(el().textContent).not.toContain('hheynard@gmail.com');
    expect(el().querySelector('fold-callout[variant="warning"]')).toBeNull();
  });

  /**
   * C'est TOUTE la raison de la page : ici rien n'est parti tant qu'on n'a pas
   * cliqué, là où les méthodes de connexion agissent tout de suite.
   */
  it('n’arme Enregistrer que lorsque quelque chose a changé', () => {
    expect(saveButton().disabled).toBe(true);

    type(FR.account.panelPhone, '');
    expect(saveButton().disabled).toBe(false);

    type(FR.account.panelPhone, ' 06 12 44 08 71 ');
    expect(saveButton().disabled).toBe(true);
  });

  /** Le domaine exige prénom et nom : un envoi qui reviendrait en 400 ne part pas. */
  it.each([[FR.account.profileFirstName], [FR.account.profileLastName]])(
    'désarme Enregistrer quand « %s » est vidé',
    (label) => {
      type(FR.account.panelPhone, '');
      type(label, '   ');

      expect(saveButton().disabled).toBe(true);
    },
  );

  /**
   * `PATCH /me/profile` remplace les quatre champs : l'adresse relue repart
   * telle quelle, sans quoi une identité enregistrée d'ici effacerait l'adresse
   * de connexion.
   */
  it('envoie les champs nettoyés, l’adresse de connexion INCHANGÉE', async () => {
    type(FR.account.profileFirstName, ' Hugo ');
    type(FR.account.panelPhone, '');
    await save();

    expect(wire.saves).toEqual([
      { firstName: 'Hugo', lastName: 'Heynard', email: 'hheynard@gmail.com', phone: '' },
    ]);
  });

  it('sur un refus, se réarme et montre le message du serveur', async () => {
    wire.answer = 'Votre téléphone n’a pas pu être enregistré.';
    type(FR.account.panelPhone, '06 00 00 00 00');
    await save();

    expect(saveButton().disabled).toBe(false);
    const callout = el().querySelector('fold-callout[variant="alert"]');
    expect(callout?.textContent).toContain(FR.account.profileSaveFailed);
    expect(callout?.textContent).toContain('Votre téléphone n’a pas pu être enregistré.');
  });

  /**
   * Le serveur relu redevient l'état de départ : sans ce recalage, « Enregistrer »
   * resterait armé après un succès, et proposerait de renvoyer ce qui est déjà
   * écrit.
   */
  it('se recale sur le profil relu, et rendort Enregistrer', async () => {
    type(FR.account.profileFirstName, 'Hugues');
    await save();

    fixture.componentRef.setInput('data', { ...HUGO, firstName: 'Hugues' });
    fixture.detectChanges();

    expect(field(FR.account.profileFirstName).value).toBe('Hugues');
    expect(saveButton().disabled).toBe(true);
    expect(el().querySelector('fold-callout[variant="alert"]')).toBeNull();
  });
});

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FoldPanelHostService, FoldPanelRef } from 'fold-ng';
import { afterEach, vi } from 'vitest';

import type { UserProfileDraft } from '../../../../account/account.model';
import { AccountService } from '../../../../account/account.service';
import { FR } from '../../../copy/fr';
import { matchMediaAt, openedPanel, PROFILE } from '../../account.fixture';
import { ProfilePanel, type ProfilePanelData } from './profile-panel';

interface Wire {
  saves: UserProfileDraft[];
  answer: string | null;
  closes: unknown[];
}

let wire: Wire;

const HUGO: ProfilePanelData = {
  firstName: 'Hugo',
  lastName: 'Heynard',
  email: 'hheynard@gmail.com',
  phone: '06 12 44 08 71',
};

function boot(data: ProfilePanelData = HUGO): ComponentFixture<ProfilePanel> {
  wire = { saves: [], answer: null, closes: [] };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [ProfilePanel],
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
      { provide: FoldPanelRef, useValue: new FoldPanelRef(1, (r) => wire.closes.push(r)) },
    ],
  });
  const fixture = TestBed.createComponent(ProfilePanel);
  fixture.componentRef.setInput('data', data);
  fixture.detectChanges();
  return fixture;
}

describe('ProfilePanel', () => {
  let fixture: ComponentFixture<ProfilePanel>;
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

  /** Le callout d'avertissement, s'il est là : il ne se confond pas avec celui d'un refus. */
  const warning = (): Element | null => el().querySelector('fold-callout[variant="warning"]');

  beforeEach(() => {
    fixture = boot();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('préremplit les quatre champs du profil', () => {
    expect(field(FR.account.profileFirstName).value).toBe('Hugo');
    expect(field(FR.account.profileLastName).value).toBe('Heynard');
    expect(field(FR.account.profileEmail).value).toBe('hheynard@gmail.com');
    expect(field(FR.account.panelPhone).value).toBe('06 12 44 08 71');
    expect(el().querySelector('fold-panel-header')?.textContent).toContain(
      FR.account.sections.profile,
    );
  });

  it('n’arme Enregistrer que lorsque quelque chose a changé', () => {
    expect(button(FR.account.save).disabled).toBe(true);

    type(FR.account.panelPhone, '');
    expect(button(FR.account.save).disabled).toBe(false);

    type(FR.account.panelPhone, ' 06 12 44 08 71 ');
    expect(button(FR.account.save).disabled).toBe(true);
  });

  /** Le domaine exige prénom, nom et adresse : un envoi qui reviendrait en 400 ne part pas. */
  it.each([[FR.account.profileFirstName], [FR.account.profileLastName], [FR.account.profileEmail]])(
    'désarme Enregistrer quand « %s » est vidé',
    (label) => {
      type(FR.account.panelPhone, '');
      type(label, '   ');

      expect(button(FR.account.save).disabled).toBe(true);
    },
  );

  it('ne prévient de rien tant que l’adresse ne change pas, casse et blancs compris', () => {
    type(FR.account.profileFirstName, 'Hugues');
    expect(warning()).toBeNull();

    type(FR.account.profileEmail, ' HHeynard@gmail.com ');
    expect(warning()).toBeNull();
  });

  it('dit ce qu’un changement d’adresse emporte, avant d’enregistrer', () => {
    type(FR.account.profileEmail, 'hugo@lafoliedouce.fr');

    expect(warning()?.textContent).toContain(FR.account.profileEmailChange);
    expect(wire.saves).toEqual([]);
  });

  it('envoie les quatre champs nettoyés, puis se ferme avec `true`', async () => {
    type(FR.account.profileFirstName, ' Hugo ');
    type(FR.account.profileEmail, ' hugo@lafoliedouce.fr ');
    type(FR.account.panelPhone, '');
    await save();

    expect(wire.saves).toEqual([
      { firstName: 'Hugo', lastName: 'Heynard', email: 'hugo@lafoliedouce.fr', phone: '' },
    ]);
    expect(wire.closes).toEqual([true]);
  });

  it('sur un refus, reste ouvert, se réarme et montre le message du serveur', async () => {
    wire.answer = 'Cette adresse e-mail est déjà utilisée par un compte.';
    type(FR.account.profileEmail, 'deja@pris.fr');
    await save();

    expect(wire.closes).toEqual([]);
    expect(button(FR.account.save).disabled).toBe(false);
    const callout = el().querySelector('fold-callout[variant="alert"]');
    expect(callout?.textContent).toContain(FR.account.profileSaveFailed);
    expect(callout?.textContent).toContain('Cette adresse e-mail est déjà utilisée par un compte.');
  });

  it('Annuler ferme sans rien écrire', () => {
    type(FR.account.profileLastName, 'Brouillon');
    button(FR.account.cancel).click();

    expect(wire.saves).toEqual([]);
    expect(wire.closes).toEqual([undefined]);
  });

  it('open() part des valeurs du profil, sans ses identifiants', () => {
    vi.stubGlobal('matchMedia', matchMediaAt(true));
    const panels = TestBed.inject(FoldPanelHostService);

    ProfilePanel.open(panels, PROFILE);

    expect(openedPanel()?.component).toBe(ProfilePanel);
    expect(openedPanel()?.side).toBe('bottom');
    expect(openedPanel()?.data).toEqual({
      firstName: PROFILE.firstName,
      lastName: PROFILE.lastName,
      email: PROFILE.email,
      phone: PROFILE.phone,
    });
    panels.dismissAll();
  });
});

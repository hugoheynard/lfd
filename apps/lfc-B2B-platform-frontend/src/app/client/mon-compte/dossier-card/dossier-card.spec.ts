import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AccountService } from '../../../account/account.service';
import type {
  DeclarationOutcome,
  EstablishmentDraft,
  EstablishmentRefusal,
} from '../../../account/establishment';
import { PRO_ACCOUNT_FR } from '../../copy/screens/pro-account.copy';
import { ProOnboarding } from '../../pro-onboarding.service';
import { DossierCard } from './dossier-card';

/** Le profil d'un inscrit de `/bienvenue` : prénom et téléphone, pas de nom. */
const PROFILE = {
  firstName: 'Pierre',
  lastName: '',
  email: 'pierre@brasserie-marchand.fr',
  phone: '06 12 44 09 87',
};

const RETURNED: EstablishmentDraft = {
  firstName: 'Jeanne',
  lastName: '',
  phone: '04 79 00 00 00',
  enseigne: 'Chez Jeanne',
};

describe('DossierCard', () => {
  let fixture: ComponentFixture<DossierCard>;
  let sent: EstablishmentDraft[];
  let answer: DeclarationOutcome;
  let cleared: number;

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const inputs = (): HTMLInputElement[] => Array.from(el().querySelectorAll('input'));
  const values = (): string[] => inputs().map((input) => input.value);
  /** Le `fold-input` n°`index`, pour lire ce qui s'affiche SOUS lui. */
  const field = (index: number): Element => {
    const found = el().querySelectorAll('fold-input')[index];
    if (!found) {
      throw new Error(`Pas de champ n°${index}.`);
    }
    return found;
  };

  async function settle(): Promise<void> {
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function boot(options: {
    profile?: typeof PROFILE | null;
    returned?: EstablishmentDraft | null;
    lastError?: EstablishmentRefusal | null;
  }): void {
    sent = [];
    cleared = 0;
    answer = { kind: 'declared' };
    const account = {
      profile: signal(options.profile ?? null),
      declareEstablishment: (draft: EstablishmentDraft): Promise<DeclarationOutcome> => {
        sent.push(draft);
        return Promise.resolve(answer);
      },
    };
    const lastError = signal(options.lastError ?? null);
    const onboarding = {
      returnedDraft: signal(options.returned ?? null),
      lastError,
      clearFailure: (): void => {
        cleared += 1;
        lastError.set(null);
      },
    };
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [DossierCard],
      providers: [
        { provide: AccountService, useValue: account },
        { provide: ProOnboarding, useValue: onboarding },
      ],
    });
    fixture = TestBed.createComponent(DossierCard);
    fixture.detectChanges();
  }

  const submit = async (): Promise<void> => {
    el().querySelector('form')?.dispatchEvent(new Event('submit'));
    await settle();
  };

  const type = (index: number, value: string): void => {
    const input = inputs()[index];
    if (!input) {
      throw new Error(`Pas de champ n°${index}.`);
    }
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };

  it('se préremplit depuis le profil — l’enseigne reste à saisir', async () => {
    boot({ profile: PROFILE });
    await settle();

    expect(values()).toEqual(['Pierre', '', '06 12 44 09 87', '']);
    expect(el().textContent).toContain(PRO_ACCOUNT_FR.dossier.title);
  });

  it('préfère la déclaration rapportée d’Auth0 au profil', async () => {
    boot({ profile: PROFILE, returned: RETURNED });
    await settle();

    expect(values()).toEqual(['Jeanne', '', '04 79 00 00 00', 'Chez Jeanne']);
  });

  it('envoie les quatre champs, sans e-mail', async () => {
    boot({ profile: PROFILE });
    await settle();
    type(1, 'Marchand');
    type(3, 'Brasserie Marchand');

    await submit();

    expect(sent).toEqual([
      {
        firstName: 'Pierre',
        lastName: 'Marchand',
        phone: '06 12 44 09 87',
        enseigne: 'Brasserie Marchand',
      },
    ]);
    expect(cleared).toBe(1);
  });

  it('affiche le refus SOUS le champ concerné, et nulle part ailleurs', async () => {
    boot({ profile: PROFILE });
    await settle();
    answer = { kind: 'refused', field: 'lastName', message: 'Nom : obligatoire' };

    await submit();

    expect(field(1).textContent).toContain('Nom : obligatoire');
    expect(field(0).textContent).not.toContain('Nom : obligatoire');
    expect(el().querySelector('fold-callout')).toBeNull();
  });

  it('efface l’erreur d’un champ dès qu’il change', async () => {
    boot({ profile: PROFILE });
    await settle();
    answer = { kind: 'refused', field: 'lastName', message: 'Nom : obligatoire' };
    await submit();

    type(1, 'Marchand');

    expect(field(1).textContent).not.toContain('Nom : obligatoire');
  });

  it('dit en tête un refus qui ne désigne aucun champ', async () => {
    boot({ profile: PROFILE });
    await settle();
    answer = { kind: 'refused', field: null, message: 'Serveur injoignable.' };

    await submit();

    expect(el().querySelector('fold-callout')?.textContent).toContain('Serveur injoignable.');
  });

  it('montre sous son champ le refus rapporté du retour d’Auth0', async () => {
    boot({
      returned: RETURNED,
      lastError: { kind: 'refused', field: 'lastName', message: 'Nom : obligatoire' },
    });
    await settle();

    expect(field(1).textContent).toContain('Nom : obligatoire');
  });
});

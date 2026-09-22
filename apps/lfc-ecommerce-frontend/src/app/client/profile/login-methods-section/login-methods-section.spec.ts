import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { LoginMethodsView } from '@lfd/contracts';
import { signal, type Type } from '@angular/core';
import { FoldPanelHostService } from 'fold-ng';
import { afterEach, vi } from 'vitest';

import { GOOGLE_CONNECTION } from '../../../auth/auth.config';
import type { UserProfileDraft } from '../../../account/account.model';
import { AccountService } from '../../../account/account.service';
import type { LoginMethodsOutcome, PasswordLinkOutcome } from '../../../account/login-methods';
import { LoginMethodsService } from '../../../account/login-methods.service';
import { FR } from '../../copy/fr';
import { EmailDialog } from '../email-dialog/email-dialog';
import { LoginMethodsSection } from './login-methods-section';

const EMAIL_ONLY: LoginMethodsView = [
  { provider: 'auth0', connection: 'lfc-b2b-customers', isPrimary: true },
];

const EMAIL_AND_GOOGLE: LoginMethodsView = [
  ...EMAIL_ONLY,
  { provider: GOOGLE_CONNECTION, connection: GOOGLE_CONNECTION, isPrimary: false },
];

interface Wire {
  /** Ce que rendra le prochain appel, dans l'ordre des appels. */
  answers: LoginMethodsOutcome[];
  added: string[];
  revoked: string[];
  /** Le verdict du lien de mot de passe, et le nombre de demandes. */
  passwordLink: PasswordLinkOutcome;
  passwordCalls: number;
  /** Les dialogues ouverts — le type, la charge et le côté d'ouverture. */
  opened: { component: Type<unknown>; data: unknown; side: unknown }[];
}

const HUGO: UserProfileDraft = {
  firstName: 'Hugo',
  lastName: 'Heynard',
  email: 'hheynard@gmail.com',
  phone: '06 12 44 08 71',
};

let wire: Wire;

/** Le prochain verdict de la file ; le dernier se répète, pour ne pas la compter. */
function next(): Promise<LoginMethodsOutcome> {
  const answer = wire.answers.length > 1 ? wire.answers.shift() : wire.answers[0];
  return Promise.resolve(answer ?? { kind: 'loaded', methods: [] });
}

async function boot(
  ...answers: LoginMethodsOutcome[]
): Promise<ComponentFixture<LoginMethodsSection>> {
  return bootWith(HUGO, ...answers);
}

/** Le même montage, mais en choisissant ce que `/me` a rendu (ou n'a pas rendu). */
async function bootWith(
  profile: UserProfileDraft | null,
  ...answers: LoginMethodsOutcome[]
): Promise<ComponentFixture<LoginMethodsSection>> {
  wire = {
    answers: [...answers],
    added: [],
    revoked: [],
    passwordLink: { kind: 'sent' },
    passwordCalls: 0,
    opened: [],
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [LoginMethodsSection],
    providers: [
      {
        provide: LoginMethodsService,
        useValue: {
          list: (): Promise<LoginMethodsOutcome> => next(),
          add: (connection: string): Promise<LoginMethodsOutcome> => {
            wire.added.push(connection);
            return next();
          },
          revoke: (provider: string): Promise<LoginMethodsOutcome> => {
            wire.revoked.push(provider);
            return next();
          },
          sendPasswordLink: (): Promise<PasswordLinkOutcome> => {
            wire.passwordCalls += 1;
            return Promise.resolve(wire.passwordLink);
          },
        },
      },
      // Le profil relu : sans lui, la ligne « E-mail » n'a pas d'adresse à montrer.
      { provide: AccountService, useValue: { profile: signal(profile) } },
      {
        provide: FoldPanelHostService,
        useValue: {
          open: (
            component: Type<unknown>,
            config: { data: unknown; side: unknown },
          ): { close: () => void } => {
            wire.opened.push({ component, data: config.data, side: config.side });
            return { close: (): void => undefined };
          },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(LoginMethodsSection);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('LoginMethodsSection', () => {
  let fixture: ComponentFixture<LoginMethodsSection>;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;

  const buttons = (): readonly HTMLButtonElement[] =>
    Array.from(el().querySelectorAll<HTMLButtonElement>('button'));

  const button = (text: string): HTMLButtonElement => {
    const found = buttons().find((b) => (b.textContent ?? '').trim() === text);
    if (!found) {
      throw new Error(`Pas de bouton « ${text} ».`);
    }
    return found;
  };

  const addGoogle = (): HTMLButtonElement =>
    button(FR.account.loginMethodAdd.replace('{provider}', FR.account.loginMethodGoogle));

  const click = async (target: HTMLButtonElement): Promise<void> => {
    target.click();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const callout = (): Element | null => el().querySelector('fold-callout[variant="alert"]');

  it('liste les méthodes, et n’offre aucun retrait sur la principale', async () => {
    fixture = await boot({ kind: 'loaded', methods: EMAIL_AND_GOOGLE });

    const cards = el().querySelectorAll('fold-card');
    expect(cards.length).toBe(2);
    expect(cards[0]?.textContent).toContain(FR.account.loginMethodEmail);
    expect(cards[0]?.textContent).toContain(FR.account.loginMethodPrimary);
    // La principale ne se délie jamais : rien à retirer, donc rien à cliquer.
    expect(cards[0]?.querySelector('fold-inline-confirm')).toBeNull();
    expect(cards[1]?.querySelector('fold-inline-confirm')).not.toBeNull();
  });

  /**
   * L'adresse de connexion est sur SA méthode, et nulle part ailleurs sur la
   * page (Hugo, 2026-09-22) : deux endroits pour la changer seraient deux
   * vérités à tenir d'accord.
   */
  it('porte l’adresse de connexion sur la ligne « E-mail »', async () => {
    fixture = await boot({ kind: 'loaded', methods: EMAIL_AND_GOOGLE });

    const cards = el().querySelectorAll('fold-card');
    expect(cards[0]?.textContent).toContain('hheynard@gmail.com');
    // La ligne Google n'a ni adresse ni geste d'adresse.
    expect(cards[1]?.textContent).not.toContain(FR.account.loginMethodEmailChange);
  });

  /** Tant que `/me` n'a rien dit, il n'y a ni adresse à montrer ni quoi la changer. */
  it('ne montre pas d’adresse tant que le profil n’est pas lu', async () => {
    fixture = await bootWith(null, { kind: 'loaded', methods: EMAIL_ONLY });

    expect(buttons().some((b) => b.textContent?.trim() === FR.account.loginMethodEmailChange)).toBe(
      false,
    );
    // Le mot de passe, lui, ne dépend d'aucune adresse affichée.
    expect(
      buttons().some((b) => b.textContent?.trim() === FR.account.loginMethodPasswordChange),
    ).toBe(true);
  });

  it('ouvre le dialogue de changement d’adresse sur le profil relu', async () => {
    // Le côté se lit AU CLIC : sans `matchMedia`, l'environnement de test n'en a pas.
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: false, media: query }));
    fixture = await boot({ kind: 'loaded', methods: EMAIL_ONLY });

    await click(button(FR.account.loginMethodEmailChange));

    expect(wire.opened.length).toBe(1);
    expect(wire.opened[0]?.component).toBe(EmailDialog);
    expect(wire.opened[0]?.data).toEqual(HUGO);
    // Au bureau, un dialogue centré (règle « Saisir » du CLAUDE.md de l'app).
    expect(wire.opened[0]?.side).toBe('center');
  });

  /** 204 : un lien est parti, et on n'en dit rien de plus. */
  it('demande le lien de mot de passe et dit qu’il est parti', async () => {
    fixture = await boot({ kind: 'loaded', methods: EMAIL_ONLY });

    await click(button(FR.account.loginMethodPasswordChange));

    expect(wire.passwordCalls).toBe(1);
    expect(el().textContent).toContain(FR.account.loginMethodPasswordSent);
  });

  /** Un 409 (adresse non prouvée, compte sans mot de passe) ou un 429 de débit. */
  it('sur un refus du lien, montre le message du serveur sans rien fermer', async () => {
    fixture = await boot({ kind: 'loaded', methods: EMAIL_ONLY });
    wire.passwordLink = {
      kind: 'failed',
      message: 'Votre adresse n’a jamais été vérifiée.',
    };

    await click(button(FR.account.loginMethodPasswordChange));

    expect(el().textContent).toContain('Votre adresse n’a jamais été vérifiée.');
    expect(el().textContent).not.toContain(FR.account.loginMethodPasswordSent);
    expect(el().querySelectorAll('fold-card').length).toBe(1);
  });

  /** Le serveur n'a rendu aucun message : l'écran met le sien. */
  it('met sa phrase quand le refus du lien est muet', async () => {
    fixture = await boot({ kind: 'loaded', methods: EMAIL_ONLY });
    wire.passwordLink = { kind: 'failed', message: null };

    await click(button(FR.account.loginMethodPasswordChange));

    expect(el().textContent).toContain(FR.account.loginMethodPasswordFailed);
  });

  it('grise l’ajout d’un fournisseur déjà rattaché', async () => {
    fixture = await boot({ kind: 'loaded', methods: EMAIL_AND_GOOGLE });

    expect(addGoogle().disabled).toBe(true);
  });

  it('dit ce que le rattachement change, sous les boutons', async () => {
    fixture = await boot({ kind: 'loaded', methods: EMAIL_ONLY });

    expect(el().textContent).toContain(FR.account.loginMethodsPromise);
  });

  it('ajoute Google et montre la liste relue', async () => {
    fixture = await boot(
      { kind: 'loaded', methods: EMAIL_ONLY },
      { kind: 'loaded', methods: EMAIL_AND_GOOGLE },
    );

    await click(addGoogle());

    expect(wire.added).toEqual([GOOGLE_CONNECTION]);
    expect(el().querySelectorAll('fold-card').length).toBe(2);
    expect(callout()).toBeNull();
  });

  /** Fermer la fenêtre d'autorisation n'est pas un refus : rien à dire. */
  it('ne montre rien quand la personne referme la fenêtre', async () => {
    fixture = await boot({ kind: 'loaded', methods: EMAIL_ONLY }, { kind: 'cancelled' });

    await click(addGoogle());

    expect(callout()).toBeNull();
    expect(addGoogle().disabled).toBe(false);
  });

  it('sur une preuve périmée, montre le message du serveur ET « Recommencer »', async () => {
    fixture = await boot(
      { kind: 'loaded', methods: EMAIL_ONLY },
      { kind: 'failed', refusal: { again: true, message: 'La vérification a expiré.' } },
      { kind: 'loaded', methods: EMAIL_AND_GOOGLE },
    );

    await click(addGoogle());
    expect(callout()?.textContent).toContain('La vérification a expiré.');

    await click(button(FR.account.loginMethodRetry));

    // Le même geste, refait — et la seconde tentative passe.
    expect(wire.added).toEqual([GOOGLE_CONNECTION, GOOGLE_CONNECTION]);
    expect(callout()).toBeNull();
  });

  it('sur un conflit, montre le message du serveur SANS « Recommencer »', async () => {
    fixture = await boot(
      { kind: 'loaded', methods: EMAIL_ONLY },
      {
        kind: 'failed',
        refusal: { again: false, message: 'Ce compte ouvre déjà un autre compte chez nous.' },
      },
    );

    await click(addGoogle());

    expect(callout()?.textContent).toContain('Ce compte ouvre déjà un autre compte chez nous.');
    expect(buttons().some((b) => b.textContent?.trim() === FR.account.loginMethodRetry)).toBe(
      false,
    );
  });

  /** Aucun serveur n'a parlé : l'écran met sa propre phrase plutôt qu'un vide. */
  it('met sa phrase quand l’autorisation n’a rendu aucun message', async () => {
    fixture = await boot(
      { kind: 'loaded', methods: EMAIL_ONLY },
      { kind: 'failed', refusal: { again: true, message: null } },
    );

    await click(addGoogle());

    expect(callout()?.textContent).toContain(FR.account.loginMethodAuthFailed);
  });

  it('retire une méthode secondaire, une fois confirmé', async () => {
    fixture = await boot(
      { kind: 'loaded', methods: EMAIL_AND_GOOGLE },
      { kind: 'loaded', methods: EMAIL_ONLY },
    );

    await click(button(FR.account.loginMethodRemove));
    await click(button(FR.account.loginMethodRemoveConfirm));

    expect(wire.revoked).toEqual([GOOGLE_CONNECTION]);
    expect(el().querySelectorAll('fold-card').length).toBe(1);
  });

  it('sur un échec de lecture, montre l’état d’erreur et relit au clic', async () => {
    fixture = await boot(
      { kind: 'failed', refusal: { again: false, message: 'Serveur injoignable.' } },
      { kind: 'loaded', methods: EMAIL_ONLY },
    );

    const empty = el().querySelector('fold-empty-state[tone="alert"]');
    expect(empty?.textContent).toContain(FR.account.loginMethodsFailed);

    await click(button(FR.account.loginMethodsRetry));

    expect(el().querySelectorAll('fold-card').length).toBe(1);
  });
});

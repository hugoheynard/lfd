import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { LoginMethodsView } from '@lfd/contracts';
import {
  FOLD_INLINE_CONFIRM_DEFAULT_LABELS,
  FOLD_INLINE_CONFIRM_LABELS,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldEmptyStateComponent,
  type FoldIconName,
  FoldIconComponent,
  type FoldInlineConfirmLabels,
  FoldInlineConfirmComponent,
  FoldLoadingStateComponent,
  FoldPanelHostService,
} from 'fold-ng';

import { GOOGLE_CONNECTION } from '../../../auth/auth.config';
import type { UserProfileDraft } from '../../../account/account.model';
import { AccountService } from '../../../account/account.service';
import {
  ADDABLE_PROVIDERS,
  DATABASE_PROVIDER,
  loginMethodLabel,
  type LoginMethodRefusal,
  type LoginMethodsOutcome,
} from '../../../account/login-methods';
import { LoginMethodsService } from '../../../account/login-methods.service';
import { ClientCopyService, fill } from '../../copy/client-copy.service';
import { EmailDialog } from '../email-dialog/email-dialog';

/** Où en est la lecture de la liste — « vide » n'est pas « pas encore su ». */
type LoadStatus = 'loading' | 'ready' | 'error';

/** Un fournisseur tel que l'écran le propose : son libellé, et s'il est déjà là. */
interface ProviderOffer {
  readonly connection: string;
  readonly label: string;
  readonly linked: boolean;
}

/** Les mots du retrait — fold parle anglais par défaut. */
function removeConfirmLabels(): FoldInlineConfirmLabels {
  const account = inject(ClientCopyService).t().account;
  return {
    ...FOLD_INLINE_CONFIRM_DEFAULT_LABELS,
    confirm: account.loginMethodRemoveConfirm,
    cancel: account.cancel,
    cancelAria: account.cancel,
    busy: account.loginMethodRemoveBusy,
    group: account.loginMethodRemoveGroup,
  };
}

/**
 * **Méthodes de connexion** — la seconde section de `/mon-profil` : ce avec quoi
 * la personne entre dans son compte, et de quoi en ajouter ou en retirer.
 *
 * ## Ici, tout AGIT TOUT DE SUITE
 *
 * C'est ce qui la distingue de l'identité juste au-dessus, qui est un brouillon
 * qu'on enregistre. Les deux ont vécu en dialogues empilés faute de pouvoir le
 * dire dans une même coquille — un « Annuler » commun aurait laissé croire
 * qu'il défait un rattachement. Sur une page, chaque section porte son
 * comportement sans mentir (plan `plan-page-mon-profil.md` §0) ; la logique
 * ci-dessous est celle du lot C, mot pour mot, moins l'en-tête et le pied de
 * dialogue (§2).
 *
 * ## La principale n'a pas de geste de retrait
 *
 * Ce n'est pas un refus, c'est qu'il n'y a **rien** à retirer : la Management
 * API ne délie que des identités secondaires (plan
 * `documentation/auth-inscription/plan-rattachement-depuis-le-profil.md`, §9.6).
 * Un bouton qui lèverait toujours ferait croire à une protection.
 *
 * ## L'adresse de connexion vit ICI (Hugo, 2026-09-22)
 *
 * La ligne « E-mail » — l'identité de base de données d'Auth0 — porte
 * l'adresse, le geste qui la change ({@link EmailDialog}) et celui qui envoie
 * un lien de mot de passe. L'adresse a quitté la section « Identité » : elle
 * n'est pas une coordonnée, c'est la clé d'accès, et elle n'apparaît qu'à UN
 * seul endroit de la page — deux endroits pour changer la même chose, ce sont
 * deux vérités à tenir d'accord.
 *
 * Le lien de mot de passe, lui, ne promet **rien** sur le mot de passe actuel
 * ni sur les sessions ouvertes : le comportement d'Auth0 n'est vérifié nulle
 * part (Hugo, 2026-09-22). L'écran dit qu'un lien est parti, et s'arrête là.
 *
 * ## Deux sortes de refus, deux gestes
 *
 * Une preuve périmée ou invalide (400) se **refait** — le callout porte alors
 * « Recommencer ». Un compte qui ouvre déjà un autre compte chez nous (409) ne
 * se refait pas : le message du serveur dit la sortie, et il s'affiche tel quel
 * plutôt que réécrit ici (plan §10.2).
 */
@Component({
  selector: 'app-login-methods-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldEmptyStateComponent,
    FoldIconComponent,
    FoldInlineConfirmComponent,
    FoldLoadingStateComponent,
  ],
  providers: [{ provide: FOLD_INLINE_CONFIRM_LABELS, useFactory: removeConfirmLabels }],
  templateUrl: './login-methods-section.html',
  styleUrl: './login-methods-section.scss',
})
export class LoginMethodsSection {
  /** La ligne qui porte l'adresse de connexion, et elle seule. */
  protected readonly emailProvider = DATABASE_PROVIDER;

  protected readonly t = inject(ClientCopyService).t;
  private readonly service = inject(LoginMethodsService);
  private readonly account = inject(AccountService);
  private readonly panels = inject(FoldPanelHostService);

  /**
   * Le profil relu — `null` tant que `/me` n'a rien dit. Sans lui, pas
   * d'adresse à montrer NI de quoi la changer : `PATCH /me/profile` remplace
   * les quatre champs, et partir sans le nom l'effacerait.
   */
  protected readonly profile = computed<UserProfileDraft | null>(() => {
    const profile = this.account.profile();
    return profile === null
      ? null
      : {
          firstName: profile.firstName,
          lastName: profile.lastName,
          email: profile.email,
          phone: profile.phone,
        };
  });

  /** Le lien de mot de passe est en vol — le bouton reste verrouillé jusqu'au bout. */
  protected readonly sendingPassword = signal(false);
  /** Ce qu'on dit après l'envoi : le lien est parti, ou le refus du serveur. */
  protected readonly passwordSent = signal(false);
  protected readonly passwordRefusal = signal<string | null>(null);

  protected readonly status = signal<LoadStatus>('loading');
  protected readonly methods = signal<LoginMethodsView>([]);
  protected readonly refusal = signal<LoginMethodRefusal | null>(null);

  /**
   * Ce qui est en vol — une connexion qu'on ajoute, ou un fournisseur qu'on
   * retire. Un seul geste à la fois : la clé de transaction du SDK est partagée
   * (plan R5), et deux autorisations concurrentes se marcheraient dessus.
   */
  protected readonly busy = signal<string | null>(null);

  /** La dernière connexion tentée — ce que « Recommencer » refait. */
  private readonly lastTried = signal<string | null>(null);

  /**
   * Les fournisseurs proposés, **en liste** même à un seul : Facebook suit, et
   * une section écrite au singulier se réécrirait entièrement (plan, en-tête).
   */
  protected readonly offers = computed<readonly ProviderOffer[]>(() => {
    const copy = this.t().account;
    const linked = new Set(this.methods().map((method) => method.provider));
    return ADDABLE_PROVIDERS.map((provider) => ({
      connection: provider.connection,
      label: fill(copy.loginMethodAdd, { provider: provider.label(copy) }),
      linked: linked.has(provider.connection),
    }));
  });

  constructor() {
    void this.load();
  }

  /** Le nom lisible d'une méthode, dans la langue de l'écran. */
  protected labelOf(provider: string): string {
    return loginMethodLabel(provider, this.t().account);
  }

  /** Le glyphe d'une méthode : l'adresse d'un côté, un compte tiers de l'autre. */
  protected iconOf(provider: string): FoldIconName {
    return provider === GOOGLE_CONNECTION ? 'globe' : 'mail';
  }

  /** Ouvre le dialogue de changement d'adresse sur le profil relu. */
  protected changeEmail(profile: UserProfileDraft): void {
    EmailDialog.open(this.panels, profile);
  }

  /**
   * `POST /me/password-link` — le serveur envoie le lien, l'écran ne dit que
   * ça. Un refus (adresse non prouvée, compte sans mot de passe, débit
   * dépassé) reste sous les yeux, avec le message du serveur.
   */
  protected async sendPasswordLink(): Promise<void> {
    if (this.sendingPassword()) {
      return;
    }
    this.sendingPassword.set(true);
    this.passwordSent.set(false);
    this.passwordRefusal.set(null);
    const outcome = await this.service.sendPasswordLink();
    this.sendingPassword.set(false);
    if (outcome.kind === 'sent') {
      this.passwordSent.set(true);
    } else {
      this.passwordRefusal.set(outcome.message ?? this.t().account.loginMethodPasswordFailed);
    }
  }

  protected async load(): Promise<void> {
    this.status.set('loading');
    const outcome = await this.service.list();
    if (outcome.kind === 'loaded') {
      this.methods.set(outcome.methods);
      this.status.set('ready');
    } else {
      this.status.set('error');
    }
  }

  protected async add(connection: string): Promise<void> {
    if (this.busy() !== null) {
      return;
    }
    this.busy.set(connection);
    this.lastTried.set(connection);
    this.refusal.set(null);
    this.settle(await this.service.add(connection));
  }

  /** Refaire le geste — la sortie d'une preuve périmée, et d'elle seule. */
  protected async retry(): Promise<void> {
    const connection = this.lastTried();
    if (connection !== null) {
      await this.add(connection);
    }
  }

  protected async revoke(provider: string): Promise<void> {
    if (this.busy() !== null) {
      return;
    }
    this.busy.set(provider);
    this.refusal.set(null);
    this.settle(await this.service.revoke(provider));
  }

  /**
   * Installe ce qu'un geste a produit. Un renoncement ne dit rien : la personne
   * a fermé la fenêtre d'autorisation, il n'y a pas de refus à lui montrer.
   */
  private settle(outcome: LoginMethodsOutcome): void {
    this.busy.set(null);
    if (outcome.kind === 'loaded') {
      this.methods.set(outcome.methods);
      this.status.set('ready');
    } else if (outcome.kind === 'failed') {
      this.refusal.set(outcome.refusal);
    }
  }
}

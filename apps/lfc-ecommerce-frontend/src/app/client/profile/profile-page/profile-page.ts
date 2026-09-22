import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import type { UserProfileDraft } from '../../../account/account.model';
import {
  FoldButtonComponent,
  FoldEmptyStateComponent,
  FoldLoadingStateComponent,
  FoldPageSectionComponent,
} from 'fold-ng';

import { AccountService } from '../../../account/account.service';
import { ClientChrome } from '../../client-chrome.service';
import { ClientBannerOutlet } from '../../nav/client-banner';
import { ClientBannerBlock } from '../../nav/client-banner-block/client-banner-block';
import { ClientCopyService } from '../../copy/client-copy.service';
import { IdentitySection } from '../identity-section/identity-section';
import { LoginMethodsSection } from '../login-methods-section/login-methods-section';
import { ProAccountSection } from '../pro-account-section/pro-account-section';

/** Où en est la page — « pas encore su » n'est ni « vide » ni « en panne ». */
type ProfileView = 'loading' | 'failed' | 'ready';

/**
 * **`/mon-profil`** — la page de la PERSONNE.
 *
 * ## Pourquoi une page, et pas un dialogue mieux mis en page
 *
 * Ce qui vit ici n'est pas un geste rapide, c'est un **sujet** : qui je suis, et
 * comment j'entre. L'emplacement d'un écran affirme le modèle, et le modèle
 * précédent était faux — `/mon-compte` est le dossier de la **société**, et la
 * personne n'avait aucun écran à elle (plan `plan-page-mon-profil.md` §0).
 *
 * La page règle aussi un bricolage : un brouillon qu'on **enregistre**
 * (l'identité) et des gestes qui **agissent tout de suite** (les méthodes de
 * connexion) ne tiennent pas sous un même pied de dialogue, où « Annuler »
 * laisserait croire qu'il défait un rattachement. D'où le dialogue empilé du
 * lot C, qui contournait le problème ; ici chaque section porte son
 * comportement, et les deux dialogues ont disparu.
 *
 * ## Aucune garde de société
 *
 * `authenticatedGuard` et rien d'autre : ce sujet existe pour tout le monde,
 * avec ou sans entreprise (§1). Un `companyWorkspaceGuard` reproduirait
 * exactement le défaut qu'on corrige.
 *
 * ## Deux sections, et la place pour celles qui suivent
 *
 * Le mot de passe (§3) viendra s'ajouter comme `fold-page-section` sœur. La
 * proposition d'ouvrir un compte professionnel (§4), elle, est posée en bas
 * SANS section : c'est une proposition, pas un troisième sujet de la page — et
 * elle ne s'adresse qu'à qui n'a aucune société (Hugo, 2026-09-22).
 */
@Component({
  selector: 'app-profile-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldEmptyStateComponent,
    FoldLoadingStateComponent,
    FoldPageSectionComponent,
    ClientBannerBlock,
    ClientBannerOutlet,
    IdentitySection,
    LoginMethodsSection,
    ProAccountSection,
  ],
  templateUrl: './profile-page.html',
  styleUrl: './profile-page.scss',
})
export class ProfilePage {
  protected readonly t = inject(ClientCopyService).t;
  private readonly account = inject(AccountService);
  private readonly chrome = inject(ClientChrome);

  protected readonly view = computed<ProfileView>(() => {
    const status = this.account.status();
    if (status === 'error') {
      return 'failed';
    }
    return status === 'ready' ? 'ready' : 'loading';
  });

  /**
   * Le profil sous la forme que la section d'identité compare — `null` tant que
   * `/me` n'a rien dit. Une section d'édition montée sur des champs vides
   * ferait croire à un compte sans nom.
   */
  protected readonly identity = computed<UserProfileDraft | null>(() => {
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

  constructor() {
    effect(() => this.chrome.kicker.set(this.t().chrome.myProfile));
    this.chrome.back.set(null);
    this.chrome.menu.set(true);
    this.chrome.bell.set(null);
    this.chrome.barOnDesktop.set(true);
  }

  protected retry(): void {
    this.account.load();
  }
}

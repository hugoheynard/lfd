import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import type { ShopLevel } from '@lfd/contracts';
import { FoldButtonComponent, FoldCardComponent, FoldInputComponent } from 'fold-ng';

import { AuthFacade } from '../../auth/auth.facade';
import { ClientChrome } from '../../client/client-chrome.service';
import { ClientLocale } from '../../client/client-locale.service';
import { proAccountCopy } from '../../client/copy/screens/pro-account.copy';
import { ClientFeatureAccess } from '../../client/feature-access/client-feature-access.service';
import { ClientPage } from '../../client/shell-bienvenue/client-page';
import { ShopPromise } from '../../client/shop-promise/shop-promise';

/**
 * Là où mène la porte pro, toujours : le dossier attend la vérification, et la
 * carte « Compléter mon dossier » y rattrape un retour d'Auth0 manqué (plan §4).
 */
const AFTER_ENTRY = '/mon-compte';

/**
 * `/ouverture-compte-pro` — la porte que donne la commerciale (plan
 * `plan-inscription-pro-seule.md` §3.1).
 *
 * Le chrome est celui de `/bienvenue` — colonne bleue, pas de menu, pas de
 * cloche — mais ni son contenu, ni sa copie : un pro qui arrive par ce lien n'a
 * ni devis traiteur à demander, ni rappel à réserver. Cinq champs, et le mot de
 * passe se pose chez Auth0.
 *
 * L'écran ne DÉCLARE rien : il confie la saisie à l'`appState` et part chez
 * Auth0. C'est `ProOnboarding` qui dépose la déclaration au retour, où qu'il se
 * pose.
 */
@Component({
  selector: 'app-ouverture-compte-pro-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ClientPage, FoldButtonComponent, FoldCardComponent, FoldInputComponent, ShopPromise],
  templateUrl: './ouverture-compte-pro-page.html',
  styleUrl: './ouverture-compte-pro-page.scss',
})
export class OuvertureCompteProPage {
  private readonly access = inject(ClientFeatureAccess);

  /**
   * Le niveau de la boutique, pour la promesse « ouvre bientôt » (plan §3.1).
   * `null` tant que la lecture est en vol : l'écran ne promet rien et ne
   * clignote pas quand la boutique est ouverte. Un échec vaut `closed`.
   */
  protected readonly shopLevel = computed<ShopLevel | null>(() =>
    this.access.state() === 'loading' ? null : this.access.shop(),
  );

  private readonly chrome = inject(ClientChrome);
  private readonly auth = inject(AuthFacade);
  private readonly router = inject(Router);
  private readonly locale = inject(ClientLocale);

  protected readonly copy = computed(() => proAccountCopy(this.locale.current()));

  protected readonly firstName = signal('');
  protected readonly lastName = signal('');
  protected readonly email = signal('');
  protected readonly phone = signal('');
  protected readonly enseigne = signal('');

  /** Les cinq champs sont remplis. Le reste, c'est le serveur qui le juge. */
  protected readonly complete = computed(() =>
    [this.firstName(), this.lastName(), this.email(), this.phone(), this.enseigne()].every(
      (value) => value.trim() !== '',
    ),
  );

  constructor() {
    effect(() => this.chrome.kicker.set(this.copy().door.kicker));
    // Qui est déjà entré n'a rien à ouvrir : son dossier l'attend.
    effect(() => {
      if (this.auth.isAuthenticated()) {
        void this.router.navigateByUrl(AFTER_ENTRY);
      }
    });
    this.chrome.back.set(null);
    // Un visiteur n'a ni menu ni cloche. La barre, elle, est l'affaire du
    // châssis (`ClientPage`), qui l'éteint au-delà du pli et la rallume.
    this.chrome.menu.set(false);
    this.chrome.bell.set(null);
  }

  protected submit(): void {
    if (!this.complete()) {
      return;
    }
    this.auth.registerPro(AFTER_ENTRY, {
      firstName: this.firstName().trim(),
      lastName: this.lastName().trim(),
      email: this.email().trim(),
      phone: this.phone().trim(),
      enseigne: this.enseigne().trim(),
    });
  }

  /** Déjà client : l'e-mail tapé, s'il y en a un, préremplit l'écran d'Auth0. */
  protected signIn(): void {
    this.auth.login(AFTER_ENTRY, this.email().trim());
  }
}

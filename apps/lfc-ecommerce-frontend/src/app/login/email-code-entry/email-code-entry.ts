import {
  ChangeDetectionStrategy,
  Component,
  PLATFORM_ID,
  afterNextRender,
  inject,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Router } from '@angular/router';
import { FoldLoadingStateComponent } from 'fold-ng';

import { AuthFacade } from '../../auth/auth.facade';
import { WORKSPACE_HOME_ROUTE } from '../../client/client-workspace-switch.service';
import { ClientCopyService } from '../../client/copy/client-copy.service';

/**
 * **`/connexion/code`** — l'adresse du bouton de l'e-mail d'invitation
 * (2026-10-09) : elle part aussitôt chez Auth0, sur la connexion par code.
 *
 * 🔴 **Sans `login_hint`, délibérément.** Le seul moyen de souffler l'adresse
 * serait de la porter dans l'URL du lien — donc dans l'historique du
 * navigateur, les journaux du proxy et le `Referer`. Taper son adresse une
 * fois chez Auth0 coûte moins que de la semer là (consigne d'Hugo,
 * 2026-10-09 : plutôt ne pas pré-remplir que l'exposer).
 *
 * Qui est déjà entré n'a rien à faire ici : on le dépose à l'accueil de son
 * espace, sans repasser par Auth0.
 */
@Component({
  selector: 'app-email-code-entry',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldLoadingStateComponent],
  templateUrl: './email-code-entry.html',
})
export class EmailCodeEntry {
  protected readonly t = inject(ClientCopyService).t;
  private readonly auth = inject(AuthFacade);
  private readonly router = inject(Router);
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  constructor() {
    // Au navigateur seulement, une fois rendu : le pré-rendu n'a pas d'Auth0.
    afterNextRender(() => {
      if (this.browser) {
        this.leave();
      }
    });
  }

  private leave(): void {
    if (this.auth.isAuthenticated()) {
      void this.router.navigateByUrl(WORKSPACE_HOME_ROUTE);
      return;
    }
    this.auth.continueWithEmailCode(WORKSPACE_HOME_ROUTE);
  }
}

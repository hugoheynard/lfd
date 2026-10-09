import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FoldButtonComponent, FoldEmptyStateComponent } from 'fold-ng';

import { AuthFacade } from '../../auth/auth.facade';
import { SIGN_IN_CANCELLED } from '../../auth/sign-in-failure';
import { ClientCopyService } from '../../client/copy/client-copy.service';

/**
 * **`/connexion/erreur`** — là où le SDK dépose la personne quand Auth0 refuse
 * la connexion (`errorPath`, `auth.providers.ts`).
 *
 * Avant le 2026-10-09, ce refus retombait sur l'accueil sans un mot : la
 * connexion par code n'était pas activée sur l'application, et Hugo voyait
 * seulement « ça m'a remis sur bienvenue ». Le texte d'Auth0 est donc affiché
 * tel quel — en anglais, mais c'est le cas réel, et c'est lui qu'on nous
 * transmettra.
 *
 * Une annulation (`access_denied`) n'est pas une panne : elle se dit sans ton
 * d'alerte et sans texte technique.
 */
@Component({
  selector: 'app-sign-in-failure',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldEmptyStateComponent, FoldButtonComponent, RouterLink],
  templateUrl: './sign-in-failure.html',
})
export class SignInFailure {
  protected readonly t = inject(ClientCopyService).t;
  private readonly failure = inject(AuthFacade).signInFailure;

  protected readonly cancelled = computed(() => this.failure()?.code === SIGN_IN_CANCELLED);

  protected readonly subtitle = computed(() => {
    const copy = this.t().doors;
    if (this.cancelled()) {
      return copy.signInCancelledSub;
    }
    const failure = this.failure();
    const detail = failure === null ? null : (failure.description ?? failure.code);
    return detail === null ? copy.signInFailedSub : `${copy.signInFailedSub} (${detail})`;
  });
}

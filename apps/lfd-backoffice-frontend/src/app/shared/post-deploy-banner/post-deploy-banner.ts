import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FoldButtonComponent, FoldCalloutComponent } from 'fold-ng';

import { PermissionsStore } from '../../auth/permissions.store';
import { POST_DEPLOY_PATH } from '../../ops/post-deploy-path';
import { PostDeployStore } from '../../ops/post-deploy.store';

/**
 * **« Des opérations après déploiement sont à faire »**, en tête du
 * back-office, pour qui peut les voir (plan
 * `plan-operations-apres-deploiement.md`, § 7.11) : le bouton seul ne ferme
 * pas la fenêtre où une reprise attend.
 *
 * La lecture SIMULE côté serveur : elle se fait UNE fois, quand les droits
 * sont connus, puis la page la refait après chaque application terminée.
 * Jamais à la navigation.
 */
@Component({
  selector: 'app-post-deploy-banner',
  imports: [FoldCalloutComponent, FoldButtonComponent, RouterLink],
  templateUrl: './post-deploy-banner.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PostDeployBanner {
  private readonly store = inject(PostDeployStore);
  private readonly permissions = inject(PermissionsStore);

  protected readonly path = POST_DEPLOY_PATH;
  private readonly canRead = computed(() => this.permissions.can('ops_post_deploy:read'));
  protected readonly visible = computed(() => this.canRead() && this.store.anyToDo());

  constructor() {
    effect(() => {
      // Une seule lecture : `idle` ne revient jamais une fois lu.
      if (this.canRead() && this.store.state() === 'idle') void this.store.load();
    });
  }
}

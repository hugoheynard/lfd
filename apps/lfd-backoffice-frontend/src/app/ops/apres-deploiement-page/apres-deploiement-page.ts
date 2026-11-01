import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import {
  FoldBackLinkComponent,
  FoldButtonComponent,
  FoldEmptyStateComponent,
  FoldLoadingStateComponent,
  FoldPageLayoutComponent,
} from 'fold-ng';

import { PermissionsStore } from '../../auth/permissions.store';
import { PostDeployOperationCard } from '../post-deploy-operation-card/post-deploy-operation-card';
import { PostDeployStore } from '../post-deploy.store';

/**
 * **Après déploiement** : les reprises de données que le dernier déploiement
 * attend, simulées puis appliquées d'ici plutôt que depuis un poste
 * (`documentation/ops/plan-operations-apres-deploiement.md`).
 *
 * L'ordre est celui du serveur, qui est l'ordre d'exécution. Ouvrir la page
 * relit l'état — c'est la seule lecture qu'une navigation déclenche.
 */
@Component({
  selector: 'app-apres-deploiement-page',
  imports: [
    FoldBackLinkComponent,
    FoldButtonComponent,
    FoldEmptyStateComponent,
    FoldLoadingStateComponent,
    FoldPageLayoutComponent,
    PostDeployOperationCard,
  ],
  templateUrl: './apres-deploiement-page.html',
  styleUrl: './apres-deploiement-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ApresDeploiementPage {
  private readonly store = inject(PostDeployStore);
  private readonly permissions = inject(PermissionsStore);

  protected readonly state = this.store.state;
  protected readonly overview = this.store.overview;
  protected readonly canSimulate = computed(() => this.permissions.can('ops_post_deploy:read'));
  protected readonly canApply = computed(() => this.permissions.can('ops_post_deploy:write'));

  protected readonly titles = computed<Readonly<Record<string, string>>>(() =>
    Object.fromEntries((this.overview()?.operations ?? []).map((op) => [op.key, op.title])),
  );

  constructor() {
    void this.load();
  }

  protected load(): Promise<void> {
    return this.store.load();
  }
}

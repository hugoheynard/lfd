import { computed, inject, Injectable, signal } from '@angular/core';

import type { PostDeployOverview } from '@lfd/ops-contract';

import { PostDeployService } from './post-deploy.service';

/** `idle` : jamais lu. Le bandeau et la page lisent le même état. */
export type PostDeployLoadState = 'idle' | 'loading' | 'ready' | 'error';

/**
 * L'état partagé des opérations après déploiement : la page le montre, le
 * bandeau de la coquille n'en lit que `anyToDo`.
 *
 * La lecture SIMULE chaque opération côté serveur : elle se fait une fois au
 * chargement de l'application, à l'ouverture de la page, et après chaque
 * application terminée — jamais à la navigation.
 */
@Injectable({ providedIn: 'root' })
export class PostDeployStore {
  private readonly service = inject(PostDeployService);

  readonly state = signal<PostDeployLoadState>('idle');
  readonly overview = signal<PostDeployOverview | null>(null);
  /** Faux tant qu'on ne sait pas : un bandeau ne s'affiche pas sur une panne. */
  readonly anyToDo = computed(() => this.overview()?.anyToDo === true);

  private pending: Promise<void> | null = null;

  /** Relit l'état ; deux appels simultanés n'en font qu'un. Un échec garde l'état précédent. */
  load(): Promise<void> {
    this.pending ??= this.read().finally(() => {
      this.pending = null;
    });
    return this.pending;
  }

  private async read(): Promise<void> {
    if (this.overview() === null) this.state.set('loading');
    try {
      this.overview.set(await this.service.overview());
      this.state.set('ready');
    } catch {
      if (this.overview() === null) this.state.set('error');
    }
  }
}

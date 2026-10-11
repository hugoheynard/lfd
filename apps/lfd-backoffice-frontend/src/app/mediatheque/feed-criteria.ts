import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { skip } from 'rxjs';

import { MediaFeedStore } from './media-feed';
import {
  isFiltering,
  readCriteria,
  sameCriteria,
  shotRangeLabel,
  toQueryParams,
  withoutFilters,
  type MediaFeedCriteria,
} from './media-feed-url';

/**
 * **Ce que la grille montre, tel que l'adresse le porte** — le tri et les
 * filtres (`mediatheque.md` §5). Un lien partagé rouvre la même vue.
 *
 * 🔴 Tout part au SERVEUR : filtrer ce qui est chargé ne cherche pas, ça trie
 * un échantillon — une image non chargée était introuvable quoi qu'on tape
 * (corrigé le 2026-09-23).
 *
 * Fourni par la page : il lit SON adresse et pilote SON fil.
 */
@Injectable()
export class FeedCriteria {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly feed = inject(MediaFeedStore);

  /** L'adresse d'ouverture, puis ce que l'écran ou l'adresse y pose. */
  readonly criteria = signal<MediaFeedCriteria>(readCriteria(this.route.snapshot.queryParamMap));

  readonly filtering = computed(() => isFiltering(this.criteria()));

  /** La pastille de la période de prise de vue posée par la frise (`mediatheque.md` §9 bis). */
  readonly shotLabel = computed(() => shotRangeLabel(this.criteria()));

  /**
   * Ce que l'adresse demande APRÈS l'ouverture — un flux réel : Précédent, un
   * lien collé. La première émission est sautée : c'est l'adresse d'ouverture,
   * déjà lue par {@link criteria}. `undefined` tant que l'adresse n'a pas bougé.
   */
  private readonly addressed = toSignal(this.route.queryParamMap.pipe(skip(1)));

  constructor() {
    // L'adresse OUVRE l'écran — tout de suite, sans attendre un premier
    // rendu. `restart` absorbe son échec dans `feed.failure` : rien à rattraper.
    void this.feed.restart(this.criteria());
    // Puis elle ne relit que si elle dit autre chose que l'écran. Celles que
    // l'écran provoque lui-même disent la même chose, et ne relisent pas.
    effect(() => {
      const params = this.addressed();
      if (params === undefined) {
        return;
      }
      const wanted = readCriteria(params);
      untracked(() => {
        if (!sameCriteria(wanted, this.criteria())) {
          this.criteria.set(wanted);
          void this.feed.restart(wanted);
        }
      });
    });
  }

  /**
   * Pose de nouveaux critères : l'adresse d'abord, puis une lecture **depuis
   * le début** — un curseur ne survit pas à un changement de critère.
   */
  async show(criteria: MediaFeedCriteria): Promise<void> {
    if (sameCriteria(criteria, this.criteria())) {
      return;
    }
    this.criteria.set(criteria);
    this.syncUrl();
    await this.feed.restart(criteria);
  }

  /** Retient ou relâche un mot-clé du filtre. Retenir RESTREINT. */
  async toggleTag(tag: string): Promise<void> {
    const kept = this.criteria().tags;
    await this.show({
      ...this.criteria(),
      tags: kept.includes(tag) ? kept.filter((other) => other !== tag) : [...kept, tag],
    });
  }

  isFilteringOn(tag: string): boolean {
    return this.criteria().tags.includes(tag);
  }

  /** Une colonne de la frise : ses photos, par leur date de prise de vue. */
  async showShotRange(range: { readonly from: string; readonly to: string }): Promise<void> {
    await this.show({ ...this.criteria(), shotFrom: range.from, shotTo: range.to });
  }

  async clearShotRange(): Promise<void> {
    await this.show({ ...this.criteria(), shotFrom: '', shotTo: '' });
  }

  async clearFilter(): Promise<void> {
    await this.show(withoutFilters(this.criteria()));
  }

  /**
   * Le filtre suit un mot renommé ou retiré, puis la grille est relue — même
   * si le filtre n'a pas bougé : elle montre encore l'ancien mot.
   */
  async followTags(tags: readonly string[]): Promise<void> {
    const next = { ...this.criteria(), tags: [...new Set(tags)] };
    if (sameCriteria(next, this.criteria())) {
      await this.feed.reload();
      return;
    }
    await this.show(next);
  }

  /**
   * `replaceUrl` : un filtre qu'on essaie n'est pas une page qu'on visite, et
   * « Précédent » doit ramener d'où l'on vient. Une navigation refusée laisse
   * l'adresse en retard sur l'écran, sans rien casser : elle se tait.
   */
  private syncUrl(): void {
    this.router
      .navigate([], {
        relativeTo: this.route,
        queryParams: toQueryParams(this.criteria()),
        queryParamsHandling: 'merge',
        replaceUrl: true,
      })
      .catch(() => undefined);
  }
}

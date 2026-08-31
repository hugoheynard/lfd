import { Injectable, computed, inject, signal } from '@angular/core';
import type { CatalogRevisionDiffView, CatalogRevisionSummaryView } from '@lfd/pim-contracts';

import { httpErrorMessage } from '@lfd/endpoints';

import { RevisionsHttpApi } from './revisions-http-api';

/**
 * Source réactive des **révisions du catalogue**.
 *
 * Rien n'est chargé au constructeur : cet écran n'est pas sur le chemin de
 * quiconque ouvre le référentiel, et une liste qui se charge sans qu'on l'ait
 * demandée coûte une requête à chaque navigation dans le PIM. La page appelle
 * `load()` quand elle s'affiche.
 */
@Injectable({ providedIn: 'root' })
export class RevisionsStore {
  private readonly api = inject(RevisionsHttpApi);

  private readonly items = signal<readonly CatalogRevisionSummaryView[]>([]);
  readonly revisions = this.items.asReadonly();

  private readonly busyValue = signal(false);
  readonly busy = this.busyValue.asReadonly();

  private readonly errorValue = signal<string | null>(null);
  readonly error = this.errorValue.asReadonly();

  private readonly diffValue = signal<CatalogRevisionDiffView | null>(null);
  readonly diff = this.diffValue.asReadonly();

  /**
   * Ce que la dernière pose a donné, en une phrase.
   *
   * `null` = on n'a rien posé depuis l'ouverture. La distinction compte :
   * « le catalogue n'a pas bougé » est un résultat, pas une absence de
   * résultat, et l'écran doit pouvoir le dire.
   */
  private readonly lastTakeValue = signal<string | null>(null);
  readonly lastTake = this.lastTakeValue.asReadonly();

  /** Deux ancres au moins : sans quoi il n'y a rien à comparer. */
  readonly comparable = computed(() => this.items().length >= 2);

  async load(): Promise<void> {
    await this.run(async () => {
      this.items.set(await this.api.list());
    });
  }

  /**
   * Prépare une publication — fige le catalogue — et rafraîchit la liste.
   *
   * Le geste est le MÊME que celui d'un push, qui fige de lui-même avant
   * d'envoyer. Il reste ici pour figer avant une modification risquée, sans
   * rien publier.
   *
   * Le message distingue les deux issues du serveur : une révision préparée, ou
   * un catalogue inchangé. Les confondre en « c'est fait » ferait croire à une
   * version de plus qui n'existe pas.
   */
  async take(label: string): Promise<void> {
    await this.run(async () => {
      const trimmed = label.trim();
      const taken = await this.api.take(trimmed === '' ? null : trimmed);
      this.lastTakeValue.set(
        taken.created
          ? `Révision ${String(taken.version)} préparée.`
          : `Le catalogue n'a pas bougé depuis la révision ${String(taken.version)} : rien n'a été préparé.`,
      );
      this.items.set(await this.api.list());
    });
  }

  async compare(from: number, to: number): Promise<void> {
    await this.run(async () => {
      this.diffValue.set(await this.api.diff(from, to));
    });
  }

  /** Un seul chemin pour le drapeau d'attente et le message d'erreur. */
  private async run(work: () => Promise<void>): Promise<void> {
    this.busyValue.set(true);
    this.errorValue.set(null);
    try {
      await work();
    } catch (caught) {
      this.errorValue.set(httpErrorMessage(caught));
    } finally {
      this.busyValue.set(false);
    }
  }
}

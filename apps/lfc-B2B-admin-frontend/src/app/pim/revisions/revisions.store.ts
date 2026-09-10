import { Injectable, computed, inject, signal } from '@angular/core';
import type {
  CatalogPendingDiffView,
  CatalogRevisionDiffView,
  CatalogRevisionSummaryView,
} from '@lfd/pim-contracts';

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

  /**
   * **Ce qui a bougé depuis la dernière publication**, en détail.
   *
   * `null` = pas encore demandé. Il ne se charge pas avec la liste : il coûte
   * un payload par article modifié plus une lecture de journal par produit,
   * alors que la liste ne coûte qu'une requête. Le faire d'office ferait payer
   * ce prix à qui vient seulement comparer deux ancres.
   */
  private readonly pendingValue = signal<CatalogPendingDiffView | null>(null);
  readonly pending = this.pendingValue.asReadonly();

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
          ? `Révision ${taken.reference} préparée.`
          : `Le catalogue n'a pas bougé depuis ${taken.reference} : rien n'a été préparé.`,
      );
      this.items.set(await this.api.list());
    });
  }

  /** Charge le détail vivant. Le compteur de l'état du catalogue l'annonce déjà. */
  async loadPending(): Promise<void> {
    await this.run(async () => {
      this.pendingValue.set(await this.api.sinceLast());
    });
  }

  /**
   * Nomme une ancre muette, puis relit la liste.
   *
   * Relire plutôt que muter la ligne en mémoire : le serveur peut refuser — une
   * ancre déjà nommée —, et une liste qu'on aurait mutée d'avance affirmerait
   * alors un nom que la base ne porte pas.
   */
  async name(reference: string, label: string): Promise<void> {
    await this.run(async () => {
      await this.api.name(reference, label.trim());
      this.items.set(await this.api.list());
    });
  }

  async compare(from: string, to: string): Promise<void> {
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

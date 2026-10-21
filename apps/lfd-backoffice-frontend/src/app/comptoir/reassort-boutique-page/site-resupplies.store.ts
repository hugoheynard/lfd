import { computed, inject, Injectable, signal } from '@angular/core';
import type {
  ResupplyTarget,
  SiteResuppliesView,
  SiteResupplyDraftView,
  SiteResupplyView,
} from '@lfd/contracts';
import { httpErrorMessage } from '@lfd/endpoints';

import { SiteResuppliesService } from './site-resupplies.service';

/**
 * Les réassorts du point ouvert — sa demande en cours par visée (lot R1c) et
 * ses réassorts envoyés —, partagés par la carte « Commander au fournil » et
 * par la proposition « Ajouter à la demande au plus tôt » des alertes de
 * stock. Fournie par la page : une instance par écran, jamais à la racine.
 *
 * Rien n'est gardé à l'écran que le serveur n'ait pas : chaque geste écrit,
 * puis relit — un rechargement ou un autre poste retrouve la même demande.
 */
@Injectable()
export class SiteResuppliesStore {
  private readonly service = inject(SiteResuppliesService);

  readonly siteId = signal<string | null>(null);
  readonly view = signal<SiteResuppliesView | null>(null);
  readonly pending = signal(false);
  readonly failure = signal<string | null>(null);
  /** La lecture a-t-elle échoué ? Une liste vide ne veut alors rien dire. */
  readonly loadFailed = signal(false);

  /** Les demandes en cours, « pour demain » d'abord, puis par journée. */
  readonly drafts = computed<readonly SiteResupplyDraftView[]>(() =>
    [...(this.view()?.drafts ?? [])].sort(
      (a, b) =>
        Number(a.target === 'asap') - Number(b.target === 'asap') ||
        a.serviceDay.localeCompare(b.serviceDay),
    ),
  );

  /** Relit les réassorts du point ; une réponse d'un point quitté entre-temps est jetée. */
  async load(siteId: string | null): Promise<void> {
    if (siteId !== this.siteId()) {
      this.siteId.set(siteId);
      this.view.set(null);
      this.failure.set(null);
    }
    if (siteId === null) {
      return;
    }
    try {
      const view = await this.service.list(siteId);
      if (this.siteId() === siteId) {
        this.view.set(view);
        this.loadFailed.set(false);
      }
    } catch {
      this.loadFailed.set(true);
    }
  }

  /** Ajoute à la demande en cours de la visée. Rend vrai si le serveur l'a acceptée. */
  addLine(target: ResupplyTarget, sku: string, quantity: number): Promise<boolean> {
    return this.act((siteId) => this.service.addLine(siteId, target, sku, quantity));
  }

  correctLine(draft: SiteResupplyDraftView, sku: string, quantity: number): Promise<boolean> {
    return this.act((siteId) =>
      this.service.correctLine(siteId, draft.id, sku, quantity, draft.version),
    );
  }

  withdrawLine(draft: SiteResupplyDraftView, sku: string): Promise<boolean> {
    return this.act((siteId) => this.service.withdrawLine(siteId, draft.id, sku, draft.version));
  }

  send(draft: SiteResupplyDraftView): Promise<boolean> {
    return this.act((siteId) => this.service.send(siteId, draft.id, draft.version));
  }

  cancel(resupply: SiteResupplyView): Promise<boolean> {
    return this.act((siteId) => this.service.cancel(siteId, resupply.id));
  }

  /**
   * Un geste, puis la relecture — y compris après un refus : un 409 dit
   * qu'un autre poste a changé la demande, et l'écran montre alors la sienne.
   */
  private async act(gesture: (siteId: string) => Promise<unknown>): Promise<boolean> {
    const siteId = this.siteId();
    if (siteId === null || this.pending()) {
      return false;
    }
    this.pending.set(true);
    this.failure.set(null);
    try {
      await gesture(siteId);
      return true;
    } catch (error) {
      this.failure.set(httpErrorMessage(error, "Le réassort n'a pas pu être enregistré."));
      return false;
    } finally {
      await this.load(siteId);
      this.pending.set(false);
    }
  }
}

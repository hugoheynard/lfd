import { computed, inject, Injectable, signal } from '@angular/core';
import type { BakehouseResupplyDraftView, SaveBakehouseResupplyDraftPayload } from '@lfd/contracts';

import { BakehouseResuppliesService } from './bakehouse-resupplies.service';

/** Le brouillon chargé dans la carte : son identité et la version lue. */
export interface DraftInHand {
  readonly id: string;
  readonly version: number;
}

/**
 * **Les brouillons du fournil, côté écran** (`plan-brouillons-du-fournil.md`,
 * Hugo 2026-10-28) : la liste des ouverts, et celui que la carte a en main.
 *
 * Il ne garde rien que le serveur n'ait pas : chaque geste relit la liste. Un
 * refus (un autre poste est passé avant : 409) remonte à la carte, qui le dit
 * — la liste se relit quand même, pour montrer l'état réel.
 */
@Injectable()
export class BakehouseDraftsStore {
  private readonly service = inject(BakehouseResuppliesService);

  private readonly list = signal<readonly BakehouseResupplyDraftView[]>([]);
  private readonly hand = signal<DraftInHand | null>(null);
  readonly drafts = this.list.asReadonly();
  readonly current = this.hand.asReadonly();
  readonly currentId = computed(() => this.hand()?.id ?? null);
  /** La liste n'a pas pu se lire : la carte le dit, sans bloquer l'envoi. */
  readonly unreadable = signal(false);

  async reload(): Promise<void> {
    try {
      this.list.set(await this.service.drafts());
      this.unreadable.set(false);
    } catch {
      this.unreadable.set(true);
    }
  }

  /** Crée, ou réécrit le brouillon en main à la version lue. */
  async save(content: SaveBakehouseResupplyDraftPayload): Promise<void> {
    const hand = this.hand();
    try {
      const saved =
        hand === null
          ? await this.service.createDraft(content)
          : await this.service.saveDraft(hand.id, { ...content, version: hand.version });
      this.hand.set(saved);
    } finally {
      await this.reload();
    }
  }

  /** Envoie ce que l'écran montre : depuis le brouillon en main, ou sans brouillon. */
  async send(content: SaveBakehouseResupplyDraftPayload): Promise<void> {
    const hand = this.hand();
    try {
      if (hand === null) {
        await this.service.send(content.siteId, {
          target: content.target,
          name: content.name,
          lines: content.lines,
        });
      } else {
        await this.service.sendDraft(hand.id, { ...content, version: hand.version });
      }
      this.hand.set(null);
    } finally {
      if (hand !== null) {
        await this.reload();
      }
    }
  }

  async discard(draft: BakehouseResupplyDraftView): Promise<void> {
    try {
      await this.service.discardDraft(draft.id, draft.version);
      if (this.hand()?.id === draft.id) {
        this.hand.set(null);
      }
    } finally {
      await this.reload();
    }
  }

  /** Le brouillon repris passe en main ; la carte en recopie le contenu. */
  take(draft: BakehouseResupplyDraftView): void {
    this.hand.set({ id: draft.id, version: draft.version });
  }

  /** « Nouveau réassort » : la carte se vide, le brouillon reste dans la liste. */
  release(): void {
    this.hand.set(null);
  }
}

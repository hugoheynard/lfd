import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldEmptyStateComponent,
  FoldLoadingStateComponent,
  FoldNumberInputComponent,
  FoldStatusBadgeComponent,
} from 'fold-ng';
import type { PackingResupplyLineView, PackingResupplyView } from '@lfd/contracts';

import { PackingService } from '../../packing.service';
import { serverMessageOf } from '../../server-message';

type LoadState = 'loading' | 'ready' | 'error';

/** La clé d'une saisie : une ligne d'une fiche. */
function lineKey(resupplyId: string, sku: string): string {
  return `${resupplyId}::${sku}`;
}

/**
 * **Les fiches de réassort au poste de colisage** (lot R3d du réassort,
 * routes R3b) — une fiche par réassort d'un point servi par transfert
 * (Village), à part des commandes : on saisit ce qui est RÉELLEMENT emballé
 * par ligne (≤ demandé, 0 permis), puis on clôt.
 *
 * 🔴 Comme le reste du poste, l'écran ne décide rien : la borne, la réserve
 * (on n'emballe que ce que le four a remis) et la clôture (toutes les lignes
 * saisies) sont au serveur ; un refus s'affiche tel quel, et l'écran relit
 * après chaque geste accepté. Le seul état gardé est le brouillon d'une saisie.
 */
@Component({
  selector: 'app-packing-resupplies',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldEmptyStateComponent,
    FoldLoadingStateComponent,
    FoldNumberInputComponent,
    FoldStatusBadgeComponent,
  ],
  templateUrl: './packing-resupplies.html',
  styleUrl: './packing-resupplies.scss',
})
export class PackingResupplies {
  private readonly packing = inject(PackingService);

  /** La journée de colisage, `AAAA-MM-JJ`. */
  readonly date = input.required<string>();

  protected readonly state = signal<LoadState>('loading');
  protected readonly resupplies = signal<readonly PackingResupplyView[]>([]);
  /** Les saisies en cours, par ligne — absentes : la valeur du serveur. */
  private readonly drafts = signal<ReadonlyMap<string, number | null>>(new Map());
  /** La ligne ou la fiche dont le geste est en vol. */
  protected readonly busy = signal<string | null>(null);
  /** Le dernier refus du serveur, tel quel. */
  protected readonly failure = signal<string | null>(null);

  protected readonly openCount = computed(
    () => this.resupplies().filter((resupply) => resupply.status === 'open').length,
  );

  constructor() {
    effect(() => {
      void this.load(this.date());
    });
  }

  protected async load(date: string = this.date()): Promise<void> {
    this.state.set('loading');
    try {
      this.resupplies.set((await this.packing.resupplies(date)).resupplies);
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  /** La valeur affichée : le brouillon s'il existe, sinon l'emballé du serveur. */
  protected draftOf(resupply: PackingResupplyView, line: PackingResupplyLineView): number | null {
    const key = lineKey(resupply.resupplyId, line.sku);
    return this.drafts().has(key) ? (this.drafts().get(key) ?? null) : line.packed;
  }

  protected setDraft(
    resupply: PackingResupplyView,
    line: PackingResupplyLineView,
    value: number | null,
  ): void {
    const next = new Map(this.drafts());
    next.set(lineKey(resupply.resupplyId, line.sku), value);
    this.drafts.set(next);
  }

  /** Une saisie à envoyer : un nombre, différent de ce que le serveur a. */
  protected canSave(resupply: PackingResupplyView, line: PackingResupplyLineView): boolean {
    const draft = this.draftOf(resupply, line);
    return resupply.status === 'open' && draft !== null && draft !== line.packed;
  }

  /** Toutes les lignes sont saisies : la clôture peut être demandée. */
  protected canClose(resupply: PackingResupplyView): boolean {
    return resupply.status === 'open' && resupply.lines.every((line) => line.packed !== null);
  }

  protected isBusy(resupply: PackingResupplyView, sku?: string): boolean {
    const key = sku === undefined ? resupply.resupplyId : lineKey(resupply.resupplyId, sku);
    return this.busy() === key;
  }

  protected async save(
    resupply: PackingResupplyView,
    line: PackingResupplyLineView,
  ): Promise<void> {
    const quantity = this.draftOf(resupply, line);
    if (quantity === null) {
      return;
    }
    const key = lineKey(resupply.resupplyId, line.sku);
    await this.gesture(key, () =>
      this.packing.enterResupplyLine(this.date(), resupply.resupplyId, line.sku, quantity),
    );
  }

  protected async close(resupply: PackingResupplyView): Promise<void> {
    await this.gesture(resupply.resupplyId, () =>
      this.packing.closeResupply(this.date(), resupply.resupplyId),
    );
  }

  /** Envoie un geste, relit sur succès, dit le refus sinon. */
  private async gesture(key: string, send: () => Promise<void>): Promise<void> {
    this.busy.set(key);
    this.failure.set(null);
    try {
      await send();
      const next = new Map(this.drafts());
      next.delete(key);
      this.drafts.set(next);
      await this.load();
    } catch (error) {
      this.failure.set(serverMessageOf(error));
    } finally {
      this.busy.set(null);
    }
  }
}

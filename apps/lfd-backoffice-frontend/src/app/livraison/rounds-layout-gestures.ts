import { HttpErrorResponse } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { httpErrorMessage } from '@lfd/endpoints';

import { NotifyService } from '../notify.service';
import type { OrderLists } from './delivery-rounds';
import type { StopShift } from './round-column/round-column';
import {
  dropOutcome,
  type GestureOutcome,
  removeOutcome,
  shiftOutcome,
  sortOutcome,
} from './round-gestures';
import { type BoardDrop } from './rounds-board-model';
import { listsOf } from './rounds-board-lists';
import { RoundsDay } from './rounds-day';
import { CONFLICT, RoundsDayWriter } from './rounds-day-writer';
import { RoundsPreview } from './rounds-preview';

const PROPOSAL_CHANGED = 'La composition a changé entre-temps : reproposez.';

/** Le bandeau « Annuler » : ce qui vient d'être fait, et comment le défaire. */
export interface UndoToast {
  readonly id: number;
  readonly text: string;
  readonly undo: (() => void) | null;
}

/**
 * **Les gestes du tableau de l'organisateur, et leur « Annuler »** — sortis
 * de `RoundsPage`.
 *
 * Un geste (glisser, « Mettre dans », ↑ ↓, retirer, ranger) devient les
 * listes visées ({@link GestureOutcome}). En aperçu, elles se recomposent sur
 * place ; sinon elles s'écrivent par {@link RoundsDayWriter}, et le bandeau
 * propose de renvoyer les listes d'avant. « Appliquer » un aperçu passe
 * aussi par ici : il remplace la composition comme un geste. Fourni par la page.
 */
@Injectable()
export class RoundsLayoutGestures {
  private readonly read = inject(RoundsDay);
  private readonly writer = inject(RoundsDayWriter);
  private readonly preview = inject(RoundsPreview);
  private readonly notify = inject(NotifyService);

  readonly toast = signal<UndoToast | null>(null);
  private toastCount = 0;

  /** Ce que montre le tableau : l'aperçu s'il y en a un, sinon la composition. */
  readonly board = computed(() => this.preview.board() ?? this.read.liveBoard());

  drop(drop: BoardDrop): void {
    const board = this.board();
    this.follow(board === null ? null : dropOutcome(board, drop));
  }

  shift(key: string, shift: StopShift): void {
    const board = this.board();
    this.follow(board === null ? null : shiftOutcome(board, key, shift));
  }

  remove(key: string, orderId: string): void {
    const board = this.board();
    this.follow(board === null ? null : removeOutcome(board, key, orderId));
  }

  sort(key: string): void {
    this.follow(sortOutcome(this.board(), key));
  }

  undo(): void {
    const toast = this.toast();
    this.toast.set(null);
    toast?.undo?.();
  }

  dismiss(id: number): void {
    if (this.toast()?.id === id) {
      this.toast.set(null);
    }
  }

  showToast(text: string, undo: (() => void) | null): void {
    this.toastCount += 1;
    this.toast.set({ id: this.toastCount, text, undo });
  }

  private follow(outcome: GestureOutcome | null): void {
    if (outcome?.kind === 'refused') {
      this.showToast(outcome.text, null);
    } else if (outcome?.kind === 'relayout') {
      this.relayout(outcome.lists, outcome.text);
    }
  }

  /** Les listes visées : en aperçu, recomposées sur place ; sinon, écrites puis relues. */
  private relayout(next: OrderLists, text: string): void {
    if (this.preview.active()) {
      const snapshot = this.preview.snapshot();
      if (this.preview.relayout(next)) {
        this.showToast(text, () => this.preview.restore(snapshot));
      }
      return;
    }
    const board = this.read.liveBoard();
    if (board === null || this.writer.busy()) {
      return;
    }
    const lists = listsOf(board);
    const before: OrderLists = Object.fromEntries(
      Object.keys(next).map((key) => [key, lists[key] ?? []]),
    );
    void this.writer.writeLayout(next, false).then((written) => {
      if (written) {
        this.showToast(text, () => void this.writer.writeLayout(before, true));
      }
    });
  }

  /** « Appliquer » l'aperçu ; la page a vérifié qu'il peut l'être. */
  async applyProposal(): Promise<void> {
    this.writer.busy.set(true);
    this.writer.refusal.set(null);
    try {
      await this.preview.apply();
      this.toast.set(null);
      this.notify.success('Proposition appliquée : elle se corrige à la main comme avant.');
    } catch (error) {
      const changed = error instanceof HttpErrorResponse && error.status === CONFLICT;
      // Jamais rejouée : elle écraserait ce qu'un collègue vient de composer.
      if (changed) {
        this.preview.discard();
      }
      this.writer.refusal.set(
        httpErrorMessage(
          error,
          changed ? PROPOSAL_CHANGED : 'La proposition n’a pas pu être appliquée.',
        ),
      );
    } finally {
      await this.read.load(this.read.day());
      this.writer.busy.set(false);
    }
  }
}

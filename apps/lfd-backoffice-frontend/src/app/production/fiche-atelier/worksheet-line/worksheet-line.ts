import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldMeterComponent,
  FoldNumberInputComponent,
} from 'fold-ng';

import type { WorkshopBatch, WorkshopLine } from '@lfd/contracts';

import { hourLabel } from '../../worksheet-day';

/** Une fournée telle que la ligne la montre : l'heure dite comme au fournil. */
interface ShownBatch {
  readonly batch: WorkshopBatch;
  readonly hour: string;
}

/**
 * **Une ligne de fiche d'atelier** — ce qui est à sortir, ce qui est sorti, et
 * les deux gestes pour le déclarer (`plan-fournees-progressives.md`, D5).
 *
 * 🔴 **Un seul composant pour les deux supports, et un seul gabarit.** Le poste
 * fixe et le téléphone ne rangent pas les mêmes choses au même endroit, mais
 * c'est la **feuille de style** qui les range, jamais une branche du template :
 * c'est la ligne que le fournil répète neuf fois.
 *
 * **La ligne ne décide rien.** Elle remonte une quantité ou une fournée à
 * annuler ; le parent envoie, et la barre avance à la relecture. Les chiffres
 * (`produced`, `remaining`, `surplus`) sont ceux du serveur.
 *
 * Pas de bouton « + 1 » à l'unité (Hugo, 2026-09-28), et pas de « + 1 plaque »
 * sans contenant réglé : on ne fabrique pas une plaque que personne n'a
 * déclarée.
 */
@Component({
  selector: 'app-worksheet-line',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldBadgeComponent, FoldButtonComponent, FoldMeterComponent, FoldNumberInputComponent],
  templateUrl: './worksheet-line.html',
  styleUrl: './worksheet-line.scss',
  host: {
    // La ligne complète se lit d'un coup d'œil : fond crème, encre passée, nom
    // barré. C'est l'état, pas une décoration — d'où la classe sur l'hôte.
    '[class.is-done]': 'line().done',
  },
})
export class WorksheetLine {
  readonly line = input.required<WorkshopLine>();

  /** Un geste de cette ligne est en vol : tout est désarmé le temps de l'envoi. */
  readonly busy = input(false);

  /** Une fournée à déclarer, en pièces. */
  readonly recorded = output<number>();

  /** Une fournée à annuler — celle de n'importe quel poste. */
  readonly cancelled = output<WorkshopBatch>();

  /** Le champ « Saisir » est-il ouvert ? */
  protected readonly entering = signal(false);

  /** La quantité du champ. `null` = vidé. */
  protected readonly draft = signal<number | null>(null);

  /** Le nom de la barre : sans lui, neuf barres s'annoncent pareil. */
  protected readonly meterLabel = computed(() => `${this.line().productName} — pièces sorties`);

  /** « + 1 tourneuse » — le mot du réglage. `null` = pas de contenant, pas de bouton. */
  protected readonly quickLabel = computed(() => {
    const container = this.line().container;
    return container === null ? null : `+ 1 ${container.singular}`;
  });

  /** Une saisie qui peut partir : un entier d'au moins une pièce. */
  protected readonly draftValid = computed(() => {
    const value = this.draft();
    return value !== null && Number.isInteger(value) && value >= 1;
  });

  protected readonly batches = computed<readonly ShownBatch[]>(() =>
    this.line().batches.map((batch) => ({ batch, hour: hourLabel(batch.recordedAt) ?? '' })),
  );

  /** « + 1 plaque » : une fournée de la taille du contenant réglé. */
  protected addContainer(): void {
    const container = this.line().container;
    if (container !== null) {
      this.recorded.emit(container.unitsPerContainer);
    }
  }

  /** Ouvre le champ, prérempli de ce qui reste — au moins une pièce. */
  protected openEntry(): void {
    this.draft.set(Math.max(1, this.line().remaining));
    this.entering.set(true);
  }

  protected closeEntry(): void {
    this.entering.set(false);
  }

  /** Valide la saisie d'un geste — le bouton ou la touche Entrée. */
  protected submit(event: Event): void {
    event.preventDefault();
    const value = this.draft();
    if (this.busy() || value === null || !this.draftValid()) {
      return;
    }
    this.recorded.emit(value);
    this.entering.set(false);
  }
}

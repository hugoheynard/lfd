import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import type { WorkshopBatch, WorkshopLine, WorkshopShortcutView } from '@lfd/contracts';

import { LineAlwaysGreen } from '../line-always-green/line-always-green';
import { LineSimple } from '../line-simple/line-simple';
import { WorksheetLine } from '../worksheet-line/worksheet-line';
import type { LinePending } from '../outbox/workshop-outbox';
import { trackingLevelOf } from '../rules/workshop-line-gestures';

/**
 * **Une ligne de la fiche, dans le composant de son niveau de suivi**
 * (`documentation/fournil/les-niveaux-de-suivi.md`).
 *
 * Seul endroit de la vue produit qui choisit entre toujours vert, simple et
 * détaillé : les lignes à faire et les lignes faites passent par lui, sans
 * recopier le choix. Il ne décide aucun geste — il les remonte tels quels.
 * L'hôte ne dessine rien (`display: contents`) : la grille de la liste reste
 * celle de la ligne.
 */
@Component({
  selector: 'app-workshop-line',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LineAlwaysGreen, LineSimple, WorksheetLine],
  templateUrl: './workshop-line.html',
  styleUrl: './workshop-line.scss',
})
export class WorkshopLineView {
  readonly line = input.required<WorkshopLine>();
  readonly busy = input(false);
  /** « Maintenant », en minutes — la ligne détaillée en a besoin pour ses retards. */
  readonly now = input.required<number>();
  readonly shortcuts = input<readonly WorkshopShortcutView[]>([]);
  /** Une fournée en route (envoi, file) : montrée à part des chiffres servis. */
  readonly pending = input<LinePending | null>(null);
  /** Un « Fait » de la ligne gardé sans réseau (simple). */
  readonly doneWaiting = input(false);
  /** La ligne que le lien de la cloche désigne : cerclée. */
  readonly linked = input(false);

  /** Une fournée de cette quantité (détaillé). */
  readonly recorded = output<number>();
  /** Annuler une fournée (détaillé). */
  readonly cancelled = output<WorkshopBatch>();
  /** « Fait » (simple). */
  readonly done = output<void>();
  /** « Problème » (simple, toujours vert). */
  readonly problem = output<void>();

  protected readonly level = computed(() => trackingLevelOf(this.line()));
}

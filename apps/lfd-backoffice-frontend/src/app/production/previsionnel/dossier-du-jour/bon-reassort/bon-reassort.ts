import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { ProductionDayResupply } from '@lfd/contracts';

import { resupplySiteLabel } from '../resupply-sheets';

/**
 * **Le bon de réassort** (R3d-bis, Hugo 2026-10-21) — l'aperçu à l'écran de
 * la page que le PDF du dossier imprime pour chaque réassort, à la suite des
 * bons de commande : le point, ses lignes, ses quantités. Sans prix, sans QR —
 * un réassort n'a pas de client, et la fiche du Village se tient au colisage.
 */
@Component({
  selector: 'app-bon-reassort',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './bon-reassort.html',
  styleUrl: './bon-reassort.scss',
})
export class BonReassort {
  readonly resupply = input.required<ProductionDayResupply>();
  /** Son rang dans la pile des réassorts : le trou se voit. */
  readonly rank = input.required<number>();
  readonly total = input.required<number>();
  readonly dayLabel = input.required<string>();

  protected readonly siteLabel = computed(() => resupplySiteLabel(this.resupply()));
  protected readonly pieces = computed(() =>
    this.resupply().lines.reduce((sum, line) => sum + line.quantity, 0),
  );
}

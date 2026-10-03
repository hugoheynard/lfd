import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import type {
  DeliveryLoadingPlanFloorView,
  DeliveryLoadingPlanStackView,
  DeliveryLoadingPlanStepView,
} from '@lfd/contracts';

import { FoldButtonComponent } from 'fold-ng';

import { floorLegend, floorStackShapes, unplacedStacksLabel } from '../delivery-loading-floor';
import { type BinLoader, currentRow, type FloorRow, floorRows } from '../delivery-loading-rows';
import { LoadingRowPanel } from '../loading-row-panel/loading-row-panel';

/** Marge autour du plancher, en cm du dessin. */
const PLAN_PADDING = 4;

/**
 * **Le plancher vu de dessus** (`plan-geometrie-du-plancher.md`, G5) : le fond
 * à gauche, les portes à droite, les passages de roue, et chaque pile posée
 * portant les numéros de ses arrêts, du bas vers le haut. Lu au dépôt comme
 * sur le téléphone du livreur : le dessin s'étire sur la largeur disponible.
 *
 * G6 : chaque arrêt a sa couleur (une tranche de pile par arrêt), redondante
 * avec le numéro qui reste écrit ; la légende dit arrêt → couleur → client.
 * Une pile dont tous les bacs sont scannés se marque « ✓ » et se cercle.
 *
 * Les RANGÉES (1 = le fond) sont dessinées et se touchent, une pile aussi :
 * le panneau « Quoi mettre ici » s'ouvre sous le dessin, avec les piles de la
 * rangée et leurs bacs du bas vers le haut, et le geste de scan de l'écran.
 */
@Component({
  selector: 'app-loading-floor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent, LoadingRowPanel],
  templateUrl: './loading-floor.html',
  styleUrl: './loading-floor.scss',
})
export class LoadingFloor {
  readonly floor = input.required<DeliveryLoadingPlanFloorView>();
  readonly stacks = input.required<readonly DeliveryLoadingPlanStackView[]>();
  /** L'ordre du plan : le client de chaque arrêt, pour la légende. */
  readonly order = input<readonly DeliveryLoadingPlanStepView[]>([]);
  /** Les piles dont tous les bacs sont scannés. */
  readonly loadedStacks = input<ReadonlySet<number>>(new Set());
  /** Les bacs (ou moitiés) déjà chargés, par `planBinKey`. */
  readonly loadedBins = input<ReadonlySet<string>>(new Set());
  /** Le geste de chargement de l'écran ; `null` : le panneau ne fait que lire. */
  readonly loader = input<BinLoader | null>(null);
  readonly busy = input(false);

  /** La rangée ouverte, et la pile touchée s'il y en a une. */
  protected readonly selection = signal<{
    readonly row: number;
    readonly stack: number | null;
  } | null>(null);
  protected readonly rows = computed(() =>
    floorRows(this.stacks(), this.order(), this.loadedBins()),
  );
  protected readonly current = computed(() => currentRow(this.rows()));
  protected readonly openRow = computed(() => {
    const selection = this.selection();
    return selection === null ? null : (this.rows().find((r) => r.row === selection.row) ?? null);
  });
  /** La rangée de chaque pile au sol, pour qu'une pile touchée ouvre la sienne. */
  private readonly rowOfStack = computed(
    () =>
      new Map(
        this.rows().flatMap((row) => row.stacks.map((s) => [s.stackIndex, row.row] as const)),
      ),
  );

  protected readonly padding = PLAN_PADDING;
  protected readonly shapes = computed(() => floorStackShapes(this.stacks(), this.loadedStacks()));
  protected readonly legend = computed(() => floorLegend(this.stacks(), this.order()));
  protected readonly offFloor = computed(() => unplacedStacksLabel(this.stacks(), 'off_floor'));
  protected readonly refrigerated = computed(() =>
    unplacedStacksLabel(this.stacks(), 'refrigerated'),
  );
  protected readonly viewBox = computed(() => {
    const floor = this.floor();
    return `0 0 ${String(floor.lengthCm + 2 * PLAN_PADDING)} ${String(floor.widthCm + 2 * PLAN_PADDING)}`;
  });
  protected readonly planLabel = computed(
    () =>
      `Plancher vu de dessus, fond à gauche, portes à droite : ${String(this.shapes().length)} pile(s) au sol en ${String(this.rows().length)} rangée(s). Touchez une rangée ou une pile pour savoir quoi y mettre.`,
  );

  protected selectRow(row: number): void {
    const selection = this.selection();
    this.selection.set(
      selection?.row === row && selection.stack === null ? null : { row, stack: null },
    );
  }

  protected selectStack(stackIndex: number): void {
    const row = this.rowOfStack().get(stackIndex);
    if (row !== undefined) {
      this.selection.set({ row, stack: stackIndex });
    }
  }

  protected close(): void {
    this.selection.set(null);
  }

  /** Entrée ou Espace sur une cible du dessin : le geste du clic, sans faire défiler. */
  protected onKey(event: KeyboardEvent, activate: () => void): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      activate();
    }
  }

  protected rowAriaLabel(row: FloorRow): string {
    return `${row.label}${row.row === 1 ? ' (le fond)' : ''} — ${String(row.loadedCount)} bac(s) chargé(s) sur ${String(row.binCount)}`;
  }
}

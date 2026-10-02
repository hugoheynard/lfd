import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { DeliveryLoadingPlanFloorView, DeliveryLoadingPlanStackView } from '@lfd/contracts';

import { floorStackShapes, unplacedStacksLabel } from '../delivery-loading-floor';

/** Marge autour du plancher, en cm du dessin. */
const PLAN_PADDING = 4;

/**
 * **Le plancher vu de dessus** (`plan-geometrie-du-plancher.md`, G5) : le fond
 * à gauche, les portes à droite, les passages de roue, et chaque pile posée
 * portant les numéros de ses arrêts, du bas vers le haut. Lu au dépôt comme
 * sur le téléphone du livreur : le dessin s'étire sur la largeur disponible.
 */
@Component({
  selector: 'app-loading-floor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './loading-floor.html',
  styleUrl: './loading-floor.scss',
})
export class LoadingFloor {
  readonly floor = input.required<DeliveryLoadingPlanFloorView>();
  readonly stacks = input.required<readonly DeliveryLoadingPlanStackView[]>();

  protected readonly padding = PLAN_PADDING;
  protected readonly shapes = computed(() => floorStackShapes(this.stacks()));
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
      `Plancher vu de dessus, fond à gauche, portes à droite : ${String(this.shapes().length)} pile(s) au sol`,
  );
}

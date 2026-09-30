import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type {
  CargoFloorPayload,
  PurchaseAssistantFormat,
  PurchaseAssistantFormatView,
} from '@lfd/contracts';
import {
  FoldBadgeComponent,
  FoldCardComponent,
  FoldElementTitleComponent,
  FoldFieldComponent,
  FoldFieldListComponent,
  FoldMeterComponent,
} from 'fold-ng';

import { formatLiters, placeBins } from '../purchase-assistant';

/** Marge du dessin autour du plancher, en cm du plan. */
const PLAN_PADDING = 4;

/**
 * **Le verdict d'un format** dans l'assistant d'achat (G-D3) : le total, le
 * volume utile, la part du véhicule, ce qui arrête la pile, et le plancher vu
 * de dessus — fond à gauche, portes à droite.
 *
 * Vue de présentation : tout vient de la réponse du serveur et de la question
 * qui l'a produite. Le seul calcul fait ici est le PLACEMENT des bacs d'une
 * rangée dans le dessin ; leur nombre et leur sens sont ceux du serveur.
 */
@Component({
  selector: 'app-purchase-assistant-result',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldBadgeComponent,
    FoldCardComponent,
    FoldElementTitleComponent,
    FoldFieldComponent,
    FoldFieldListComponent,
    FoldMeterComponent,
  ],
  templateUrl: './purchase-assistant-result.html',
  styleUrl: './purchase-assistant-result.scss',
})
export class PurchaseAssistantResult {
  readonly format = input.required<PurchaseAssistantFormatView>();
  /** Le format tel qu'il a été ENVOYÉ : ses cotes dessinent les bacs. */
  readonly sent = input.required<PurchaseAssistantFormat>();
  readonly floor = input.required<CargoFloorPayload>();
  readonly gapCm = input.required<number>();
  readonly best = input(false);

  protected readonly padding = PLAN_PADDING;
  protected readonly usefulVolume = computed(() => formatLiters(this.format().usefulLiters));
  protected readonly subtitle = computed(() => {
    const view = this.format();
    const levels = `${view.levels} étage${view.levels > 1 ? 's' : ''}`;
    return `${view.floorCount} au sol × ${levels}`;
  });
  protected readonly heightLimit = computed(() => {
    const view = this.format();
    const free = this.floor().heightCm - view.levels * this.sent().outer.heightCm;
    const cause =
      view.heightLimit === 'stack'
        ? `Limité par la pile (${this.sent().maxStack} au plus)`
        : 'Limité par le plafond';
    return `${cause} — ${free} cm libres au-dessus`;
  });
  protected readonly viewBox = computed(() => {
    const floor = this.floor();
    return `0 0 ${floor.lengthCm + 2 * PLAN_PADDING} ${floor.widthCm + 2 * PLAN_PADDING}`;
  });
  protected readonly bins = computed(() =>
    placeBins(this.format().rows, this.sent().outer, this.floor().widthCm, this.gapCm()),
  );
  protected readonly hasTurned = computed(() => this.bins().some((bin) => bin.turned));
  protected readonly planLabel = computed(
    () => `Plancher vu de dessus : ${this.format().floorCount} bacs au sol`,
  );
}

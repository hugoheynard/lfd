import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Les trois étapes d'un avenant, dans l'ordre. */
export const AMENDMENT_STEPS = ['Modifier', 'Vérifier', 'Dater et enregistrer'] as const;

export type AmendmentStep = 1 | 2 | 3;

/**
 * **L'en-tête d'étapes d'un avenant** — « 1 Modifier · 2 Vérifier · 3 Dater
 * et enregistrer ». Une liste ordonnée, l'étape courante portant
 * `aria-current="step"` : le lecteur d'écran dit où l'on est et combien il
 * en reste. Les étapes ne sont pas cliquables : on avance par le bouton de
 * l'étape, qui dit ce qu'il fait.
 */
@Component({
  selector: 'app-amendment-steps',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './amendment-steps.html',
  styleUrl: './amendment-steps.scss',
})
export class AmendmentSteps {
  readonly step = input.required<AmendmentStep>();
  protected readonly steps = AMENDMENT_STEPS;
}

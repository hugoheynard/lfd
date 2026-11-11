import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import { FoldDateComponent, FoldTextareaComponent } from 'fold-ng';

import { AMENDMENT_REASON_MAX_LENGTH } from '../amendment-body';
import { NO_END_REASON } from '../amendment-effect';
import { nativeValue } from '../../../shared/native-input';

/**
 * **Dater l'avenant** (étape 3) : la date d'effet — aujourd'hui par défaut,
 * jamais avant —, la fin seulement si F1 la permet, et le motif obligatoire.
 * Les boutons et les refus du serveur restent chez l'éditeur, qui enregistre.
 */
@Component({
  selector: 'app-amendment-dating',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldDateComponent, FoldTextareaComponent],
  templateUrl: './amendment-dating.html',
  styleUrl: './amendment-dating.scss',
})
export class AmendmentDating {
  /**
   * `fold-textarea` ne rend sa valeur qu'en quittant le champ : le motif se lit
   * aussi à chaque frappe, pour que le bouton s'active sans cliquer ailleurs.
   */
  protected readonly nativeValue = nativeValue;

  /** Aujourd'hui à Paris, `AAAA-MM-JJ` : la borne basse de la date d'effet. */
  readonly today = input.required<string>();
  /** F1 : aucun prix arrêté et la politique inchangée. */
  readonly endAllowed = input.required<boolean>();
  readonly fromDay = model.required<string>();
  readonly toDay = model.required<string>();
  readonly reason = model.required<string>();

  protected readonly noEnd = NO_END_REASON;
  protected readonly maxLength = AMENDMENT_REASON_MAX_LENGTH;
  protected readonly tooLong = computed(() => this.reason().trim().length > this.maxLength);
  /** La fin vient après la date d'effet. */
  protected readonly endMin = computed(() => this.fromDay() || this.today());
}

import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { LOYALTY_REASON_MAX, type LoyaltyHolderView } from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldNumberInputComponent,
  FoldPanelHeaderComponent,
  FoldPanelRef,
  FoldTextareaComponent,
} from 'fold-ng';

import { httpErrorMessage } from '@lfd/endpoints';

import { formatPoints, holderName } from '../../loyalty-format';
import { LoyaltyService } from '../../loyalty.service';

/** Charge d'ouverture : le titulaire visé et son solde tel que la liste le montre. */
export interface AdjustPointsPanelData {
  readonly holder: LoyaltyHolderView;
  readonly points: number;
}

/**
 * **Ajuster le solde d'un titulaire, en disant pourquoi** : des points en plus
 * (positif) ou en moins (négatif). Le motif est obligatoire — c'est une ligne
 * `adjusted` du grand livre, lue plus tard par qui cherchera d'où vient un
 * solde (plan D2).
 *
 * L'écran n'envoie ni zéro ni un motif vide, que le serveur refuserait. Qu'un
 * retrait ne fasse pas passer le solde sous zéro, c'est le serveur qui le
 * tient : son refus reste dans le panneau, mot pour mot. Un succès ferme sur
 * `true`, et l'appelant relit la liste.
 */
@Component({
  selector: 'app-adjust-points-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldNumberInputComponent,
    FoldPanelHeaderComponent,
    FoldTextareaComponent,
  ],
  templateUrl: './adjust-points-panel.html',
  styleUrl: './adjust-points-panel.scss',
})
export class AdjustPointsPanel {
  private readonly api = inject(LoyaltyService);
  private readonly ref = inject(FoldPanelRef<boolean>);

  readonly data = input<AdjustPointsPanelData | undefined>(undefined);

  protected readonly points = signal<number | null>(null);
  protected readonly reason = signal('');
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly maxLength = LOYALTY_REASON_MAX;

  protected readonly holderLabel = computed(() => {
    const data = this.data();
    return data === undefined ? '' : holderName(data.holder);
  });

  protected readonly currentBalance = computed(() => formatPoints(this.data()?.points ?? 0));

  /** Un entier non nul — zéro ne changerait rien, le serveur le refuse. */
  private readonly delta = computed(() => {
    const value = this.points();
    return value !== null && Number.isInteger(value) && value !== 0 ? value : null;
  });

  protected readonly pointsInvalid = computed(
    () => this.points() !== null && this.delta() === null,
  );

  /** Le solde qu'on obtiendrait — une indication, le serveur reste juge. */
  protected readonly nextBalance = computed(() => {
    const delta = this.delta();
    const data = this.data();
    return delta === null || data === undefined ? null : data.points + delta;
  });

  private readonly trimmed = computed(() => this.reason().trim());
  protected readonly tooLong = computed(() => this.trimmed().length > LOYALTY_REASON_MAX);

  protected readonly canSubmit = computed(
    () => this.delta() !== null && this.trimmed() !== '' && !this.tooLong() && !this.saving(),
  );

  protected readonly pointsHint = computed(() => {
    if (this.pointsInvalid()) {
      return 'Un nombre entier de points, différent de zéro.';
    }
    const next = this.nextBalance();
    return next === null
      ? 'Positif pour créditer, négatif pour retirer.'
      : `Solde après ajustement : ${formatPoints(next)} points.`;
  });

  protected async submit(): Promise<void> {
    const data = this.data();
    const delta = this.delta();
    if (data === undefined || delta === null || !this.canSubmit()) {
      return;
    }
    this.saving.set(true);
    this.error.set(null);
    try {
      await this.api.adjust({
        holderKind: data.holder.kind,
        holderId: data.holder.id,
        points: delta,
        reason: this.trimmed(),
      });
      this.ref.close(true);
    } catch (caught) {
      this.error.set(httpErrorMessage(caught, "L'ajustement n'a pas pu être enregistré."));
    } finally {
      this.saving.set(false);
    }
  }

  protected cancel(): void {
    this.ref.close();
  }
}

import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { httpErrorMessage } from '@lfd/endpoints';
import { FoldButtonComponent, FoldCalloutComponent, FoldInlineConfirmComponent } from 'fold-ng';

import { PermissionsStore } from '../../auth/permissions.store';
import { CounterParticularsService } from '../../comptoir/counter-particulars.service';
import { GestureIntents } from '../../shared/gesture-intents';

const DECLARE_INTENT = 'no-show';

/**
 * **« Le client n'est pas venu », au retrait du comptoir**
 * (`commande-particulier-reglee-en-boutique.md`, § 5 bis).
 *
 * Le geste de la fiche commande (`commandes/order-no-show/`), réduit à la
 * déclaration : le rail du retrait ne connaît pas le statut de la commande,
 * seulement qu'elle est à régler en boutique et pas encore remise — c'est à
 * son parent de ne l'afficher que là. « Prévenir le client » reste sur la
 * fiche commande, au superviseur. Le serveur juge l'heure : un refus « trop
 * tôt » s'affiche tel qu'il le dit.
 */
@Component({
  selector: 'app-handover-no-show',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent, FoldCalloutComponent, FoldInlineConfirmComponent],
  templateUrl: './handover-no-show.html',
  styleUrl: './handover-no-show.scss',
})
export class HandoverNoShow {
  readonly orderId = input.required<string>();
  /** La commande est déclarée non retirée : elle sort de la file. */
  readonly declared = output<void>();

  private readonly api = inject(CounterParticularsService);
  private readonly intents = new GestureIntents();
  protected readonly allowed = inject(PermissionsStore).can('b2b_place_order:write');

  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async declare(): Promise<void> {
    this.saving.set(true);
    this.error.set(null);
    try {
      await this.api.declareNoShow(this.orderId(), this.intents.keyFor(DECLARE_INTENT));
      this.intents.done(DECLARE_INTENT);
      this.declared.emit();
    } catch (error: unknown) {
      this.error.set(httpErrorMessage(error, 'Le geste n’a pas abouti. Réessayez.'));
    } finally {
      this.saving.set(false);
    }
  }
}

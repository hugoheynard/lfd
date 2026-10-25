import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { FoldButtonComponent, FoldCalloutComponent } from 'fold-ng';

import { PermissionsStore } from '../../../auth/permissions.store';
import { DeliveryNotesService, REPRINT_SENTENCE } from '../../../commandes/delivery-notes.service';
import { NotifyService } from '../../../notify.service';

/**
 * **« Le bon de livraison a changé depuis son impression »**, au poste de
 * colisage (plan E6 (`documentation/commandes/bon-de-livraison.md`),
 * § 14) : le serveur le dit (`deliveryNoteReprintNeeded`), l'écran l'affiche.
 *
 * Le bouton d'impression passe par la route des BL de la fiche commande, sous
 * `b2b_orders:read` : sans ce droit, l'avertissement renvoie à la fiche. Une
 * fois réimprimé, le poste relu ne l'affiche plus.
 */
@Component({
  selector: 'app-packing-reprint-notice',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent, FoldCalloutComponent],
  template: `
    @if (needed()) {
      <fold-callout variant="warning" data-packing-reprint-needed>
        {{ sentence }}
        @if (canPrint()) {
          <div actions>
            <button
              foldButton
              size="sm"
              emphasis="soft"
              [loading]="printing()"
              (click)="print()"
              data-packing-reprint
            >
              Imprimer le bon de livraison
            </button>
          </div>
        } @else {
          Imprimez-le depuis la fiche de la commande.
        }
      </fold-callout>
    }
  `,
})
export class PackingReprintNotice {
  readonly orderId = input.required<string>();
  readonly needed = input.required<boolean>();

  private readonly notes = inject(DeliveryNotesService);
  private readonly notify = inject(NotifyService);
  private readonly permissions = inject(PermissionsStore);

  protected readonly sentence = REPRINT_SENTENCE;
  protected readonly canPrint = computed(() => this.permissions.can('b2b_orders:read'));
  protected readonly printing = signal(false);

  protected async print(): Promise<void> {
    this.printing.set(true);
    try {
      const notes = await this.notes.ofOrder(this.orderId());
      for (const note of notes.filter((one) => one.reprintNeeded)) {
        await this.notes.openCarrier(this.orderId(), note.number);
      }
    } catch (error) {
      this.notify.error(error, "Le bon de livraison n'a pas pu être ouvert.");
    } finally {
      this.printing.set(false);
    }
  }
}

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import type { PackingDeliveryNotePrint, StaffNote } from '@lfd/contracts';
import { FoldBadgeComponent, FoldButtonComponent, FoldCalloutComponent } from 'fold-ng';

import { PermissionsStore } from '../../auth/permissions.store';
import { NotifyService } from '../../notify.service';
import { DeliveryNotesService } from '../delivery-notes.service';

/**
 * **« BL à réimprimer »**, au poste de colisage et sur la carte de la
 * Supervision (plan E6 (`documentation/commandes/bon-de-livraison.md`),
 * § 14 ; Hugo, 2026-10-25) : le serveur dit où en est le papier
 * (`PackingSheet.deliveryNotePrint`), l'écran l'affiche.
 *
 * « Imprimer le BL » ouvre le BL de transport — sans montant — des BL qui ont
 * changé depuis leur impression, ou, s'il n'y en a pas (un départ décidé
 * jamais imprimé : `StaffNote` ne le distingue pas), de tous les BL vivants ;
 * le serveur trace
 * l'impression en le servant. La route est celle de la fiche commande, sous
 * `b2b_orders:read` : sans ce droit, l'avertissement renvoie à la fiche.
 * Imprimé, l'écran relit (`printed`) et dit « Nouveau BL imprimé ».
 */
@Component({
  selector: 'app-delivery-note-print-notice',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldBadgeComponent, FoldButtonComponent, FoldCalloutComponent],
  templateUrl: './delivery-note-print-notice.html',
})
export class DeliveryNotePrintNotice {
  readonly orderId = input.required<string>();
  readonly state = input.required<PackingDeliveryNotePrint | null>();
  /** Les BL sont ouverts : au parent de relire ce que le serveur en dit. */
  readonly printed = output<void>();

  private readonly notes = inject(DeliveryNotesService);
  private readonly notify = inject(NotifyService);
  private readonly permissions = inject(PermissionsStore);

  protected readonly canPrint = computed(() => this.permissions.can('b2b_orders:read'));
  protected readonly printing = signal(false);

  protected async print(): Promise<void> {
    this.printing.set(true);
    try {
      for (const note of toPrint(await this.notes.ofOrder(this.orderId()))) {
        await this.notes.openCarrier(this.orderId(), note.number);
      }
      this.printed.emit();
    } catch (error) {
      this.notify.error(error, "Le bon de livraison n'a pas pu être ouvert.");
    } finally {
      this.printing.set(false);
    }
  }
}

/** Les BL changés depuis leur impression, sinon tous les vivants. */
export function toPrint<T extends Pick<StaffNote, 'reprintNeeded' | 'status'>>(
  notes: readonly T[],
): readonly T[] {
  const changed = notes.filter((note) => note.reprintNeeded);
  return changed.length > 0 ? changed : notes.filter((note) => note.status !== 'voided');
}

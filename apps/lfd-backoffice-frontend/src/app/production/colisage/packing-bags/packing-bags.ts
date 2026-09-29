import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { httpErrorMessage } from '@lfd/endpoints';
import { FoldButtonComponent, FoldCalloutComponent, FoldNumberInputComponent } from 'fold-ng';

import { PermissionsStore } from '../../../auth/permissions.store';
import { DeliveryLoadingService } from '../../../livraison/delivery-loading.service';

/** Une déclaration porte au plus vingt sacs — la borne du contrat. */
const MAX_BAGS = 20;

/** Le nombre à déclarer, s'il est entier et dans la borne ; sinon `null`. */
export function declarableCount(value: number | null): number | null {
  return value !== null && Number.isInteger(value) && value >= 1 && value <= MAX_BAGS
    ? value
    : null;
}

/**
 * **Déclarer les sacs d'une commande prête** (lot 4, L4-C16 et L4-C21).
 *
 * Un sac naît quand on le DÉCLARE : « Sacs », un nombre (un par défaut),
 * « Déclarer » — puis la page d'étiquettes s'ouvre. Ajouter un sac plus tard,
 * c'est en déclarer un de plus ; imprimer n'en crée aucun.
 *
 * 🔴 Le colisage est ouvert à qui écrit les commandes ; déclarer des sacs
 * demande `delivery_loading:write`, que seuls `admin` et `comptoir` ont (Q21).
 * Sans lui, pas de bouton : une phrase dit où ça se fait. Aucun droit n'est
 * élargi, et le geste « Prête » n'est pas touché.
 */
@Component({
  selector: 'app-packing-bags',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldButtonComponent, FoldCalloutComponent, FoldNumberInputComponent, RouterLink],
  templateUrl: './packing-bags.html',
  styleUrl: './packing-bags.scss',
})
export class PackingBags {
  private readonly service = inject(DeliveryLoadingService);
  private readonly router = inject(Router);
  private readonly permissions = inject(PermissionsStore);

  /** La commande — l'identifiant du commerce, que porte la feuille de colisage. */
  readonly orderId = input.required<string>();

  protected readonly canDeclare = computed(() => this.permissions.can('delivery_loading:write'));

  protected readonly open = signal(false);
  protected readonly count = signal<number | null>(1);
  protected readonly busy = signal(false);
  protected readonly refusal = signal<string | null>(null);

  protected readonly maxBags = MAX_BAGS;
  protected readonly declarable = computed(() => declarableCount(this.count()));

  protected labelsLink(): string[] {
    return ['/livraison/etiquettes', this.orderId()];
  }

  protected toggle(): void {
    this.open.update((open) => !open);
    this.refusal.set(null);
  }

  /** Déclare les sacs, puis ouvre leurs étiquettes. Un refus reste ici, tel quel. */
  protected async declare(): Promise<void> {
    const count = this.declarable();
    if (count === null || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.refusal.set(null);
    try {
      await this.service.declareBags({ orderId: this.orderId(), count });
      await this.router.navigate(this.labelsLink());
    } catch (error) {
      this.refusal.set(httpErrorMessage(error, 'Les sacs n’ont pas pu être déclarés.'));
    } finally {
      this.busy.set(false);
    }
  }
}

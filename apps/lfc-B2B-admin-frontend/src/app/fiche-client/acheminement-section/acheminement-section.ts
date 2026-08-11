import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type {
  DeliveryAddressView,
  FulfillmentMethod,
  FulfillmentPreferenceView,
  PickupAddressView,
} from '@lfd/contracts';
import {
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldPageSectionComponent,
} from 'fold-ng';

/** Ce que l'écran propose comme destination, quelle que soit la méthode. */
interface DestinationOption {
  readonly id: string;
  readonly label: string;
}

/**
 * Section **Préférences d'acheminement** d'une fiche client (staff).
 *
 * Comment ce client est servi d'habitude : retrait à tel point, ou livraison à
 * telle adresse. C'est un **point de départ** pour ses commandes, pas une
 * contrainte — le panier s'ouvrira dessus et il pourra en changer. La section le
 * dit noir sur blanc : un commercial qui croit poser une règle promettra au
 * client une exclusivité qui n'existe pas.
 *
 * « Par défaut » est une **option à part entière**, et c'est délibéré : elle suit
 * le défaut du moment. Désigner nommément le point par défaut d'aujourd'hui
 * figerait la préférence sur lui le jour où il change.
 */
@Component({
  selector: 'app-acheminement-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldPageSectionComponent, FoldCardComponent, FoldCalloutComponent, FoldButtonComponent],
  templateUrl: './acheminement-section.html',
  styleUrl: './acheminement-section.scss',
})
export class AcheminementSection {
  /** La préférence enregistrée ; `method: null` = aucune posée. */
  readonly preference = input.required<FulfillmentPreferenceView>();
  /** Les points de retrait de la plateforme (le défaut en tête). */
  readonly pickups = input<readonly PickupAddressView[]>([]);
  /** Les adresses de livraison de CETTE société (la défaut en tête). */
  readonly deliveries = input<readonly DeliveryAddressView[]>([]);
  /** La livraison est-elle un service ouvert ? Sinon, seul le retrait a un sens. */
  readonly deliveryOffered = input(true);

  readonly preferenceChange = output<FulfillmentPreferenceView>();

  /** La méthode retenue, ou `null` tant que rien n'est posé. */
  protected readonly method = computed<FulfillmentMethod | null>(() => this.preference().method);

  /** Les destinations proposées pour la méthode courante. */
  protected readonly options = computed<readonly DestinationOption[]>(() => {
    if (this.method() === 'pickup') {
      return this.pickups().map((point) => ({
        id: point.id,
        label: point.isDefault ? `${point.label} (défaut)` : point.label,
      }));
    }
    return this.deliveries().map((address) => ({
      id: address.id,
      label: address.isDefault ? `${address.label} (défaut)` : address.label,
    }));
  });

  /** La destination retenue ; `''` = « celle par défaut ». */
  protected readonly destinationId = computed(() => {
    const preference = this.preference();
    return (
      (preference.method === 'pickup'
        ? preference.pickupAddressId
        : preference.deliveryAddressId) ?? ''
    );
  });

  /** Rien à choisir : la méthode est posée mais aucune destination n'existe. */
  protected readonly noDestination = computed(
    () => this.method() !== null && this.options().length === 0,
  );

  /** Pose (ou change) la méthode ; la destination repart du défaut. */
  protected chooseMethod(method: FulfillmentMethod): void {
    if (this.method() === method) {
      return;
    }
    this.preferenceChange.emit({ method, pickupAddressId: null, deliveryAddressId: null });
  }

  /** Choisit la destination ; `''` (vide) = « celle par défaut ». */
  protected chooseDestination(event: Event): void {
    const method = this.method();
    if (method === null) {
      return;
    }
    const raw = (event.target as HTMLSelectElement).value;
    const id = raw === '' ? null : raw;
    this.preferenceChange.emit({
      method,
      pickupAddressId: method === 'pickup' ? id : null,
      deliveryAddressId: method === 'delivery' ? id : null,
    });
  }

  /** Retire la préférence : le client choisira comme avant. */
  protected clear(): void {
    this.preferenceChange.emit({ method: null, pickupAddressId: null, deliveryAddressId: null });
  }
}

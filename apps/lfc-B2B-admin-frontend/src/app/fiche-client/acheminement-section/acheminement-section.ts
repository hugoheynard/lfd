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
  FoldListboxComponent,
  FoldPageSectionComponent,
  type FoldSelectOption,
} from 'fold-ng';

/**
 * La destination « aucune en particulier ». Chaîne vide plutôt que `null` : le
 * listbox traite `null` comme « rien de choisi » et retomberait sur son
 * placeholder, alors que suivre le défaut EST un choix — et le plus fréquent.
 */
const DEFAULT_DESTINATION = '';

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
  imports: [
    FoldPageSectionComponent,
    FoldCardComponent,
    FoldCalloutComponent,
    FoldButtonComponent,
    FoldListboxComponent,
  ],
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

  /** Les destinations nommées, pour la méthode courante. */
  private readonly named = computed<readonly FoldSelectOption<string>[]>(() => {
    if (this.method() === 'pickup') {
      return this.pickups().map((point) => ({
        value: point.id,
        label: point.isDefault ? `${point.label} (défaut)` : point.label,
      }));
    }
    return this.deliveries().map((address) => ({
      value: address.id,
      label: address.isDefault ? `${address.label} (défaut)` : address.label,
    }));
  });

  /** Ce que le listbox propose : suivre le défaut, puis les destinations nommées. */
  protected readonly options = computed<readonly FoldSelectOption<string>[]>(() => [
    { value: DEFAULT_DESTINATION, label: 'Celle par défaut' },
    ...this.named(),
  ]);

  /** Le libellé du champ change avec la méthode — le mot juste, pas un générique. */
  protected readonly destinationLabel = computed(() =>
    this.method() === 'pickup' ? 'Point de retrait préféré' : 'Adresse de livraison préférée',
  );

  /** La destination retenue ; chaîne vide = « celle par défaut ». */
  protected readonly destinationId = computed(() => {
    const preference = this.preference();
    return (
      (preference.method === 'pickup'
        ? preference.pickupAddressId
        : preference.deliveryAddressId) ?? DEFAULT_DESTINATION
    );
  });

  /** Rien à choisir : la méthode est posée mais aucune destination n'existe. */
  protected readonly noDestination = computed(
    () => this.method() !== null && this.named().length === 0,
  );

  /** Pose (ou change) la méthode ; la destination repart du défaut. */
  protected chooseMethod(method: FulfillmentMethod): void {
    if (this.method() === method) {
      return;
    }
    this.preferenceChange.emit({ method, pickupAddressId: null, deliveryAddressId: null });
  }

  /** Choisit la destination ; la chaîne vide vaut « celle par défaut ». */
  protected chooseDestination(chosen: string): void {
    const method = this.method();
    if (method === null) {
      return;
    }
    const id = chosen === DEFAULT_DESTINATION ? null : chosen;
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

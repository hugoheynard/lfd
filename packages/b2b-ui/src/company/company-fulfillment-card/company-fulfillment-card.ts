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
} from 'fold-ng';

import {
  destinationOf,
  fulfillmentDestinations,
  namedDestinations,
  noPreference,
  preferenceForDestination,
  preferenceForMethod,
} from '../fulfillment-preference.model';

/**
 * Carte **Préférences d'acheminement** — comment cette société est servie
 * d'habitude : retrait à tel point, ou livraison à telle adresse.
 *
 * C'est un **point de départ** pour ses commandes, pas une contrainte : le
 * panier s'ouvre dessus et se laisse changer. La carte le dit, quel que soit
 * l'écran qui la porte — qui croit poser une règle ici promettrait une
 * exclusivité qui n'existe pas.
 *
 * Présentation pure, comme ses sœurs : tout entre par `input()`, rien n'en sort
 * qu'une intention. Elle ne sait pas **qui** la regarde ; les phrases qui
 * changent selon le camp (« cette société » ou « votre société ») sont des
 * entrées avec un défaut neutre, comme `kbisEmptyHint` sur la carte d'identité.
 */
@Component({
  selector: 'lfd-company-fulfillment-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FoldPageSectionComponent,
    FoldCardComponent,
    FoldCalloutComponent,
    FoldButtonComponent,
    FoldListboxComponent,
  ],
  templateUrl: './company-fulfillment-card.html',
  styleUrl: './company-fulfillment-card.scss',
})
export class CompanyFulfillmentCard {
  /** La préférence enregistrée ; `method: null` = aucune posée. */
  readonly preference = input.required<FulfillmentPreferenceView>();
  /** Les points de retrait de la plateforme (le défaut en tête). */
  readonly pickups = input<readonly PickupAddressView[]>([]);
  /** Les adresses de livraison de cette société (la défaut en tête). */
  readonly deliveries = input<readonly DeliveryAddressView[]>([]);
  /** La livraison est-elle un service ouvert ? Sinon, seul le retrait a un sens. */
  readonly deliveryOffered = input(true);
  /** Peut-on régler la préférence, ou seulement la lire ? */
  readonly canManage = input(true);

  /** Ce que fait la préférence, dit avec les mots de l'écran qui la porte. */
  readonly description = input(
    "Comment cette société est servie d'habitude. C'est le point de départ de ses commandes — il reste modifiable au panier.",
  );
  /** L'état « rien n'est posé », qui n'est pas « retrait ». */
  readonly noPreferenceHint = input(
    "Aucune préférence : l'acheminement se choisit à chaque commande, comme aujourd'hui.",
  );
  /** Le manque d'adresse, formulé pour celui qui peut le combler. */
  readonly noDeliveryHint = input(
    'Aucune adresse de livraison enregistrée. Ajoutez-en une pour pouvoir en choisir une par défaut.',
  );

  readonly preferenceChange = output<FulfillmentPreferenceView>();

  /** La méthode retenue, ou `null` tant que rien n'est posé. */
  protected readonly method = computed<FulfillmentMethod | null>(() => this.preference().method);

  /** Ce que le choix offre : suivre le défaut, puis les destinations nommées. */
  protected readonly options = computed(() =>
    fulfillmentDestinations({
      method: this.method(),
      pickups: this.pickups(),
      deliveries: this.deliveries(),
      defaultLabel: this.method() === 'pickup' ? 'Celui par défaut' : 'Celle par défaut',
    }),
  );

  /** Le libellé du champ suit la méthode — le mot juste, pas un générique. */
  protected readonly destinationLabel = computed(() =>
    this.method() === 'pickup' ? 'Point de retrait préféré' : 'Adresse de livraison préférée',
  );

  protected readonly destinationId = computed(() => destinationOf(this.preference()));

  /** Rien à choisir : la méthode est posée mais aucune destination n'existe. */
  protected readonly noDestination = computed(
    () =>
      this.method() !== null &&
      namedDestinations({
        method: this.method(),
        pickups: this.pickups(),
        deliveries: this.deliveries(),
      }).length === 0,
  );

  protected chooseMethod(method: FulfillmentMethod): void {
    if (this.method() === method) {
      return;
    }
    this.preferenceChange.emit(preferenceForMethod(method));
  }

  protected chooseDestination(chosen: string): void {
    const method = this.method();
    if (method !== null) {
      this.preferenceChange.emit(preferenceForDestination(method, chosen));
    }
  }

  protected clear(): void {
    this.preferenceChange.emit(noPreference());
  }
}

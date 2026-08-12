import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core';
import type { DeliveryAddressView, FulfillmentPreferenceView } from '@lfd/contracts';
import { CompanyFulfillmentCard } from '@lfd/b2b-ui/company';

import { AccountService } from '../../account/account.service';
import type { Company } from '../../account/account.model';
import { AddressesService } from '../addresses.service';
import { PickupAddressesService } from '../pickup-addresses.service';
import { PlatformSettingsService } from '../platform-settings.service';

/**
 * Section **Préférences d'acheminement** d'une entreprise côté **client** —
 * _container_ de la carte partagée `@lfd/b2b-ui/company`.
 *
 * Même carte que la fiche staff, autre récit : là-bas le commercial règle
 * « comment je sers ce client », ici le client dit « comment je veux être
 * servi ». C'est le même réglage vu des deux bouts, et c'est pour ça qu'il n'y a
 * qu'un composant — avec les mots de chaque camp en entrée.
 *
 * Le container ne fait que ce qu'un container fait : rassembler la donnée
 * (adresses de la société, points de retrait, service livraison ouvert ou non),
 * calculer la capacité, et renvoyer l'intention au service.
 */
@Component({
  selector: 'app-acheminement-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CompanyFulfillmentCard],
  templateUrl: './acheminement-section.html',
})
export class AcheminementSection {
  private readonly account = inject(AccountService);
  private readonly addresses = inject(AddressesService);
  private readonly pickupsService = inject(PickupAddressesService);
  private readonly settings = inject(PlatformSettingsService);

  readonly company = input.required<Company>();

  protected readonly pickups = this.pickupsService.addresses;

  protected readonly deliveries = computed<readonly DeliveryAddressView[]>(
    () => this.addresses.view()?.deliveries ?? [],
  );

  /** La livraison est-elle un service ouvert ? Sinon, seul le retrait a un sens. */
  protected readonly deliveryOffered = computed(() => !this.settings.deliveryHidden());

  /** Seul le gestionnaire règle la préférence ; les autres la lisent. */
  protected readonly canManage = computed(() => this.company().role === 'company_admin');

  constructor() {
    // Les adresses vivent dans leur propre service : la carte a besoin d'elles
    // pour proposer une destination, on les demande donc pour cette société.
    effect(() => this.addresses.loadFor(this.company().id));
  }

  protected save(preference: FulfillmentPreferenceView): void {
    this.account.preferFulfillment(this.company().id, preference);
  }
}

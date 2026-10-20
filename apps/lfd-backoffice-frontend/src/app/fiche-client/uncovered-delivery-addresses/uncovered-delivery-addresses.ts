import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  longestMatchingPrefix,
  type DeliveryAddressView,
  type DeliveryZoneView,
} from '@lfd/contracts';
import { FoldButtonComponent, FoldCalloutComponent } from 'fold-ng';

import { PermissionsStore } from '../../auth/permissions.store';
import { DeliveryZonesService } from '../../b2b/reglages/delivery-zones.service';
import { ADD_POSTAL_CODE_PARAM } from '../../b2b/reglages/delivery-zones-section/add-postal-code-param';

/** Le réglage des zones, où le lien « Ajouter un tarif » mène. */
const ZONES_SETTINGS = '/reglages/livraison/zones';

/**
 * **Une adresse de livraison qu'aucune zone ne couvre** — près du carnet
 * d'adresses de la fiche (Hugo, 2026-10-20). Hors zone, le serveur refuse la
 * commande livrée (`NoDeliveryZoneForPostalCodeError`) : le commercial doit le
 * savoir avant le client.
 *
 * Le rapprochement est celui du serveur, {@link longestMatchingPrefix}, sur la
 * liste publique des zones. Les adresses de livraison sont toujours propres au
 * compte, sous-compte compris : l'avertissement vaut pour tous. Si la lecture
 * des zones échoue, on ne sait pas : on ne dit rien plutôt qu'avertir à tort.
 */
@Component({
  selector: 'app-uncovered-delivery-addresses',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FoldCalloutComponent, FoldButtonComponent, RouterLink],
  templateUrl: './uncovered-delivery-addresses.html',
  styleUrl: './uncovered-delivery-addresses.scss',
})
export class UncoveredDeliveryAddresses {
  private readonly zones = inject(DeliveryZonesService);
  private readonly permissions = inject(PermissionsStore);

  readonly deliveries = input.required<readonly DeliveryAddressView[]>();

  private readonly loaded = signal<readonly DeliveryZoneView[] | null>(null);

  /** Le lien mène à un écran sous `delivery_fee:write` : sans lui, un cul-de-sac. */
  protected readonly canAddFee = computed(() => this.permissions.can('delivery_fee:write'));
  protected readonly zonesParam = ZONES_SETTINGS;

  protected readonly uncovered = computed(() => {
    const zones = this.loaded();
    if (zones === null) {
      return [];
    }
    const prefixes = zones.flatMap((zone) => zone.postalPrefixes);
    return this.deliveries().filter(
      (address) =>
        address.codePostal.trim() !== '' &&
        longestMatchingPrefix(prefixes, address.codePostal.trim()) < 0,
    );
  });

  constructor() {
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      this.loaded.set(await this.zones.list());
    } catch {
      this.loaded.set(null);
    }
  }

  protected name(address: DeliveryAddressView): string {
    return address.label.trim() || address.ligne1;
  }

  protected query(address: DeliveryAddressView): Record<string, string> {
    return { [ADD_POSTAL_CODE_PARAM]: address.codePostal.trim() };
  }
}

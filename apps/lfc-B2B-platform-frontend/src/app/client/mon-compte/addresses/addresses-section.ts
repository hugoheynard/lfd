import type {
  BillingAddressView,
  CartAdjustment,
  CompanyMemberRole,
  CompanyView,
  DeliveryAddressView,
} from '@lfd/contracts';

import { formatCents, formatRate } from '../../format-money';
import type { ServicePoints } from '../../shop/pickup-points.store';

/** La partie du carnet qu'un panneau Adresses montre : la facturation, ou les livraisons. */
export type AddressesView = 'billing' | 'delivery';

/**
 * Par où le panneau entre : le détail de sa partie (`null`), ou directement un
 * formulaire — une adresse neuve, ou celle-ci (`addressId`, ignoré pour la
 * facturation, qui est unique).
 */
export type AddressesForm =
  null | { readonly kind: 'new' } | { readonly kind: 'edit'; readonly addressId: string | null };

/** Les rôles qui écrivent le carnet (`ensureCompanyAdmin`, vérifié le 2026-09-14). */
const ADDRESS_WRITE_ROLES: ReadonlySet<CompanyMemberRole> = new Set(['owner', 'admin']);

export function canWriteAddresses(company: CompanyView | null): boolean {
  return company !== null && ADDRESS_WRITE_ROLES.has(company.role);
}

/** Une adresse en une ligne : « 12 chemin des Barmettes, 73150 Val d'Isère ». */
export function postalLine(address: BillingAddressView): string {
  return `${address.ligne1}, ${address.codePostal} ${address.ville}`;
}

/** Une livraison telle qu'elle se lit dans le carnet. */
export interface DeliveryRow {
  readonly id: string;
  readonly label: string;
  readonly primary: boolean;
  readonly line: string;
  readonly zone: string;
  readonly fee: string;
}

/**
 * Les livraisons, avec leur zone et son tarif **calculés** sur le code postal,
 * par le même préfixe que le serveur. Pas de zone = pas de livraison à cette
 * adresse, et on le dit plutôt que d'inventer « zone 1 ».
 */
export function deliveryRows(
  deliveries: readonly DeliveryAddressView[],
  zoneFor: (codePostal: string) => ReturnType<ServicePoints['zoneFor']>,
  noZone: string,
): readonly DeliveryRow[] {
  return deliveries.map((address) => {
    const zone = zoneFor(address.codePostal);
    return {
      id: address.id,
      label: address.label,
      primary: address.isDefault,
      line: postalLine(address),
      zone: zone?.label ?? noZone,
      fee: zone === null ? '—' : feeOf(zone.fee),
    };
  });
}

/** Un frais de zone tel qu'il se lit : « 8,00 € » ou « 3 % ». */
function feeOf(fee: CartAdjustment): string {
  return fee.mode === 'amount' ? formatCents(fee.cents) : formatRate(fee.bp / 100);
}

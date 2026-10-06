import type { AddressPointKind, GpsPoint } from "@lfd/contracts";

/**
 * « Ignorer » une suggestion de correction du carnet (`gps-y-aller-et-position.md`, §6) : elle n'est plus reproposée tant que les livraisons concluent au même point.
 * `staffUserId` : la fiche de la requête, l'auteur tracé.
 */
export class IgnoreAddressPointSuggestionCommand {
  constructor(
    readonly staffUserId: string,
    readonly addressId: string,
    readonly kind: AddressPointKind,
    readonly seen: GpsPoint,
  ) {}
}

import type { AddressPointKind, GpsPoint } from "@lfd/contracts";

/**
 * « Appliquer » une suggestion de correction du carnet (`gps-y-aller-et-position.md`, §6) : le point VU par le bureau devient la porte ou le stationnement de l'adresse.
 * `staffUserId` : la fiche de la requête, l'auteur tracé.
 */
export class ApplyAddressPointSuggestionCommand {
  constructor(
    readonly staffUserId: string,
    readonly addressId: string,
    readonly kind: AddressPointKind,
    readonly seen: GpsPoint,
  ) {}
}

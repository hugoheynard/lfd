import type { AddressPointKind, GpsPoint } from "@lfd/contracts";

/** Ce que le bureau a décidé d'écrire au carnet. */
export interface DeliveryAddressPointCorrection {
  readonly companyId: string;
  readonly addressId: string;
  readonly kind: AddressPointKind;
  readonly point: GpsPoint;
}

/**
 * **« Corrige ce point du carnet »** (`gps-y-aller-et-position.md`, §6) —
 * ce que la livraison DÉCLARE et que le commerce implémente
 * (`b2b/account/application/services/`), relié dans
 * `appBootstrap/delivery-feed.module.ts`.
 *
 * La livraison n'écrit jamais au commerce : elle DEMANDE. C'est le carnet
 * (`DeliveryAddressBook.correctPoint`) qui décide et écrit, et le commerce qui
 * journalise son fait (`company.delivery_address_point_corrected`). Appelé
 * DANS l'unité de travail de l'appelant : la décision de la livraison et
 * l'écriture du carnet partent ensemble, ou rien ne part.
 *
 * Lève le refus du carnet tel quel : adresse introuvable sous ce mur (404),
 * point invalide (400).
 */
export abstract class DeliveryAddressPointCorrector {
  abstract correct(correction: DeliveryAddressPointCorrection): Promise<void>;
}

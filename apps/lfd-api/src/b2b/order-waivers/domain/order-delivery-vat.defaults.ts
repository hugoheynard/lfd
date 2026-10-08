import type { DeliveryVatMode } from "@lfd/contracts";

/**
 * Le mode qui s'applique **sans réglage posé** : le taux normal, ce que toute
 * commande a fait avant le réglage (plan `plan-tva-des-frais-de-port.md`, V2).
 * Une seule définition, lue par le lecteur de la passation et par le journal.
 */
export const DEFAULT_DELIVERY_VAT_MODE: DeliveryVatMode = "standard";

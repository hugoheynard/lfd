import { z } from "zod";

import type { CustomerAudience } from "./customer-audience.js";

/**
 * Contrat de fil du **réglage de livraison** : à quelles clientèles la livraison
 * est proposée. Un réglage global, posé dans « E-commerce LFC → Réglages →
 * Livraison ». Cf. `documentation/b2b/plan-remise-et-livraison-par-clientele.md`, D4.
 */
export interface DeliverySettingsView {
  readonly openToB2b: boolean;
  readonly openToB2c: boolean;
  /** Instant du dernier geste ; `null` tant que personne n'a rien réglé (ouvert aux deux). */
  readonly updatedAt: string | null;
  /** Le nom de qui l'a posé, figé au geste ; `null` tant que personne n'a rien réglé. */
  readonly updatedBy: string | null;
}

/**
 * Ce que la route **publique** sert : les deux clientèles, sans l'instant ni
 * l'auteur. Le nom d'un agent du back-office n'a rien à faire devant un
 * visiteur anonyme ; la vue complète reste celle de l'admin.
 */
export type PublicDeliverySettingsView = Pick<DeliverySettingsView, "openToB2b" | "openToB2c">;

/** Ce que vaut le réglage tant que personne ne l'a posé : l'existant, ouvert aux deux. */
export const DEFAULT_DELIVERY_SETTINGS: DeliverySettingsView = {
  openToB2b: true,
  openToB2c: true,
  updatedAt: null,
  updatedBy: null,
};

/** Un patch : seules les clés présentes changent, et il en faut au moins une. */
export const deliverySettingsPatchSchema = z
  .object({
    openToB2b: z.boolean().optional(),
    openToB2c: z.boolean().optional(),
  })
  .refine((patch) => patch.openToB2b !== undefined || patch.openToB2c !== undefined, {
    message: "au moins une clientèle à changer : openToB2b ou openToB2c",
  });
export type DeliverySettingsPatch = z.infer<typeof deliverySettingsPatchSchema>;

/** La livraison est-elle proposée à cette clientèle ? */
export function deliveryOpenTo(
  settings: Pick<DeliverySettingsView, "openToB2b" | "openToB2c">,
  audience: CustomerAudience,
): boolean {
  return audience === "b2b" ? settings.openToB2b : settings.openToB2c;
}

/**
 * Le code du refus quand la livraison est fermée à la clientèle (409). Partagé :
 * la boutique le reconnaît pour montrer le refus au lieu de garder un ancien
 * décompte.
 */
export const DELIVERY_CLOSED_FOR_AUDIENCE = "orders.delivery.closed_for_audience";

import { z } from "zod";

/**
 * **Les réglages du colisage** — Réglages › Colisage (Hugo, 2026-10-25 :
 * « partager une moitié devrait être un réglage dans réglages/colisage, on
 * devrait commencer avec ça désactivé »).
 *
 * `halfSharing` — le geste « Partager une moitié » du poste : glisser une
 * commande dans la moitié libre d'un bac déjà déclaré pour un arrêt voisin.
 * Désactivé, le poste ne montre plus le bouton ET le serveur refuse le geste ;
 * les bacs déjà partagés restent lisibles tels quels.
 *
 * `showMadeToOrder` — la pastille « Sur mesure » sur les lignes de l'écran du
 * colisage (plan sur mesure, M4 — Hugo, 2026-10-30), affichée par défaut. Le
 * serveur sert le marqueur de toute façon ; c'est l'écran qui le tait.
 * Facultatif à l'envoi : absent, le réglage en vigueur reste.
 *
 * `pickupTrackingLevel` — le niveau de suivi du colisage d'un retrait (plan
 * des niveaux de suivi du colisage, D2 — Hugo, 2026-11-18) : `simple` (« Tout
 * est prêt » ou « Problème ») par défaut, ou `detailed` (contenants et
 * répartition). Figé sur chaque fiche à sa naissance ; une livraison et un
 * réassort restent détaillés. Réglé sur la page Réglages › Niveau de suivi.
 * Facultatif à l'envoi : absent, le niveau en vigueur reste.
 *
 * Routes :
 * - `GET admin/packing/settings` → {@link PackingSettingsView}, sous
 *   `delivery_settings:read` OU `production_packing:read` (le poste doit
 *   savoir s'il montre le bouton, sans recevoir les réglages) ;
 * - `PUT admin/packing/settings` ← {@link PackingSettingsPayload}, sous
 *   `delivery_settings:write` → 204.
 */
export const PACKING_TRACKING_LEVELS = ["simple", "detailed"] as const;
export type PackingTrackingLevel = (typeof PACKING_TRACKING_LEVELS)[number];

export const packingSettingsPayloadSchema = z.object({
  halfSharing: z.boolean(),
  showMadeToOrder: z.boolean().optional(),
  pickupTrackingLevel: z.enum(PACKING_TRACKING_LEVELS).optional(),
});
export type PackingSettingsPayload = z.infer<typeof packingSettingsPayloadSchema>;

/** Personne n'a rien réglé : le partage d'une moitié est fermé (Hugo, 2026-10-25). */
export const DEFAULT_PACKING_HALF_SHARING = false;

/** Personne n'a rien réglé : la pastille « Sur mesure » est affichée (Hugo, 2026-10-30). */
export const DEFAULT_PACKING_SHOW_MADE_TO_ORDER = true;

/** Personne n'a rien réglé : un retrait se colise en simple (Hugo, 2026-11-18). */
export const DEFAULT_PACKING_PICKUP_TRACKING_LEVEL: PackingTrackingLevel = "simple";

/** Les réglages du colisage tels qu'ils valent ; `default` : personne ne les a encore posés. */
export interface PackingSettingsView {
  readonly halfSharing: boolean;
  readonly showMadeToOrder: boolean;
  readonly pickupTrackingLevel: PackingTrackingLevel;
  readonly source: "default" | "explicit";
}

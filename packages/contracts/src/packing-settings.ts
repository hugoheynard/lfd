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
 * Routes :
 * - `GET admin/packing/settings` → {@link PackingSettingsView}, sous
 *   `delivery_settings:read` OU `production_packing:read` (le poste doit
 *   savoir s'il montre le bouton, sans recevoir les réglages) ;
 * - `PUT admin/packing/settings` ← {@link PackingSettingsPayload}, sous
 *   `delivery_settings:write` → 204.
 */
export const packingSettingsPayloadSchema = z.object({ halfSharing: z.boolean() });
export type PackingSettingsPayload = z.infer<typeof packingSettingsPayloadSchema>;

/** Personne n'a rien réglé : le partage d'une moitié est fermé (Hugo, 2026-10-25). */
export const DEFAULT_PACKING_HALF_SHARING = false;

/** Les réglages du colisage tels qu'ils valent ; `default` : personne ne les a encore posés. */
export interface PackingSettingsView {
  readonly halfSharing: boolean;
  readonly source: "default" | "explicit";
}

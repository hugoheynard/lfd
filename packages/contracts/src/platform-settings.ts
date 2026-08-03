import { z } from "zod";

/**
 * Contrat de fil des **réglages plateforme B2B** — la configuration **globale**
 * qui pilote les pièces d'activation d'un compte client. Cf.
 * `documentation/architecture-activation-configuration-b2b.md`.
 */

/**
 * Mode d'une **pièce d'activation** (aligné sur l'enum Prisma `PieceMode`) :
 * - `hidden` — la pièce n'existe pas encore (ex. livraison sans service) : masquée
 *   client + admin, jamais exigée ;
 * - `optional` — visible, mais ne **gate** pas l'activation ;
 * - `required` — exigée pour activer le compte.
 */
export const pieceModeSchema = z.enum(["hidden", "optional", "required"]);
export type PieceMode = z.infer<typeof pieceModeSchema>;

/** Les pièces d'activation configurables. `paymentTerm` a toujours une valeur → pas ici. */
export const activationPieceSchema = z.enum(["tva", "kbis", "billing", "delivery"]);
export type ActivationPiece = z.infer<typeof activationPieceSchema>;

/**
 * Réglages plateforme : le **mode par pièce**. Sert de **vue** (GET) **et** de
 * **charge** (PATCH) — même forme, la config est un simple dictionnaire mode/pièce.
 */
export const platformSettingsSchema = z.object({
  tva: pieceModeSchema,
  kbis: pieceModeSchema,
  billing: pieceModeSchema,
  delivery: pieceModeSchema,
});
export type PlatformSettings = z.infer<typeof platformSettingsSchema>;

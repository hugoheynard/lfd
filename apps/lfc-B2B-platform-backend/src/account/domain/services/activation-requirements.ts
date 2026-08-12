import type { ActivationPiece, PlatformSettings } from "@lfd/contracts";

import type { AdminCompanyDetailView } from "../ports/admin-company.reader.js";

/**
 * Les pièces **requises mais manquantes** d'une société, selon la config
 * plateforme. Une pièce bloque l'activation seulement si son mode est `required`
 * **et** qu'elle est absente **et** qu'elle est *applicable* (la TVA n'est requise
 * que pour une forme juridique assujettie). Pure : (état société, config) → liste.
 */
export function missingRequiredPieces(
  company: AdminCompanyDetailView,
  settings: PlatformSettings,
): ActivationPiece[] {
  const present: Record<ActivationPiece, boolean> = {
    // Non assujetti ⇒ la TVA n'est jamais « manquante » (rien à exiger).
    tva: !company.vatNumberRequired || company.tvaIntracom.trim() !== "",
    // **Certifié**, et non « déposé ». Le KBIS n'est pas une case à cocher :
    // c'est la pièce sur laquelle repose l'exactitude de tout le reste (raison
    // sociale, forme juridique, SIRET). Se contenter de sa présence reviendrait
    // à activer sur la foi d'un PDF que personne n'a ouvert — n'importe quel
    // fichier vaudrait alors garantie.
    kbis: company.kbis?.certified === true,
    billing: company.addresses.billing !== null,
    delivery: company.addresses.deliveries.length > 0,
  };
  const pieces: ActivationPiece[] = ["tva", "kbis", "billing", "delivery"];
  return pieces.filter((piece) => settings[piece] === "required" && !present[piece]);
}

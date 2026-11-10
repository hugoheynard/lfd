import { legalDocumentKeys, legalDocumentKeySchema, type LegalDocumentKey } from "@lfd/contracts";
import type { PipeTransform } from "@nestjs/common";

import { UnknownLegalMentionError } from "../domain/errors/legal-document-errors.js";

/**
 * Valide le segment `:mention` contre le **vocabulaire fermé** du contrat —
 * les six mentions et les CGV professionnelles (`legalDocumentKeys`, plan
 * `legal/plan-cgv-par-audience.md`, C1).
 *
 * 🔴 C'est la garde du bord, et elle n'est pas décorative : sans elle, une clé
 * libre ouvrirait un bloc de contenu que le pied de page ne peut pas cocher,
 * qu'aucune surface n'affiche, et que personne ne saurait retrouver — une ligne
 * orpheline de plus à chaque faute de frappe.
 *
 * ⚠️ Le refus est un **404**, pas un 400 : le segment désigne une ressource, et
 * celle qu'on demande n'existe pas. Un 400 ferait chercher une erreur de
 * saisie dans un corps de requête qui, ici, est parfaitement valide.
 *
 * Un pipe dédié plutôt que `ZodQuery`, pour la même raison que `ZodQuery`
 * existe à côté de `ZodBody` : le statut et le message diffèrent, et c'est tout
 * ce qui compte pour qui lit le refus.
 */
export class LegalMentionParam implements PipeTransform<string, LegalDocumentKey> {
  transform(value: string): LegalDocumentKey {
    const parsed = legalDocumentKeySchema.safeParse(value);
    if (!parsed.success) {
      throw new UnknownLegalMentionError(value, legalDocumentKeys);
    }
    return parsed.data;
  }
}

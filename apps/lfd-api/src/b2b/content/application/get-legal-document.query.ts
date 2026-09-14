import type { LegalMention } from "@lfd/contracts";

/**
 * Query : lire le document d'une mention légale.
 *
 * La mention est le SEUL paramètre, et elle vient du vocabulaire fermé validé
 * au bord : une clé libre ouvrirait un bloc de contenu que rien n'affiche.
 */
export class GetLegalDocumentQuery {
  constructor(readonly mention: LegalMention) {}
}

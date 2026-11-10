import type { LegalDocumentKey } from "@lfd/contracts";

/**
 * Query : lire le document PUBLIÉ d'une mention — son texte et, pour les CGV,
 * le PDF en vigueur. C'est la lecture de la boutique ; l'écran d'édition lit
 * {@link GetLegalDocumentQuery}, qui n'annonce pas de PDF.
 */
export class GetPublishedLegalDocumentQuery {
  constructor(readonly mention: LegalDocumentKey) {}
}

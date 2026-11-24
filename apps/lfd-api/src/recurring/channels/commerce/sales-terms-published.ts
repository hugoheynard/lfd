import type { DurableEvent, DurableFact } from "../../../platform/outbox/durable-event.js";
import { TechnicalError } from "../../../platform/shared/errors/app-error.js";

/** Nom stable du fait, clé de routage vers `@DurableHandler`. */
export const CONTENT_SALES_TERMS_PUBLISHED = "content.sales_terms_published";

/**
 * **Une nouvelle version des CGV est publiée** — émis par le contenu du
 * commerce au dépôt du PDF d'un texte de CGV, dans la transaction du dépôt
 * (décidé par Hugo le 2026-11-25, Q-B7 : l'acte qui publie est le dépôt du
 * PDF ; plan `plan-bloc-recurrent.md`, § 7).
 *
 * 🔴 Il vit dans le canal des paniers récurrents, et non chez le contenu :
 * `recurring → lafoliecoffee` est interdit, `lafoliecoffee → recurring/channels/`
 * est admis. Le bloc déclare le fait qu'il écoute ; le commerce l'émet dans
 * ses mots (`content.*`), sans savoir qui l'écoute.
 *
 * La version annoncée est celle que porte le PDF déposé : la révision du
 * texte au moment du dépôt, et ce fichier. La clé est le fichier — un dépôt,
 * un fait.
 */
export class SalesTermsPublishedFact implements DurableEvent {
  constructor(
    /** Le texte (`salesTerms`, `salesTermsPro`) — la clé que le panier a acceptée. */
    readonly document: string,
    readonly revision: number,
    readonly fileId: string,
    /** La clé du PDF au stockage des documents client : l'e-mail le joint par référence. */
    readonly storageKey: string,
    /** Le nom remis au client (`cgv-professionnels-2026-12-01.pdf`). */
    readonly fileName: string,
  ) {}

  durableFact(): DurableFact {
    return {
      type: CONTENT_SALES_TERMS_PUBLISHED,
      key: `${CONTENT_SALES_TERMS_PUBLISHED}:${this.fileId}`,
      payload: {
        document: this.document,
        revision: this.revision,
        fileId: this.fileId,
        storageKey: this.storageKey,
        fileName: this.fileName,
      },
    };
  }

  /**
   * Relit le contrat côté abonné.
   *
   * @throws {SalesTermsPublishedPayloadError} la charge est hors forme.
   */
  static fromPayload(payload: Readonly<Record<string, unknown>>): SalesTermsPublishedFact {
    const { document, revision, fileId, storageKey, fileName } = payload;
    if (
      !isText(document) ||
      typeof revision !== "number" ||
      !Number.isInteger(revision) ||
      revision < 1 ||
      !isText(fileId) ||
      !isText(storageKey) ||
      !isText(fileName)
    ) {
      throw new SalesTermsPublishedPayloadError();
    }
    return new SalesTermsPublishedFact(document, revision, fileId, storageKey, fileName);
  }
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/** Un fait de publication des CGV illisible : aucun panier n'a été prévenu. */
export class SalesTermsPublishedPayloadError extends TechnicalError {
  constructor() {
    super(
      "recurring.sales_terms_published.payload_invalid",
      `Un fait « ${CONTENT_SALES_TERMS_PUBLISHED} » est illisible : aucun panier récurrent n'a ` +
        "noté la nouvelle version des CGV, et aucun e-mail n'est parti. Le PDF déposé, lui, est " +
        "bien en vigueur. Le message reste dans la boîte d'envoi ; corriger l'émetteur puis le " +
        "rejouer depuis la carte de santé.",
    );
  }
}

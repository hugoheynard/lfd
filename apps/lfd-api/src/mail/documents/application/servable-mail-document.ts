import { validateMailDocumentForPublication } from "@lfd/mail-blocks";

import type { PublishedMailDocumentEntry } from "../../templates/effective-copy/published-mail-documents.js";
import { mailBlockDeclarationOf } from "../../templates/sections/mail-block-declarations.js";
import { isMailKey } from "../../templates/specimens/mail-specimens.js";
import { parseMailDocument } from "./mail-document-shape.js";

/** Un document publié tel qu'il est rangé : sa colonne `jsonb` n'est pas encore relue. */
export interface StoredPublishedMailDocument {
  readonly template: string;
  readonly version: number;
  readonly document: unknown;
}

/**
 * **Ce que l'envoi peut faire d'un document publié** (plan
 * `plan-editeur-par-blocs.md`, § 11) : le servir s'il a encore la forme d'un
 * document ET tient contre les blocs que CE code déclare — un bloc du modèle
 * retiré du code, une langue ajoutée sans son texte le rendent illisible, et
 * l'e-mail part dans l'ordre du code. `null` : l'e-mail n'est plus au
 * registre, rien ne le demandera.
 */
export function servableMailDocument(
  stored: StoredPublishedMailDocument,
): PublishedMailDocumentEntry | null {
  if (!isMailKey(stored.template)) {
    return null;
  }
  const document = parseMailDocument(stored.document);
  if (document === null) {
    return {
      kind: "unreadable",
      version: stored.version,
      reason: "la colonne rangée n'a pas la forme d'un document",
    };
  }
  const violations = validateMailDocumentForPublication(
    document,
    mailBlockDeclarationOf(stored.template),
    stored.template,
  );
  return violations.length === 0
    ? { kind: "servable", document, version: stored.version }
    : {
        kind: "unreadable",
        version: stored.version,
        reason: violations.map((violation) => violation.code).join(", "),
      };
}

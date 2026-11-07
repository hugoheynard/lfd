import { imageBlocksOf, type ImageBlock, type MailDocument } from "@lfd/mail-blocks";

import { DomainError } from "../../../platform/shared/errors/app-error.js";
import {
  MailDocumentImageRefusedError,
  MailDocumentImageUnavailableError,
  type MailDocumentImageRef,
} from "../domain/mail-document-errors.js";
import type { MailDocumentImages } from "../domain/ports/mail-document-images.js";

function refOf(image: ImageBlock, index: number): MailDocumentImageRef {
  const label = image.decorative === true ? null : (image.alt.fr?.trim() ?? "");
  return { blockId: image.id, rank: index + 1, label: label === "" ? null : label };
}

function attributed(template: string, image: MailDocumentImageRef, cause: unknown): unknown {
  if (cause instanceof DomainError) {
    return new MailDocumentImageRefusedError(template, image, cause);
  }
  return cause instanceof Error
    ? new MailDocumentImageUnavailableError(template, image, cause)
    : cause;
}

/**
 * **Copie les images d'un document** avant sa publication (plan
 * `plan-editeur-par-blocs.md`, § 19, S5d), une à une, dans l'ordre de
 * l'e-mail, chaque adresse une seule fois. Rend la table adresse d'origine →
 * adresse de la copie que `MailTemplateDocument.publish` applique.
 *
 * Réseau : à appeler HORS de toute transaction. Le premier refus arrête tout
 * et désigne l'image en cause ; les copies déjà faites restent rangées — une
 * copie adressée par son contenu ne coûte rien à refaire, et n'est lue par
 * aucun e-mail tant que rien n'est publié.
 *
 * @throws {MailDocumentImageRefusedError} l'image elle-même est refusée.
 * @throws {MailDocumentImageUnavailableError} téléchargement ou stockage en panne.
 */
export async function copyDocumentImages(
  template: string,
  document: MailDocument,
  images: MailDocumentImages,
): Promise<ReadonlyMap<string, string>> {
  const copies = new Map<string, string>();
  const blocks = imageBlocksOf(document);
  for (const [index, image] of blocks.entries()) {
    if (copies.has(image.src)) {
      continue;
    }
    try {
      copies.set(image.src, await images.copy(image.src));
    } catch (cause) {
      throw attributed(template, refOf(image, index), cause);
    }
  }
  return copies;
}

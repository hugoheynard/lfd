import {
  imageBlocksOf,
  imageCopyKey,
  imageShapingOf,
  type ImageBlock,
  type MailDocument,
} from "@lfd/mail-blocks";

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
 * l'e-mail, chaque adresse une seule fois PAR CADRAGE ET LARGEUR (format et
 * point focal, § 19 ; pleine largeur ou non, 2026-11-08 : deux formats de la
 * même image, ou deux largeurs, font deux copies). Rend la table clé
 * de copie (`imageCopyKey`) → adresse de la copie que
 * `MailTemplateDocument.publish` applique. `alreadyCopied` : les copies de
 * la version publiée — même source et même cadrage, rien n'est recopié.
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
  alreadyCopied: ReadonlyMap<string, string> = new Map(),
): Promise<ReadonlyMap<string, string>> {
  const copies = new Map<string, string>(alreadyCopied);
  const blocks = imageBlocksOf(document);
  for (const [index, image] of blocks.entries()) {
    const key = imageCopyKey(image);
    if (copies.has(key)) {
      continue;
    }
    try {
      copies.set(key, await images.copy(image.src, imageShapingOf(image)));
    } catch (cause) {
      throw attributed(template, refOf(image, index), cause);
    }
  }
  return copies;
}

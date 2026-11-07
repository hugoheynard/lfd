import { imageCopyKey } from "./image-framing.js";
import type { FreeBlock, ImageBlock, MailBlock, MailDocument } from "./mail-document.js";

/** Les images d'un document, hors colonnes et dans les colonnes, dans l'ordre. */
export function imageBlocksOf(document: MailDocument): readonly ImageBlock[] {
  return document.blocks.flatMap((block): readonly ImageBlock[] => {
    if (block.kind === "image") {
      return [block];
    }
    return block.kind === "columns"
      ? block.cells.flat().filter((cell): cell is ImageBlock => cell.kind === "image")
      : [];
  });
}

function rewriteFree(block: FreeBlock, sources: ReadonlyMap<string, string>): FreeBlock {
  if (block.kind !== "image") {
    return block;
  }
  const copy = sources.get(imageCopyKey(block));
  return copy === undefined ? block : { ...block, copySrc: copy };
}

/** Les copies d'un document publié : clé de copie → adresse de la copie. */
export function imageCopiesOf(document: MailDocument): ReadonlyMap<string, string> {
  return new Map(
    imageBlocksOf(document).flatMap((image): readonly (readonly [string, string])[] =>
      image.copySrc === undefined ? [] : [[imageCopyKey(image), image.copySrc]],
    ),
  );
}

function rewrite(block: MailBlock, sources: ReadonlyMap<string, string>): MailBlock {
  if (block.kind === "model") {
    return block;
  }
  if (block.kind === "columns") {
    return { ...block, cells: block.cells.map((cell) => cell.map((b) => rewriteFree(b, sources))) };
  }
  return rewriteFree(block, sources);
}

/**
 * Le document où chaque image dont la clé de copie (`imageCopyKey` : adresse,
 * et cadrage s'il y en a un) est dans `sources` reçoit en `copySrc` l'adresse
 * qui lui correspond — `src` garde la source — à la publication, l'adresse de sa copie
 * (plan `plan-editeur-par-blocs.md`, § 19). Les autres blocs ne bougent pas.
 */
export function withImageSources(
  document: MailDocument,
  sources: ReadonlyMap<string, string>,
): MailDocument {
  return { ...document, blocks: document.blocks.map((block) => rewrite(block, sources)) };
}

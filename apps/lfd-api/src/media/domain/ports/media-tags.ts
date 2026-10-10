import type { WriteTicket } from "../../../platform/journal/scoped-journal.js";
import type { TagCount, TaggedImage } from "../value-objects/tag-vocabulary.js";

/**
 * La LECTURE du vocabulaire — les mots-clés de tout le fonds.
 *
 * Un port à part de {@link MediaLibraryReader} (ISP) : la page et la fiche
 * d'une image n'ont rien à faire du vocabulaire, et les gestes sur un mot
 * n'ont rien à faire d'une page.
 */
export abstract class MediaTagReader {
  /** Chaque mot du fonds et son nombre d'images, du plus porté au moins porté. */
  abstract vocabulary(): Promise<readonly TagCount[]>;

  /** Les images qui portent ce mot exact — toutes, pas une page. */
  abstract imagesTagged(tag: string): Promise<readonly TaggedImage[]>;
}

/**
 * L'ÉCRITURE des mots-clés d'un lot d'images, en un geste.
 *
 * 🔴 Exige un `WriteTicket` : un renommage sur tout le fonds sans fait au
 * journal ne compile pas, comme toute écriture de ce bloc.
 */
export abstract class MediaTagWriter {
  /** Remplace la liste de mots-clés de chaque image citée — et seulement elle. */
  abstract retag(images: readonly TaggedImage[], ticket: WriteTicket): Promise<void>;
}

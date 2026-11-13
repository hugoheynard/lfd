import type { PackedContent } from "./content-compression.js";

/** Où un contenu de journée est rangé : l'écran, la journée, l'étiquette. */
export interface DayContentAddress {
  readonly screen: string;
  /** La journée de service, `AAAA-MM-JJ`. */
  readonly day: string;
  /** Les numéros en clair (`dayContentTagOf`). */
  readonly tag: string;
}

/**
 * **Le cache partagé des contenus des écrans de journée**
 * (`documentation/caching-usage/le-cache-du-back-office.md`, § 3.1) — une
 * charge par (écran, journée), servie à étiquette ÉGALE. Implémenté par
 * l'objet `DayVersions` du conteneur, ou absent.
 *
 * L'objet ne garde une charge que si son étiquette domine celle qu'il a
 * déjà : un rangement ignoré n'est pas une panne.
 *
 * Peut lever : c'est {@link DayContents} qui traduit une panne en « lis la base ».
 */
export abstract class DayContentsCache {
  /** Les octets rangés sous cette étiquette, `null` s'il n'y en a pas. */
  abstract read(address: DayContentAddress): Promise<Uint8Array | null>;

  /** Propose cette charge ; l'objet la garde si son étiquette domine. */
  abstract store(address: DayContentAddress, content: PackedContent): Promise<void>;
}

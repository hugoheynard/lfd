import type { PackedContent } from "./content-compression.js";

/**
 * **Le cache partagé des contenus versionnés** — une charge rangée sous une
 * clé opaque et le numéro qu'elle reflète
 * (`documentation/caching-usage/le-cache-du-back-office.md`, § 3).
 * Implémenté par l'objet `DayVersions` du conteneur, ou absent.
 *
 * `platform` ne sait pas ce que la charge contient : la clé est opaque, le
 * corps des octets (le JSON compressé par {@link VersionedContents}). La
 * révision du code est dans la clé, posée par l'adaptateur. Un numéro se
 * compare par ÉGALITÉ : une charge d'un autre numéro est un raté.
 *
 * Peut lever : c'est {@link VersionedContents} qui traduit une panne en
 * « lis la base ».
 */
export abstract class VersionedContentCache {
  /** Les octets rangés pour ce numéro, `null` s'il n'y en a pas. */
  abstract read(key: string, version: number): Promise<Uint8Array | null>;

  /** Range cette charge pour ce numéro ; elle remplace celle gardée sous la clé. */
  abstract store(key: string, version: number, content: PackedContent): Promise<void>;
}

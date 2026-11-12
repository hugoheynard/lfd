/**
 * **Le cache partagé des contenus versionnés** — une charge JSON rangée sous
 * une clé opaque et le numéro qu'elle reflète
 * (`documentation/caching-usage/plan-catalogue-du-back-office.md`, § 3.5).
 * Implémenté par l'objet `DayVersions` du conteneur, ou absent.
 *
 * `platform` ne sait pas ce que la charge contient : la clé est opaque, le
 * corps une chaîne JSON. La révision du code est dans la clé, posée par
 * l'adaptateur. Un numéro se compare par ÉGALITÉ : une charge d'un autre
 * numéro est un raté.
 *
 * Peut lever : c'est {@link VersionedContents} qui traduit une panne en
 * « lis la base ».
 */
export abstract class VersionedContentCache {
  /** Le corps JSON rangé pour ce numéro, `null` s'il n'y en a pas. */
  abstract read(key: string, version: number): Promise<string | null>;

  /** Range ce corps pour ce numéro ; il remplace la charge gardée sous la clé. */
  abstract store(key: string, version: number, body: string): Promise<void>;
}

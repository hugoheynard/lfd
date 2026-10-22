import type { CollectionTest } from "../entities/collection-test.js";

/**
 * Port d'ÉCRITURE du prélèvement d'essai : il prend et rend l'agrégat. Le
 * fichier s'écrit à la création et jamais ensuite ; un `save` ultérieur ne
 * pose que le retour de la banque et le remboursement.
 */
export abstract class CollectionTestRepository {
  abstract load(id: string): Promise<CollectionTest | null>;
  /** Les essais que ces `EndToEndId` désignent — absents de la carte s'ils n'existent pas. */
  abstract byEndToEndIds(
    endToEndIds: readonly string[],
  ): Promise<ReadonlyMap<string, CollectionTest>>;
  abstract save(test: CollectionTest): Promise<void>;
}

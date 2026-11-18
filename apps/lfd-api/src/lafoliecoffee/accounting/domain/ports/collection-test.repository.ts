import type { CollectionTest } from "../entities/collection-test.js";

/**
 * Port d'ÉCRITURE du suivi d'un prélèvement d'essai : il prend et rend
 * l'agrégat d'UNE ligne. L'essai naît avec son envoi
 * (`CollectionTestFileRepository`) ; un `save` ici ne pose que le retour de
 * la banque et le remboursement.
 */
export abstract class CollectionTestRepository {
  abstract load(id: string): Promise<CollectionTest | null>;
  /** Les essais que ces `EndToEndId` désignent — absents de la carte s'ils n'existent pas. */
  abstract byEndToEndIds(
    endToEndIds: readonly string[],
  ): Promise<ReadonlyMap<string, CollectionTest>>;
  abstract save(test: CollectionTest): Promise<void>;
}

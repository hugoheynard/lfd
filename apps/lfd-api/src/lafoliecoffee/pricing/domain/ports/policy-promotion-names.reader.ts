/**
 * **Le nom interne des promotions qu'une politique « Au choix » nomme**
 * (`documentation/promotions/plan-la-mercuriale-decide.md`, § 8).
 *
 * Deux usages, une lecture : refuser un identifiant inconnu (une absence de
 * la carte), et écrire au journal une liste NOMMÉE plutôt que des ULID. Les
 * archivées comprises — elles restent dans une liste, sans effet.
 */
export abstract class PolicyPromotionNamesReader {
  abstract namesOf(promotionIds: readonly string[]): Promise<ReadonlyMap<string, string>>;
}

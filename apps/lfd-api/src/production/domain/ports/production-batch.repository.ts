import type { PackedMark, ProductionBatchSnapshot } from "../entities/production-day.js";
import type { ServiceDay } from "../value-objects/service-day.value-object.js";

/** Une fournée telle que la base la porte sous un `id` — avec SA journée. */
export interface RecordedBatch {
  readonly serviceDay: string;
  readonly batch: ProductionBatchSnapshot;
}

/**
 * **Le port d'écriture des fournées** (plan `plan-fournees-progressives.md`,
 * D1, D3).
 *
 * Un port à part de `ProductionDayRepository` (ISP) : déclarer une fournée ne
 * réécrit pas la journée, et le colisage ne déclare rien.
 *
 * ⚠️ Des écritures CIBLÉES, et c'est le cas que le §3.1 autorise : un `save`
 * réécrit la journée entière, et six postes déclarent en même temps. Les refus
 * restent dans l'agrégat (`batchToRecord`, `batchToCancel`) ; ce port n'écrit
 * que ce qu'il a laissé passer. Aucune colonne dérivée n'est écrite : la somme
 * des fournées est la seule vérité, donc deux déclarations simultanées ne
 * peuvent rien s'écraser.
 */
export abstract class ProductionBatchRepository {
  /**
   * Écrit la fournée si son `id` est libre (`ON CONFLICT DO NOTHING`), puis
   * rend **ce que la base porte sous cet `id`** — celle-ci, ou celle d'un
   * premier appel. C'est l'appelant qui compare les charges (D3) : deux
   * requêtes identiques simultanées ne font donc jamais de 500.
   */
  abstract record(day: ServiceDay, batch: ProductionBatchSnapshot): Promise<RecordedBatch>;

  /**
   * Annule une fournée, **conditionné en base** (`cancelled_at IS NULL`) : la
   * première annulation est la seule tracée. Rien n'est jamais supprimé.
   */
  abstract cancel(day: ServiceDay, id: string, mark: PackedMark): Promise<void>;
}

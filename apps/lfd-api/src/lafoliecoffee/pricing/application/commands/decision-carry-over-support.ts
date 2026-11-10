import type { DecisionCarry } from "../../domain/entities/decision-carry-over.js";
import { NotDetachedFromError } from "../../domain/pricing-errors.js";
import { SaleReferenceLineageReader } from "../../domain/ports/sale-reference-lineage.reader.js";

/**
 * **La garde de tout report** (`plan-report-apres-detachement.md`, § 3) : la
 * nouvelle référence est née de l'ancienne au catalogue du commerce. Sans
 * elle, « reporter » poserait une décision sur n'importe quel article sans
 * aucun des contrôles d'une saisie.
 *
 * @throws {NotDetachedFromError}
 */
export async function assertDetachedFrom(
  lineage: SaleReferenceLineageReader,
  carry: DecisionCarry,
): Promise<void> {
  const origin = await lineage.detachedFromOf(carry.toSku);
  if (origin !== carry.fromSku) {
    throw new NotDetachedFromError(carry.toSku, carry.fromSku, origin);
  }
}

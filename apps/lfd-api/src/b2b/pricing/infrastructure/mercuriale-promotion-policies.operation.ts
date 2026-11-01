import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { IdGenerator } from "../../../platform/id/id-generator.js";
import { boundedSample, inBatches } from "../../../platform/post-deploy/batches.js";
import {
  PostDeployOperation,
  REPORT_SAMPLE_LIMIT,
  type OperationReport,
  type PostDeployApplication,
} from "../../../platform/post-deploy/post-deploy-operation.js";
import { Clock } from "../../../platform/time/clock.js";
import {
  describePolicyBackfill,
  type PolicyBackfillDecision,
} from "../domain/services/promotion-policy-backfill.js";
import { PrismaPromotionPolicyBackfill } from "./prisma-promotion-policy-backfill.js";

/** La clé stable de l'opération. */
export const MERCURIALE_POLICIES_OPERATION_KEY = "mercuriale-promotion-policies";

/**
 * **Les politiques de promotions des mercuriales**, comme opération après
 * déploiement (`documentation/ops/plan-operations-apres-deploiement.md`) —
 * la reprise de `plan-la-mercuriale-decide.md`, § 8, enveloppée. Le script
 * `prisma/backfill-mercuriale-promotion-policies.ts` reste pour la base locale.
 *
 * « À faire » = une décision `set` reste (§ 7.2) ; une mercuriale qu'aucune
 * promotion cochée ne vise (`none`) est listée « à trancher à la main ».
 */
@Injectable()
export class MercurialePromotionPoliciesOperation extends PostDeployOperation {
  readonly key = MERCURIALE_POLICIES_OPERATION_KEY;
  readonly title = "Politiques de promotions des mercuriales";
  readonly why =
    "Depuis la migration « la mercuriale décide », une promotion cochée « aussi pour les tarifs négociés » " +
    "ne passe plus sur un tarif négocié sans que sa mercuriale la choisisse. Tant que cette reprise n'a pas " +
    "tourné, ces clients ont perdu ces promotions sans que personne l'ait décidé.";
  readonly limit =
    "Chaque mercuriale ou brouillon encore à « Aucune » reçoit « Au choix » avec ces promotions. " +
    "Sans retour arrière automatique : on revient en arrière mercuriale par mercuriale, par un avenant. " +
    "Sauvegarde de la base avant.";
  readonly after: readonly string[] = [];

  private readonly backfill: PrismaPromotionPolicyBackfill;

  constructor(prisma: PrismaService, ids: IdGenerator, clock: Clock) {
    super();
    this.backfill = new PrismaPromotionPolicyBackfill(prisma, ids, clock);
  }

  async simulate(): Promise<OperationReport> {
    const decisions = await this.backfill.plan();
    const writable = decisions.filter((decision) => decision.outcome === "set");
    return report(decisions, writable.length, writable.map(describePolicyBackfill));
  }

  async apply(run: PostDeployApplication): Promise<OperationReport> {
    const decisions = await this.backfill.plan();
    const writable = decisions.filter((decision) => decision.outcome === "set");
    const lines: string[] = [];
    let written = 0;
    let current = report(decisions, 0, []);
    for (const batch of inBatches(writable)) {
      for (const decision of batch) {
        const done = await this.backfill.apply(decision, run.actor);
        written += done ? 1 : 0;
        lines.push(
          `${describePolicyBackfill(decision)}${done ? "" : " — a changé entre-temps, non écrite"}`,
        );
      }
      current = report(decisions, written, lines);
      await run.progress(current);
    }
    return current;
  }
}

/** Les comptes, puis l'échantillon : les écrites (ou à écrire), puis celles à trancher. */
function report(
  decisions: readonly PolicyBackfillDecision[],
  writable: number,
  lines: readonly string[],
): OperationReport {
  const count = (outcome: PolicyBackfillDecision["outcome"]): number =>
    decisions.filter((decision) => decision.outcome === outcome).length;
  const byHand = decisions.filter((decision) => decision.outcome === "none");
  return {
    writable,
    byHand: byHand.length,
    summary: [
      `${String(count("set"))} mercuriale(s) ou brouillon(s) à régler « Au choix ».`,
      `${String(byHand.length)} qu'aucune promotion cochée ne vise : restent « Aucune », à trancher à la main.`,
      `${String(count("decided"))} déjà réglée(s), inchangée(s).`,
    ],
    sample: boundedSample(
      [...lines, ...byHand.map((decision) => `À trancher : ${describePolicyBackfill(decision)}`)],
      REPORT_SAMPLE_LIMIT,
    ),
  };
}

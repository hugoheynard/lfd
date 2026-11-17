import type { StaffPermission } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { AfterCommit } from "../../../../platform/database/after-commit.js";
import { BackgroundWork } from "../../../../platform/events/background-work.js";
import { StaffNotifier } from "../../../../staff/notifications/domain/ports/staff-notifier.js";
import type { ProductionProblemState } from "../../domain/entities/production-problem.js";

/**
 * Qui reçoit : qui voit la Supervision, où le problème reste en rouge (
 * `fournil/les-niveaux-de-suivi.md`). Résolu à l'envoi par la
 * cloche, jamais figé.
 */
const AUDIENCE: StaffPermission = "b2b_supervision:read";

const KIND = "production.problem_reported";
const RUNG = "production-problem-bell";

/**
 * **La cloche d'un rouge** (`documentation/fournil/les-niveaux-de-suivi.md`).
 *
 * Elle sonne APRÈS la validation (`AfterCommit`, la file d'après validation de
 * l'unité de travail) : `notify` envoie dès l'appel, et un rouge annulé par
 * l'échec de son unité ne doit prévenir personne. Un envoi qui échoue est
 * journalisé par `BackgroundWork`, jamais avalé, et ne défait pas le rouge.
 *
 * Clé `problème:<id>:<version>` : un rouge rejoué ne sonne qu'une fois, un
 * second rouge sur la même ligne sonne de nouveau. Le lien mène à la ligne
 * de la fiche.
 */
@Injectable()
export class ProblemBell {
  constructor(
    private readonly notifier: StaffNotifier,
    private readonly afterCommit: AfterCommit,
    private readonly work: BackgroundWork,
  ) {}

  ringAfterCommit(problem: ProductionProblemState, productName: string): void {
    const notice = {
      kind: KIND,
      subject: `Problème au fournil : ${productName}, ${String(problem.produced)} sorti sur ${String(problem.expected)}`,
      body: bodyOf(problem),
      link: `/fournil?jour=${problem.serviceDay}&ligne=${encodeURIComponent(problem.sku)}`,
      idempotencyKey: `problème:${problem.id}:${String(problem.version)}`,
      occurredAt: problem.reported.at,
      audience: AUDIENCE,
    };
    this.afterCommit.defer(() => this.work.track(this.notifier.notify([notice]), RUNG), RUNG);
  }
}

function bodyOf(problem: ProductionProblemState): string {
  const reason = problem.reason === null ? "" : ` Raison : ${problem.reason}.`;
  return `Le fournil déclare ${String(problem.produced)} pièces réellement sorties le ${problem.serviceDay}.${reason} La ligne reste en rouge dans la Supervision jusqu'à ce qu'un responsable la marque traitée.`;
}

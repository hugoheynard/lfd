import { addDays, instantToLocal } from "@lfd/contracts";
import { Injectable } from "@nestjs/common";

import { UnitOfWork } from "../../../platform/database/unit-of-work.js";
import { Clock } from "../../../platform/time/clock.js";
import { OutputCorrectionsReader } from "../../../production/channels/packing/index.js";
import { CorrectionCatchUpDays } from "../../domain/ports/applied-correction.ledger.js";
import { OutputCorrectionApplier } from "./output-correction-applier.js";

/**
 * Le premier jour rattrapé, relatif à aujourd'hui (heure de la maison) :
 * la veille, pour une journée du soir pas encore close.
 */
const FIRST_DAY_OFFSET = -1;

/**
 * **Le rattrapage des corrections du fournil** (D9 de
 * `colisage/plan-niveaux-de-suivi-colisage.md`) : les faits
 * `production.output_corrected` publiés avant que le colisage ne les écoute
 * ne lui seront jamais livrés. Il relit donc les cumuls
 * (`OutputCorrectionsReader`) des journées où il a reçu des remises, à partir
 * de la veille, et applique les différences.
 *
 * Idempotent : la différence avec ce qui est déjà retiré, jamais deux fois.
 * Une unité de travail par correction : une seule réserve verrouillée à la
 * fois, comme les gestes du poste.
 *
 * @returns le nombre de corrections qui ont baissé une réserve.
 */
@Injectable()
export class CatchUpOutputCorrections {
  constructor(
    private readonly days: CorrectionCatchUpDays,
    private readonly corrections: OutputCorrectionsReader,
    private readonly applier: OutputCorrectionApplier,
    private readonly unitOfWork: UnitOfWork,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<number> {
    const firstDay = addDays(instantToLocal(this.clock.now()).day, FIRST_DAY_OFFSET);
    let applied = 0;
    for (const serviceDay of await this.days.daysWithHandoffsFrom(firstDay)) {
      for (const correction of await this.corrections.correctionsOf(serviceDay)) {
        const outcome = await this.unitOfWork.run(() => this.applier.apply(serviceDay, correction));
        applied += outcome === "applied" ? 1 : 0;
      }
    }
    return applied;
  }
}

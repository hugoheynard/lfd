import { Injectable } from "@nestjs/common";

import { AfterCommit } from "../../../../platform/database/after-commit.js";
import { BackgroundWork } from "../../../../platform/events/background-work.js";
import { PlanVersionPaper } from "../../../day/index.js";
import type { ProductionDay } from "../../../day/index.js";
import { ProductionPaperArchive } from "../../../shared/print/index.js";
import { ProductionPaperRenderer } from "./production-paper.service.js";
import { dayDossierSlotOf, productionCountSlotOf } from "./production-paper-slots.js";

const COUNT_LABEL = "production.plan-version-paper.count";
const DOSSIER_LABEL = "production.plan-version-paper.dossier";

/**
 * **Le papier d'une version, rangé au geste**
 * (`documentation/fournil/les-versions-du-plan.md`) — tel que
 * le plan l'implémente pour le noyau.
 *
 * Après le `COMMIT` (`AfterCommit`, hors transaction : le stockage est un
 * appel réseau), le compte à produire et le dossier de la journée que le
 * geste vient de sauver sont demandés à l'archive, sous la clé de SA version
 * (`productionCountSlotOf`, `dayDossierSlotOf`) : la journée en mémoire est
 * l'état `n`, et elle porte `n`. Rien n'est relu en base.
 *
 * Les deux papiers sont indépendants : l'un qui échoue n'empêche pas l'autre.
 * Un échec est journalisé (`BackgroundWork`) et ne retient rien — le geste
 * est validé. Un dossier qui n'est pas `archivable` (BL pas encore nés, une
 * lecture en panne) n'est pas rangé : la lecture suivante le reprend tant
 * que la version est la courante, puis l'écran dira « papier non rangé ».
 */
@Injectable()
export class ArchivedPlanVersionPaper extends PlanVersionPaper {
  constructor(
    private readonly renderer: ProductionPaperRenderer,
    private readonly archive: ProductionPaperArchive,
    private readonly afterCommit: AfterCommit,
    private readonly work: BackgroundWork,
  ) {
    super();
  }

  requestAfterCommit(day: ProductionDay): void {
    this.afterCommit.defer(() => this.work.track(this.storeCount(day), COUNT_LABEL), COUNT_LABEL);
    this.afterCommit.defer(
      () => this.work.track(this.storeDossier(day), DOSSIER_LABEL),
      DOSSIER_LABEL,
    );
  }

  private async storeCount(day: ProductionDay): Promise<void> {
    await this.archive.storedOr(productionCountSlotOf(day), () => this.renderer.countOf(day));
  }

  private async storeDossier(day: ProductionDay): Promise<void> {
    await this.archive.storedOr(dayDossierSlotOf(day), () => this.renderer.dossierOf(day));
  }
}

import { Global, Module } from "@nestjs/common";

import { PlanVersionPaper } from "../production/day/index.js";
import { ArchivedPlanVersionPaper } from "../production/plan/production-plan.module.js";
import { ProductionModule } from "../production/production.module.js";

/**
 * **Le papier d'une version, relié** (`documentation/fournil/les-versions-du-plan.md`). Le noyau du fournil (`day/`) écrit la version et déclare
 * `PlanVersionPaper` ; le plan, qui tire le dossier et le compte,
 * l'implémente. Le noyau ne peut pas importer le plan : sans ce fil, le
 * module de la journée devrait importer celui du plan, qui l'importe déjà.
 *
 * `@Global` pour la raison des autres fils : le fournisseur que le module de
 * la journée injecte n'est dans aucun module qu'il importe.
 */
@Global()
@Module({
  imports: [ProductionModule],
  providers: [{ provide: PlanVersionPaper, useExisting: ArchivedPlanVersionPaper }],
  exports: [PlanVersionPaper],
})
export class PlanVersionPaperFeedModule {}

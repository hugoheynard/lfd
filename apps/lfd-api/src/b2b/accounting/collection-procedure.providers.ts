import type { Provider, Type } from "@nestjs/common";

import { GetCollectionProcedureHandler } from "./application/queries/get-collection-procedure.handler.js";
import { AdminCollectionProcedureController } from "./http/admin-collection-procedure.controller.js";

/**
 * La lecture d'état de la page « Procédure de prélèvement » (plan
 * `plan-page-procedure-de-prelevement.md`, P2). À part du module, qui dépasse
 * déjà la taille d'un fichier. Elle ne déclare aucun port : elle lit ceux des
 * cartes des exports, des lots et des retours.
 */
export const COLLECTION_PROCEDURE_PROVIDERS: readonly Provider[] = [GetCollectionProcedureHandler];

export const COLLECTION_PROCEDURE_CONTROLLERS: readonly Type[] = [
  AdminCollectionProcedureController,
];

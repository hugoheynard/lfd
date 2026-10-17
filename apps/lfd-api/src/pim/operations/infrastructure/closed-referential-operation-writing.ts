import { Injectable } from "@nestjs/common";

import { ReferentialOperationWriting } from "../domain/ports/referential-operation-writing.js";

/**
 * **Fermée pour de bon** depuis le 2026-10-17 (X1 de
 * `documentation/catalogue/plan-sans-interrupteurs.md`) : les opérations
 * s'écrivent au commerce, et l'interrupteur `OPERATIONS_AT_COMMERCE` qui la
 * rouvrait est retiré.
 *
 * Un refus permanent, et non une écriture rendue au référentiel : sans lui, le
 * contrôleur `/pim/operations` écrirait jusqu'au retrait du contexte (X4) une
 * table que plus personne ne lit. Il part avec `pim/operations/**`.
 */
@Injectable()
export class ClosedReferentialOperationWriting extends ReferentialOperationWriting {
  isOpen(): boolean {
    return false;
  }
}

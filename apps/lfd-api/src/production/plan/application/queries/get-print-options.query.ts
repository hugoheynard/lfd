/**
 * La vue de la fenêtre d'impression du dossier vit au contrat partagé avec le
 * back-office (`ProductionPrintOptionsView`, `@lfd/contracts`).
 */
export type { PrintOptionOrder, PrintOptionRun, ProductionPrintOptionsView } from "@lfd/contracts";

/** L'état de la fenêtre d'impression du dossier d'une journée. */
export class GetPrintOptionsQuery {
  constructor(readonly serviceDay: string) {}
}

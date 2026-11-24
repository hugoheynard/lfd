import {
  type DossierSelection,
  WHOLE_DOSSIER,
} from "../../domain/services/day-dossier-selection.js";

/**
 * Le dossier du jour d'une journée arrêtée, en PDF — entier par défaut, ou
 * les parties, rayons et commandes d'une sélection.
 */
export class GetDayDossierPdfQuery {
  constructor(
    readonly serviceDay: string,
    readonly selection: DossierSelection = WHOLE_DOSSIER,
  ) {}
}

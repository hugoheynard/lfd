import { TechnicalError } from "../../../platform/shared/errors/app-error.js";
import type { Workstation, WorkstationMap } from "../domain/entities/workstation-map.js";

/** Un geste qui a muté un poste sans que la carte le retienne : un défaut de code. */
class UnrecordedWorkstationChangeError extends TechnicalError {
  constructor() {
    super(
      "production.workstation.unrecorded_change",
      "Le poste modifié n'a pas été retenu par la carte : rien n'a été écrit. Signalez-le à l'équipe technique.",
    );
  }
}

/** Le poste que le geste vient d'écrire, tel que la carte le sauvera. */
export function changedStation(map: WorkstationMap, id: string): Workstation {
  const station = map.changes().workstations.find((candidate) => candidate.id === id);
  if (station === undefined) {
    throw new UnrecordedWorkstationChangeError();
  }
  return station;
}

/** Un poste en service qu'un geste vient de viser : la carte l'a déjà vérifié. */
export function activeStation(map: WorkstationMap, id: string): Workstation {
  const station = map.active().find((candidate) => candidate.id === id);
  if (station === undefined) {
    throw new UnrecordedWorkstationChangeError();
  }
  return station;
}

import {
  ActiveBinTypesReader,
  MeasuredVehiclesReader,
} from "../../../domain/ports/composition-prerequisites.readers.js";

/** Les véhicules mesurés, donnés tels quels — pour une requête qui ne fait que lire. */
export class FixedMeasuredVehicles extends MeasuredVehiclesReader {
  constructor(private readonly ids: readonly string[]) {
    super();
  }

  measuredIds(): Promise<readonly string[]> {
    return Promise.resolve(this.ids);
  }
}

/** Les types de bacs en service, donnés tels quels. */
export class FixedActiveBinTypes extends ActiveBinTypesReader {
  constructor(private readonly ids: readonly string[]) {
    super();
  }

  activeIds(): Promise<readonly string[]> {
    return Promise.resolve(this.ids);
  }
}

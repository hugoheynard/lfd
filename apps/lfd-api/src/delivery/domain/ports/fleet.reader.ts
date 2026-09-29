import type { VehicleView } from "@lfd/contracts";

/** Port de **lecture** de la flotte : actifs et retirés, dans l'ordre de création. */
export abstract class FleetReader {
  abstract list(): Promise<readonly VehicleView[]>;
}

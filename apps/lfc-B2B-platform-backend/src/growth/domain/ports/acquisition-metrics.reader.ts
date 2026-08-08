import type { AcquisitionMetricsView } from "@lfd/contracts";

/** Port de lecture **acquisition & churn dans le temps** (grain jour). */
export abstract class AcquisitionMetricsReader {
  abstract load(): Promise<AcquisitionMetricsView>;
}

import type { OrderMetricsView } from "@lfd/contracts";

/** Port de lecture **métriques de commande** (CA, nombre, récurrent/unique dans le temps). */
export abstract class OrderMetricsReader {
  abstract load(): Promise<OrderMetricsView>;
}

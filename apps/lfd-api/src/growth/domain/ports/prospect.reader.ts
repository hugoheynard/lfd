import type { ProspectView } from "@lfd/contracts";

/**
 * Port de lecture des **prospects** — une projection du journal, pas un agrégat
 * (zéro invariant réfutable). L'adaptateur ne lit **que** `activity_events`,
 * jamais les tables de `orders`/`account` : le journal est le point de découplage.
 */
export abstract class ProspectReader {
  abstract list(): Promise<ProspectView[]>;
}

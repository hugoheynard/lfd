import type { RequestKind } from "@lfd/contracts";

/** Query : les motifs non archivés d'un formulaire, pour son onglet de réglage. */
export class ListRequestReasonsQuery {
  constructor(readonly kind: RequestKind) {}
}

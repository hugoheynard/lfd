import type { VitrineSubscriberView } from "@lfd/contracts";

import type { VitrineContents } from "../vitrine-contents.js";

/**
 * L'abonné que désigne une clé de lecture, réduit à ce que la résolution
 * consulte : ses cases, et s'il est allumé.
 */
export interface VitrineReadKeyHolder {
  readonly contents: VitrineContents;
  readonly active: boolean;
}

/** Port de lecture des abonnés : l'écran, et l'identification par la clé. */
export abstract class VitrineSubscriberReader {
  /** Tous les abonnés, coupés compris, du plus ancien au plus récent. */
  abstract list(): Promise<readonly VitrineSubscriberView[]>;
  /**
   * L'abonné dont la clé a cette empreinte, coupé compris ; `null` si aucun —
   * clé inconnue, ou remplacée par une rotation. Le refus d'un abonné coupé
   * est décidé par l'appelant, pas filtré ici.
   */
  abstract holderOfReadKey(readKeyHash: string): Promise<VitrineReadKeyHolder | null>;
}

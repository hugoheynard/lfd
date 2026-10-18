import type { VitrineSubscriberView } from "@lfd/contracts";

import type { VitrineContents } from "../vitrine-contents.js";

/** Port de lecture des abonnés : l'écran, et l'identification par la clé. */
export abstract class VitrineSubscriberReader {
  /** Tous les abonnés, coupés compris, du plus ancien au plus récent. */
  abstract list(): Promise<readonly VitrineSubscriberView[]>;
  /**
   * Les cases de l'abonné dont la clé a cette empreinte ; `null` si aucune —
   * clé inconnue, ou remplacée par une rotation.
   */
  abstract contentsForReadKey(readKeyHash: string): Promise<VitrineContents | null>;
}

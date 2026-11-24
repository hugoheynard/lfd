import type { PayLinkTest } from "../pay-link-test.js";

/** **Les essais, en lecture** — la liste de l'écran, des plus récents aux plus anciens. */
export abstract class PayLinkTestReader {
  /** Au plus `limit` essais, du plus récent au plus ancien. */
  abstract recent(limit: number): Promise<readonly PayLinkTest[]>;
}

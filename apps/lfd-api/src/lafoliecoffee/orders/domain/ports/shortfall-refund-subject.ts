import type { ShortfallRefundSubject } from "../services/shortfall-refund.js";

/**
 * **La commande dont le reste se rembourse, VERROUILLÉE** (plan
 * `documentation/commandes/reliquat/plan-e9-reste-carte.md`, § 4.2, § 4.3) —
 * `SELECT … FOR UPDATE` sur `orders`, le verrou que prennent la remise, le
 * solde, la révision et la facture carte, puis la relecture : le facturable
 * se lit ici, jamais sur le fait qui a réveillé l'abonné. Dans l'unité de
 * travail de l'appelant. `null` : commande inconnue.
 */
export abstract class ShortfallRefundSubjectLock {
  abstract lock(orderId: string): Promise<ShortfallRefundSubject | null>;
}

/**
 * La même commande, relue SANS verrou — la fiche commande, qui montre « Rembourser
 * le reste » sur l'état ; le geste rejuge sous verrou. Port à part (ISP).
 */
export abstract class ShortfallRefundSubjectReader {
  abstract read(orderId: string): Promise<ShortfallRefundSubject | null>;
}

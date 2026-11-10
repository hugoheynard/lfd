import type { LateFeeSetting } from "../../orders/domain/ports/order-late-fee.reader.js";

/**
 * Port d'**administration** de la surtaxe de commande tardive.
 *
 * Une seule valeur pour toute la maison : le coût couvert est la reprise d'une
 * production close, et il ne dépend ni du client ni du comptoir. La retirer
 * revient à rattraper gratuitement — un choix, pas un trou.
 */
export abstract class OrderLateFeeRepository {
  abstract read(): Promise<LateFeeSetting | null>;

  /** Pose ou remplace le réglage. Le taux est obligatoire : rien ne se devine. */
  abstract save(setting: LateFeeSetting, updatedBy: string): Promise<void>;

  /** Retire le réglage — les dérogations deviennent gratuites. */
  abstract clear(): Promise<void>;
}

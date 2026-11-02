import type { UnsettledSettlement } from "./unsettled-settlement.reader.js";

/**
 * Port de **lecture** de l'expiration des commandes boutique non réglées (plan
 * `documentation/commandes/reglement/commande-carte-reglee.md`, §4.1).
 *
 * Le périmètre est celui que l'adaptateur pose dans chaque `where`, et lui
 * seul : une commande `placed`, au règlement `pending` ou `failed`, que le
 * particulier a passée **lui-même** (`placedByStaffId` nul), sans société, de
 * clientèle `public`, et portant une intention Stripe directe. Une commande
 * passée par le staff (lien de règlement) ou pour une société n'y entre
 * jamais : elle garde le seul balayage de clôture.
 *
 * **Depuis le lot L4 du circuit du jour J**, un second périmètre : les
 * commandes prises sur la vitrine (`supply = shelf`) portant une intention —
 * passées par le client (particulier OU pro) ou, depuis le 2026-11-02, envoyées
 * au lien de paiement par l'équipe — le balayage de
 * clôture ne les voit plus (`notFromStock`, lot L1), et elles tiennent le
 * stock du jour tant qu'elles vivent. Leur délai est le réglage
 * `shelf_hold_minutes`, pas les 30 minutes de la boutique.
 */
export abstract class UnsettledShopOrderReader {
  /**
   * Les commandes FABRIQUÉES du périmètre boutique passées strictement avant
   * `cutoff` — une commande sur stock a son propre délai ({@link shelfPlacedBefore}).
   */
  abstract placedBefore(cutoff: Date): Promise<readonly UnsettledSettlement[]>;

  /**
   * Les commandes sur stock non réglées portant une intention (client ou lien
   * de l'équipe), passées strictement avant `cutoff`.
   */
  abstract shelfPlacedBefore(cutoff: Date): Promise<readonly UnsettledSettlement[]>;

  /**
   * Les commandes du périmètre que `newOrderId` remplace : celles du même
   * acheteur, autres qu'elle. Vide si `newOrderId` n'est pas elle-même dans le
   * périmètre — une commande passée par le staff ne remplace rien.
   */
  abstract replacedBy(newOrderId: string): Promise<readonly UnsettledSettlement[]>;
}

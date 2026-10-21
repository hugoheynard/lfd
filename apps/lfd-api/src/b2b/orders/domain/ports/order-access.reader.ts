import type { OrderRole } from "./order-guard.reader.js";

/** Ce qu'il faut savoir d'une commande pour décider qui l'atteint. */
export interface AccessedOrder {
  readonly companyId: string | null;
}

/**
 * **Le mur des gestes sur une commande EXISTANTE** (plan
 * `documentation/comptes-client/plan-commandes-des-sites.md`, §7.1, §7.4,
 * lot C1, 2026-10-21) : détail, bon, PDF, règlement, abandon, signalement.
 *
 * Distinct de `OrderGuardReader.roleOf`, et c'est tout le point : `roleOf`
 * garde la PASSATION, le DEVIS et la passation par l'équipe — la membership
 * propre, sans héritage, parce que commander pour un site est hors périmètre
 * (R8). Ici, le rôle EFFECTIF dans la société DE LA COMMANDE (`effectiveRole`) :
 * l'`owner` ou l'`admin` du principal y entre plafonné à `admin`, s'il y est
 * ACCEPTÉ et le principal `active` (§7.2) ; le parent est relu à chaque appel,
 * donc détacher coupe.
 *
 * 🔴 Irréversible : tout futur geste sur une commande existante passe par ici,
 * jamais par `roleOf`.
 */
export abstract class OrderAccessReader {
  /**
   * Le rôle effectif dans la société de la commande, ou `null` : pas
   * d'accès, ou commande personnelle (aucune société où en avoir un — son
   * mur est `placedByUserId`, cf. `isOrderVisible`).
   */
  abstract accessToOrder(userId: string, order: AccessedOrder): Promise<OrderRole | null>;
}

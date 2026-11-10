import type { AdminOrderCompanyView, AdminOrderCustomerView } from "@lfd/contracts";

/**
 * **Qui a passé une commande**, pour le détail staff — ce que `OrderView` ne
 * porte pas, parce que la vue client n'a pas à transporter l'e-mail et le
 * téléphone de son propre auteur.
 *
 * Un port à part et non une méthode de plus sur `OrderReader` (ISP) : seul le
 * détail staff le lit. Tout vit dans le commerce (`orders`, `users`,
 * `companies`) ; le nom d'un membre de l'équipe, lui, se lit à l'annuaire
 * staff par son propre port.
 */
export abstract class AdminOrderAuthorReader {
  /** `null` = commande inconnue. */
  abstract authorOf(orderId: string): Promise<AdminOrderAuthor | null>;
}

export interface AdminOrderAuthor {
  readonly customer: AdminOrderCustomerView;
  readonly company: AdminOrderCompanyView | null;
  /** Référence d'annuaire du membre de l'équipe qui l'a saisie, ou `null`. */
  readonly placedByStaffId: string | null;
}

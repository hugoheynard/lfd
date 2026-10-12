import type { OrderView } from "./order.js";
import type { OrderClientele } from "./order-handover.js";

/**
 * **Le détail staff d'une commande** — `GET /admin/orders/:id`.
 *
 * Une vue à part, qui ÉTEND `OrderView` au lieu d'y ajouter des champs : ce
 * qu'elle ajoute (l'e-mail et le téléphone de la personne) ne doit jamais
 * atteindre une route client. Les routes client rétrécissent déjà `OrderView`
 * champ par champ (`toCustomerOrder`, vérifié le 2026-10-12) ; un champ posé ici
 * n'y entre donc pas, et rien n'oblige à y penser.
 */
export interface AdminOrderView extends OrderView {
  /**
   * QUI a commandé, figé à la passation : `pro` ou `public`. `null` = commande
   * d'avant la distinction, jamais rattrapée — l'écran n'affiche alors aucun
   * badge plutôt que de le deviner (cf. `AdminOrderRow.clientele`).
   */
  readonly clientele: OrderClientele | null;
  /** La personne qui l'a passée, et pour qui — cf. {@link AdminOrderPlacedByView}. */
  readonly placedBy: AdminOrderPlacedByView;
}

/**
 * **La personne derrière la commande**, lue aujourd'hui (pas figée) : un
 * commercial qui rappelle un client veut son numéro actuel.
 *
 * Quand l'équipe a saisi la commande, `customer` reste le client pour le compte
 * duquel elle l'a été — et `staffName` nomme le membre de l'équipe.
 */
export interface AdminOrderPlacedByView {
  readonly customer: AdminOrderCustomerView;
  /** La société cliente, ou `null` sur une commande personnelle. */
  readonly company: AdminOrderCompanyView | null;
  /**
   * « Prénom Nom » du membre de l'équipe qui a saisi la commande, `null` si
   * elle ne l'a pas été — ou si l'annuaire ne le nomme plus (l'écran garde
   * alors « saisie par l'équipe », sans inventer de nom).
   */
  readonly staffName: string | null;
}

/** Le client (`User` du commerce) qui a passé la commande. */
export interface AdminOrderCustomerView {
  readonly userId: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  /** `null` = aucun numéro renseigné (la colonne vaut `""` en base). */
  readonly phone: string | null;
}

/** La société, sous ses deux noms. */
export interface AdminOrderCompanyView {
  readonly id: string;
  readonly raisonSociale: string;
  /** `null` = pas d'enseigne distincte de la raison sociale. */
  readonly enseigne: string | null;
}

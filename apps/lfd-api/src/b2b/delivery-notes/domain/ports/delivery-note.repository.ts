import type { DeliveryNote } from "../entities/delivery-note.js";

/**
 * Port d'**écriture** des bons de livraison : il prend et rend l'agrégat.
 *
 * Lire un BL pour l’imprimer passe par `DeliveryNoteReader` (plan E5a) : ce
 * port-ci ne sert que les écritures.
 *
 * L'adaptateur Prisma rejoint l'unité de travail de l'appelant : il injecte
 * `PrismaService`, routé vers la transaction ambiante
 * (`platform/database/transactional-prisma.ts`, vérifié le 2026-10-24). Le BL
 * part donc avec l'écriture de la commande, ou pas du tout.
 */
export abstract class DeliveryNoteRepository {
  /** Les BL de ces commandes, tous statuts confondus ; vide si aucune n'en a. */
  abstract loadForOrders(orderIds: readonly string[]): Promise<readonly DeliveryNote[]>;

  /**
   * Écrit le BL — neuf ou existant — et remplace ses lignes. L'unicité
   * `(order_id, rank)` en base refuse un second BL-1 : une prévision
   * concurrente échoue au lieu de dupliquer.
   */
  abstract save(note: DeliveryNote): Promise<void>;

  /**
   * Écrit un BL **neuf** sans jamais lever sur l'unicité `(order_id, rank)` :
   * `false` si un BL de ce rang existe déjà pour la commande (une course perdue
   * contre une re-clôture), et rien n'est écrit. L'appelant relit et avance
   * le BL existant (plan E2, § 8.3) — une erreur aurait annulé la transaction
   * de la commande avec elle.
   */
  abstract saveNew(note: DeliveryNote): Promise<boolean>;
}

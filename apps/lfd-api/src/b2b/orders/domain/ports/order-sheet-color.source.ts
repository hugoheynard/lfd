/**
 * **La couleur du bon de commande** — le trait épais entre le titre et le
 * numéro (plan `commandes/back-office/plan-tri-depart-et-couleurs.md`, L5, revu par Hugo
 * le 2026-10-13). `null` : pas de trait.
 *
 * Un port, comme le logo : le rendu reste pur et déterministe, l'adaptateur
 * lit la commande et les sites. ⚠️ Le bon est FIGÉ à la passation (archivé,
 * joint au courriel) : la couleur imprimée est celle de cet instant, et un
 * changement en Réglages › Sites ne touche pas un bon déjà rangé. Assumé.
 */
export abstract class OrderSheetColorSource {
  /** Une commande inconnue, sans clientèle ou sans site résolu : `null`. */
  abstract colorOf(orderId: string): Promise<string | null>;
}

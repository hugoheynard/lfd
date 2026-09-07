import type { OrderStatus } from "@lfd/contracts";

/**
 * La règle du **colisage** : la fabrication est-elle déclarable finie ?
 *
 * Même forme que {@link handoverBlocker} et pour la même raison : elle rend une
 * **phrase**, pas un booléen. Au fournil, le scan est fait d'une main farineuse
 * entre deux fournées ; un refus muet oblige à traverser le labo pour aller
 * demander pourquoi.
 *
 * Elle est **pure** : pas d'horloge, pas de port, aucune donnée qu'un test
 * doive fabriquer.
 */

/** L'état d'une commande, réduit à ce dont la règle a besoin. */
export interface PackingSubject {
  readonly status: OrderStatus;
  /** ISO ou `Date` du colisage déjà fait ; `null` = il reste à faire. */
  readonly readyAt: Date | null;
}

/**
 * Ce qui **empêche** de déclarer la commande prête — ou `null` si rien.
 *
 * Volontairement **permissif sur l'avancement**, exactement comme la remise :
 * tout état autre que `draft` et `cancelled` passe. Exiger `in_production`
 * fermerait la porte pour de bon — aucune transition automatique n'y mène
 * aujourd'hui, et l'atelier ne clique pas « je commence » avant de pétrir.
 *
 * 🔴 **Les états ne reculent jamais.** Une commande déjà remise ne redevient
 * pas « prête » : le colisage constate la fin d'une fabrication, il ne peut pas
 * défaire une remise qui a eu lieu. Une erreur de saisie se corrige par un geste
 * NOMMÉ, daté et attribué — pas par un retour en arrière silencieux qui
 * effacerait le fait qu'on s'est trompé.
 */
export function packingBlocker(subject: PackingSubject): string | null {
  if (subject.status === "cancelled") {
    return "Cette commande est annulée.";
  }
  if (subject.status === "draft") {
    return "Cette commande n'est pas encore passée.";
  }
  if (subject.status === "fulfilled") {
    return "Cette commande a déjà été remise.";
  }
  if (subject.readyAt !== null) {
    return "Cette commande est déjà déclarée prête.";
  }
  return null;
}

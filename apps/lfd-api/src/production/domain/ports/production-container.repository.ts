import type { ContainerRule } from "../services/production-worksheet.js";

/**
 * **Le réglage des contenants**, côté écriture.
 *
 * ## Pourquoi ce n'est pas un agrégat
 *
 * La question de tri du `CLAUDE.md` — « existe-t-il une règle qui peut REFUSER
 * cette écriture ? » — rend ici non. Un contenant n'a ni état, ni transition, ni
 * invariant qui dépende de ce qu'il était avant : « dix baguettes par tourneuse »
 * remplace « huit » sans rien avoir à vérifier. La seule contrainte de forme —
 * au moins une pièce par contenant — est portée par le schéma à la frontière, et
 * la base la porte aussi. Forcer un agrégat ici serait de la cérémonie.
 *
 * D'où un port de CRUD honnête, et deux interfaces plutôt qu'une : lire et
 * régler sont deux besoins, et la fiche d'atelier ne connaît que le premier.
 */
export abstract class ProductionContainerRepository {
  /**
   * Pose ou remplace le réglage d'un SKU. `staffSubject` est gardé pour savoir
   * **qui** a réglé : un nombre qui fait sortir la mauvaise quantité se discute
   * avec quelqu'un, pas avec une table.
   */
  abstract save(sku: string, rule: ContainerRule, staffSubject: string): Promise<void>;

  /**
   * Retire le réglage — la fiche cessera d'afficher un contenant pour ce SKU.
   *
   * ⚠️ Un vrai DELETE, et le §3.1 l'autorise : ce n'est pas un agrégat métier
   * mais un paramétrage, au même titre que les zones de livraison. Il n'y a
   * aucun fait daté à préserver ici — le réglage dit ce qui est vrai
   * aujourd'hui, pas ce qui a eu lieu.
   *
   * **Silencieux sur un SKU non réglé** : retirer ce qui n'est pas là rend le
   * même état, et un refus n'apprendrait rien à qui a cliqué deux fois.
   */
  abstract remove(sku: string): Promise<void>;
}

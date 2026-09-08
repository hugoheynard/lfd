import type { CompanyMercuriale } from "../entities/company-mercuriale.js";

/**
 * Port de **lecture** de la mercuriale d'un client.
 *
 * Lecture seule, comme `PriceRuleReader` et pour la même raison : le chemin qui
 * facture ne doit pas pouvoir poser un tarif.
 *
 * ## Pourquoi il rend l'OBJET, et pas une règle
 *
 * Parce qu'une règle suppose une **mesure** — quel palier retenir — et qu'un
 * lecteur ne l'a pas : il charge une fois pour tout un panier, dont chaque
 * ligne porte sa propre quantité. Convertir ici rendrait le palier de la
 * première quantité pour tout le reste, et la projection y verrait une courbe
 * plate.
 *
 * C'est exactement la décision de `VolumeLadderReader`, qui rend des échelles
 * et jamais des règles : `ladderAsRule` n'est appelé par aucun lecteur (vérifié
 * le 2026-09-08).
 */
export abstract class CompanyMercurialeReader {
  /**
   * **La mercuriale qui agit chez ce client à cet instant**, ou `null`.
   *
   * Au plus une : la contrainte d'exclusion n'en laisse pas deux se recouvrir
   * chez un même client. Une mercuriale **suspendue** est rendue quand même —
   * c'est la fonction pure qui décide de ne pas l'appliquer, `applies` lisant
   * `suspendedFrom`. Un lecteur qui la filtrerait dupliquerait cette décision.
   *
   * `null` sur un `companyId` absent : un visiteur sans société n'a pas de
   * tarif négocié, et le port le sait sans interroger la base.
   */
  abstract liveFor(companyId: string | null, at: Date): Promise<CompanyMercuriale | null>;

  /**
   * **Ce qu'on a décidé chez ce client** — de la plus récemment ouverte à la
   * plus ancienne, closes exclues.
   *
   * Distincte de {@link liveFor} parce qu'elle répond à une AUTRE question. La
   * première dit « que facture-t-on maintenant » et n'en rend qu'une ; celle-ci
   * dit « qu'a-t-on accordé », et en rend plusieurs : celle qui court, celle
   * qu'on a préparée pour janvier, celles dont la fenêtre est passée. La
   * contrainte n'interdit que le **recouvrement**, pas la succession.
   *
   * Mêler les deux alourdirait le chemin qui facture pour un besoin d'écran.
   */
  abstract listFor(companyId: string): Promise<readonly CompanyMercuriale[]>;

  /**
   * **Toutes les mercuriales qui agissent, tous clients confondus** — ce que le
   * marché paie déjà.
   *
   * Une troisième question, et non un `listFor` élargi : celle-ci ne vise
   * personne. Elle sert le comparatif qui situe un prix qu'on s'apprête à
   * accorder par rapport aux tarifs en place ailleurs, et elle est la seule
   * lecture de ce contexte qui traverse les clients.
   *
   * Les suspendues sont **exclues** ici, à la différence de {@link liveFor} :
   * on mesure ce qui se facture, pas ce qui a été décidé. Une mercuriale en
   * pause ne fait pas partie du marché.
   */
  abstract liveEverywhere(at: Date): Promise<readonly CompanyMercuriale[]>;
}

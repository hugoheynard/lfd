import type { OrderDraftPayload, OrderDraftView } from "@lfd/contracts";

/**
 * Le **brouillon de commande** d'une société — une saisie interrompue, mise de
 * côté par l'équipe et reprise depuis n'importe quel poste.
 *
 * Pas d'agrégat derrière ce port, et c'est délibéré : un brouillon n'a **aucun
 * invariant à protéger**. Une commande en a (au moins une ligne, une adresse
 * quand on livre, un acheteur membre de la société) — mais ce sont précisément
 * ceux d'une commande *passée*, et les exiger d'un brouillon reviendrait à
 * interdire d'interrompre un appel au milieu. Lui donner une entité et des
 * méthodes serait de la cérémonie autour d'un `upsert`.
 *
 * **Un brouillon par société**, jamais un par membre du staff : c'est le compte
 * qu'on sert. La contrepartie est écrite dans le contrat — la dernière écriture
 * gagne, et la trace dit à qui demander.
 */
export abstract class OrderDraftRepository {
  /** Le brouillon de cette société, ou `null`. */
  abstract find(companyId: string): Promise<OrderDraftView | null>;

  /**
   * Écrit le brouillon de cette société — création ou remplacement. Rend la vue
   * enregistrée : l'écran affiche « mis de côté à … » sans relire.
   */
  abstract save(
    companyId: string,
    payload: OrderDraftPayload,
    savedByStaffId: string | null,
  ): Promise<OrderDraftView>;

  /** Efface le brouillon. Idempotent : effacer deux fois n'est pas une erreur. */
  abstract discard(companyId: string): Promise<void>;
}

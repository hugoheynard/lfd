/**
 * **Le mur pro de l'annulation par le client** (plan
 * `documentation/commandes/annulation/plan-annulation-de-commande.md`, C6.2, B2).
 *
 * Plus strict que la passation, et c'est voulu : `OrderGuardReader.roleOf`
 * admet une invitation vivante NON acceptée (`openingMembership`), et
 * `order-settlement.ts` fait régler par carte une société non `active` au lieu
 * de la refuser (lus le 2026-10-13). Ici, il faut un rattachement ACCEPTÉ sur
 * CETTE société, et la société `active` — tout rôle, `billing` compris
 * (Q-C6.2). Aucune hérédité vers les sites.
 */
export abstract class CancellingMemberReader {
  abstract mayCancelFor(userId: string, companyId: string): Promise<boolean>;
}

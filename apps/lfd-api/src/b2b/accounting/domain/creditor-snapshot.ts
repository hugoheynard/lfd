import type { MandatePaymentType } from "./value-objects/mandate-defaults.js";
import type { SepaScheme } from "./value-objects/sepa-scheme.js";

/**
 * L'émetteur, **figé au jour où le document a été produit**.
 *
 * C'est une copie, jamais une référence, et c'est tout l'objet du type. Un
 * mandat signé en 2026 porte l'adresse de 2026 : le jour où le siège déménage,
 * le papier que le client a signé continue de dire ce qu'il dit, et la facture
 * de mars ne change pas de mentions en avril. Résoudre l'émetteur à la lecture
 * réécrirait rétroactivement des documents opposables.
 *
 * C'est le même motif que le `buyer_snapshot` de la facture et que le SKU
 * recopié sur une `OrderLine` — la référence croisée par identifiant opaque plus
 * copie, jamais par jointure vivante.
 */
export interface CreditorSnapshot {
  /** L'entité d'origine — opaque, pour retrouver la fiche, jamais pour relire. */
  readonly legalEntityId: string;
  readonly name: string;
  readonly legalForm: string;
  readonly siren: string;
  readonly vatNumber: string;
  readonly rcs: string;
  readonly shareCapitalCents: number;
  /** Les lignes d'adresse, prêtes à imprimer, sans les vides. */
  readonly addressLines: readonly string[];
  /** L'ICS, imprimé sur le mandat : c'est lui que le débiteur opposera. */
  readonly ics: string;
  /** Le compte où l'argent arrive — sur la facture, pas sur le mandat. */
  readonly creditorIban: string;
  /**
   * Le BIC de notre banque — `CdtrAgt/FinInstnId/BIC` du `pain.008`.
   *
   * **Nullable, et l'IBAN ne l'est pas** : le BIC est arrivé après (2026-09-12),
   * et une entité renseignée avant lui reste parfaitement capable d'émettre un
   * mandat — ce document-là ne le porte pas. C'est le LOT qui en aura besoin, et
   * c'est donc le lot qui devra refuser, en nommant l'entité à compléter.
   */
  readonly creditorBic: string | null;
  /**
   * Le titulaire du compte et son adresse, **tels que la banque les connaît**.
   *
   * Distincts de `name` / `addressLines` juste au-dessus, qui viennent du
   * registre. Les deux coïncident presque toujours, et « presque » est la raison
   * d'avoir les deux : c'est CE bloc-ci que la banque compare, et c'est lui
   * qu'un mandat doit porter. `null` / vide tant qu'aucun RIB n'a été recopié.
   */
  readonly accountHolder: string | null;
  readonly accountAddressLines: readonly string[];
  /** Le délai annoncé entre la notification et le débit, en jours. */
  readonly preNotificationDays: number;

  /**
   * **Zone 20** du mandat — ce que le contrat couvre, en une ligne.
   *
   * Sur l'ÉMETTEUR et non sur le client : elle décrit ce que nous vendons, et
   * la même phrase part sur tous les mandats de cette entité.
   */
  readonly mandateContractDescription: string;

  /** **Zone 12** du mandat — récurrent, ou ponctuel. */
  readonly mandatePaymentType: MandatePaymentType;
  /**
   * Le schéma que l'émetteur donne à ses frappes À VENIR. Un mandat le recopie
   * à la frappe ; ensuite, seul le sien compte.
   */
  readonly mandateScheme: SepaScheme;
}

/**
 * **Ce que la comptabilité a déjà fait d'une commande au compte** (plan
 * `documentation/commandes/annulation/plan-annulation-de-commande.md`, lot C5, C5.5) — ce
 * que la règle d'annulation lit pour refuser une commande déjà facturée,
 * engagée dans un lot, prélevée, ou rejetée puis re-présentée.
 *
 * Nommé `AccountEngagement` et non `AccountOrderEngagement` comme le plan :
 * ce nom-là est celui du port, et un type et une classe ne peuvent pas le
 * partager.
 *
 * Les jours sont des `AAAA-MM-JJ` ; une date que la comptabilité n'a pas
 * gardée est `null`, jamais inventée (C5.6).
 */
export type AccountEngagement =
  /** Rien d'engagé : ni facture, ni lot, ni rejet (`order_collection` absente, `due` ou `excluded`). */
  | { readonly kind: "free" }
  | { readonly kind: "invoiced"; readonly invoiceNumber: string; readonly issuedOn: string }
  | {
      readonly kind: "collecting";
      readonly state: "batched";
      readonly collectionDay: string | null;
      /** La référence de l'arrêté de facturation de sa ligne, s'il en a un. */
      readonly statementNumber: string | null;
    }
  | {
      readonly kind: "collected";
      readonly state: "collected" | "returned";
      readonly collectionDay: string | null;
    }
  | { readonly kind: "written_off" }
  /** Rejetée par la banque puis re-présentée : `due`, mais avec une histoire bancaire (C5.2, 5). */
  | { readonly kind: "returned_before" }
  | { readonly kind: "settled_otherwise" };

/**
 * Port de **lecture** de l'engagement comptable (ISP) — l'aperçu du détail
 * staff n'a besoin que de lui. Déclaré par la commande, implémenté par la
 * comptabilité (`appBootstrap/account-order-engagement.module.ts`).
 */
export abstract class AccountOrderEngagementReader {
  /**
   * `null` : l'engagement n'a pas pu être établi (une ligne d'encaissement
   * dans un état que la commande ne connaît pas). Pour une commande au
   * compte, la règle en fait un refus, jamais « annulable » (S6).
   */
  abstract engagementOf(orderId: string): Promise<AccountEngagement | null>;
}

/**
 * Port de **lecture + écriture**, pour le geste d'annulation (C5.4) : relire
 * l'engagement sous le verrou de la ligne `orders`, puis **fermer** la ligne
 * d'encaissement (`order_collection` → `cancelled`) dans la MÊME unité de
 * travail — précédent : `OrderWithdrawalDesk`.
 *
 * Les deux méthodes s'appellent sous le verrou de l'appelant
 * (`OrderCancellationRepository.lock`) : c'est lui qui rend la lecture
 * autoritaire et empêche un lot ou un règlement de passer entre les deux.
 */
export abstract class AccountOrderEngagement extends AccountOrderEngagementReader {
  /**
   * Ferme la ligne d'encaissement de la commande. Le montant sert à la créer
   * quand aucun lot ne l'a encore vue (l'absence vaut `due`).
   *
   * @throws {BusinessError} la ligne n'est plus ouverte (`due`/`excluded`) —
   *   impossible sous le verrou si l'engagement relu était `free`.
   */
  abstract closeForCancellation(orderId: string, amountCents: number, at: Date): Promise<void>;
}

import { z } from "zod";

import type { AtelierSheet } from "./order-sheet.js";

/**
 * Les **fiches de fonction** d'un service : ce que le labo doit fabriquer pour
 * une date donnée, une feuille par commande, plus une récapitulation.
 *
 * C'est un papier, pas un écran. La production n'a pas de suivi en ligne : elle
 * reçoit une pile de feuilles à la clôture et travaille dessus. Deux
 * conséquences qui expliquent la forme de ce contrat :
 *
 * - **aucun montant.** Une fiche sert à FABRIQUER. Un prix n'aide personne au
 *   fournil, et une feuille oubliée sur un plan de travail ne doit pas raconter
 *   les marges de la maison à qui la ramasse ;
 * - **un lot dénombrable.** Le papier ne répond pas : si l'imprimante manque de
 *   feuilles, une commande cesse d'exister pour la production sans que personne
 *   l'apprenne. Le lot porte donc son compte, et chaque fiche son rang — une
 *   absence se voit, au lieu d'être silencieuse.
 *
 * Le lot est **exhaustif par construction** : une commande ne peut pas être
 * passée sans jour de retrait/livraison (cf. `orderContentShape`), donc aucune
 * ne peut échapper à une journée. C'est l'invariant qui garantit la couverture,
 * pas un compteur d'orphelines affiché au fournil.
 */

/** La date d'un lot : le jour de **service** (retrait ou livraison), pas de commande. */
export const productionBatchQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, "date attendue au format AAAA-MM-JJ"),
});
export type ProductionBatchQuery = z.infer<typeof productionBatchQuerySchema>;

/**
 * Le lot d'un jour. `sheets` est ordonné de façon **stable** (par référence de
 * commande) pour qu'une réimpression rende exactement la même pile, dans le même
 * ordre, avec les mêmes rangs.
 *
 * 🔴 **Une fiche de production EST un bon de commande d'audience `atelier`**, et
 * elle l'est depuis le 2026-09-07. Il y avait deux types pour un seul papier :
 * `ProductionSheet` savait à QUI la commande appartient, `AtelierSheet` savait
 * QUAND le tirage avait été arrêté — et aucun des deux ne savait les deux. Deux
 * définitions d'un même document, c'est deux occasions de le faire diverger, et
 * la première avait déjà eu lieu : la fiche du fournil n'a jamais porté son
 * heure de génération, alors que deux tirages peuvent circuler après un avenant.
 */
/**
 * **Ce qu'une journée de fabrication dit d'elle-même**, vue du fournil.
 *
 * ⚠️ `pendingInCommerce` existe pour une raison précise, et il faut la lire :
 * la production publie sa clôture, le commerce s'abonne, et le bus vit **en
 * processus** — l'événement n'est ni persisté ni rejoué. Un container qui tombe
 * entre les deux laisse des commandes `placed` sur une journée close.
 *
 * Sans cette lecture, la divergence n'existerait que dans la tête de celui qui
 * la cherche. Avec elle, elle se voit — et le rattrapage est de reclore la
 * journée, ce qui republie le fait sans rien recalculer.
 */
export interface ProductionDayStatus {
  readonly date: string;
  /** `null` = la journée n'est pas arrêtée. */
  readonly closedAt: string | null;
  /** Ce que la PRODUCTION a inscrit chez elle. */
  readonly orders: number;
  /** Les articles du compte à produire, tous clients confondus. */
  readonly items: number;
  /**
   * Les commandes que le COMMERCE n'a pas encore basculées, sur une journée
   * pourtant close. Zéro attendu ; autre chose = l'abonné a manqué le fait.
   */
  readonly pendingInCommerce: number;
}

export interface ProductionBatchView {
  /** `AAAA-MM-JJ`, la journée servie. */
  readonly date: string;
  readonly sheets: readonly AtelierSheet[];
}

/**
 * Ce que rend la **clôture du plan du soir** : combien de commandes la journée
 * vient d'absorber.
 *
 * Un **compte** et pas une liste : au moment où l'on clôt, la question est
 * « combien part en production ce soir », pas « lesquelles ». La liste, elle,
 * est le lot lui-même, qu'on vient d'imprimer.
 *
 * `absorbed` vaut **zéro** sur une seconde clôture, et c'est une information et
 * non une erreur : la journée était déjà basculée, rien n'a bougé, et l'écran le
 * dit plutôt que de refuser.
 */
export interface ProductionPlanClosure {
  /** `AAAA-MM-JJ`, la journée close. */
  readonly date: string;
  /**
   * Le nombre de commandes **inscrites côté production**.
   *
   * 🔴 C'était « le nombre passées de `placed` à `confirmed` », c'est-à-dire un
   * fait du COMMERCE. Depuis que la production tient sa propre écriture, ce que
   * la clôture constate est ce qu'elle a inscrit chez elle ; le commerce
   * apprend la bascule par un événement, et son écriture n'est plus dans la
   * réponse. Compter ce qu'un abonné fera plus tard aurait été promettre.
   */
  readonly absorbed: number;
  /**
   * Vrai quand la journée était **déjà arrêtée** et qu'on l'a seulement
   * réannoncée.
   *
   * La clôture reste rejouable — c'est le rattrapage prévu quand l'abonné du
   * commerce a échoué — mais elle ne RECALCULE rien : le compte à produire est
   * un instantané, et les commandes bougent après. La réponse dit donc laquelle
   * des deux choses vient d'arriver, plutôt que de rendre deux fois le même
   * nombre sans dire pourquoi.
   */
  readonly alreadyClosed: boolean;
  /** L'instant de la clôture d'origine — celui du snapshot, jamais du rejeu. */
  readonly closedAt: string;
}

import type { AlertKind } from "./account-alert.js";

/**
 * Ce qu'un détecteur **constate sur une ligne** de commande.
 *
 * Le constat est figé au déclenchement — quantité observée, référence, écart,
 * message. La moyenne d'aujourd'hui ne doit pas réécrire ce qu'on a constaté en
 * mars : une alerte est un fait daté, pas une requête rejouée à l'affichage.
 */
export interface AlertFinding {
  readonly sku: string;
  /** Nom du produit au moment de la commande (la ligne le porte déjà figé). */
  readonly productName: string;
  readonly quantity: number;
  /** Ce à quoi on a comparé. `null` quand la règle ne compare rien. */
  readonly baseline: number | null;
  /** Écart **signé** en % (positif = hausse). `null` quand il n'y a pas d'écart. */
  readonly deviationPercent: number | null;
  /** Le constat en une phrase, **pour le staff**. Figé, jamais recalculé. */
  readonly message: string;
}

/**
 * Une **alerte déclenchée** : un type, une commande, et les lignes concernées.
 *
 * Une alerte par (type × commande), **pas par ligne** : un client qui élargit sa
 * gamme sur quinze références produirait quinze alertes, et la première vraie
 * utilisation noierait la liste. Le bruit est ainsi borné par construction — au
 * plus une alerte par type et par commande.
 */
export interface AccountAlertView {
  readonly id: string;
  readonly kind: AlertKind;
  readonly companyId: string;
  readonly orderId: string;
  /** Référence humaine de la commande, figée — elle sert à en parler. */
  readonly orderNumber: string;
  /** ISO. Temps de l'événement, pas de l'écriture. */
  readonly occurredAt: string;
  readonly findings: readonly AlertFinding[];
  /** ISO, ou `null` tant que personne ne l'a prise en compte. */
  readonly acknowledgedAt: string | null;
  /** Le `sub` staff qui l'a acquittée, ou `null`. */
  readonly acknowledgedBy: string | null;
}

/**
 * Le nombre d'alertes **non acquittées** par société — la pastille de la liste
 * des comptes.
 *
 * Un objet, pas une `Map` : ça traverse le fil. Les sociétés sans alerte en
 * attente n'y figurent **pas** — un zéro n'a rien à transporter, et la liste des
 * comptes est cross-tenant, donc potentiellement longue.
 */
export type PendingAlertCounts = Readonly<Record<string, number>>;

import { z } from "zod";

/**
 * État d'un **mandat de prélèvement SEPA**.
 *
 * `draft` est le mandat que NOUS frappons : la RUM existe, le papier est
 * imprimé, la signature n'est pas revenue. Il ne prélève rien.
 *
 * 🔴 **Cette valeur est partie avant d'exister en base (2026-09-12)**, et
 * l'ordre est la seule chose qui compte ici. Le back-office fait
 * `MANDATE_STATUS_LABELS[status].toLowerCase()` : servir une valeur qu'un
 * bundle déjà chargé ne connaît pas rend `undefined.toLowerCase()`, et la
 * section paiement meurt chez quelqu'un qui n'a rien demandé. Le libellé doit
 * donc être en ligne AVANT que la base puisse produire l'état.
 *
 * `active` seul autorise un prélèvement. `pending` existe parce que Stripe peut
 * rendre un mandat non encore actif ; `revoked` est notre geste (le client
 * retire son autorisation, ou on remplace le mandat) ; `failed` vient de la
 * banque. Un mandat ne s'efface jamais : il se date — c'est ce qui permet de
 * répondre, deux ans plus tard, à « sur quelle autorisation avez-vous prélevé ? ».
 */
export const mandateStatusSchema = z.enum(["draft", "pending", "active", "revoked", "failed"]);
export type MandateStatus = z.infer<typeof mandateStatusSchema>;

export const MANDATE_STATUS_LABELS: Readonly<Record<MandateStatus, string>> = {
  draft: "En attente de signature",
  pending: "En cours d'activation",
  active: "Actif",
  revoked: "Révoqué",
  failed: "Rejeté",
};

/**
 * Ce que le back-office montre d'un mandat.
 *
 * **Aucune coordonnée bancaire n'y figure**, et jamais dans une réponse d'API.
 * `last4` et `bankCode` ne servent qu'à *reconnaître* le compte (« ••••3000 »),
 * pas à le débiter : ils ne suffisent à rien seuls.
 *
 * ⚠️ Cette phrase disait aussi « ni en base » jusqu'au 2026-09-12. Elle reste
 * vraie de la table `payment_mandates`, qui ne porte toujours aucun IBAN — mais
 * elle ne l'est plus du dépôt : `company_bank_accounts` stocke désormais le RIB
 * du client, **scellé** (AES-256-GCM). La généraliser ferait croire qu'aucun
 * IBAN de débiteur n'existe nulle part, ce qui enverrait chercher au mauvais
 * endroit le jour où il faudra en répondre.
 */
export interface PaymentMandateView {
  readonly id: string;
  /** Référence opposable du mandat (RUM), dictable en cas de contestation. */
  readonly reference: string;
  readonly status: MandateStatus;
  /** 4 derniers chiffres de l'IBAN, pour reconnaître le compte. */
  readonly last4: string;
  /** Code banque (BIC court), vide si Stripe ne l'a pas rendu. */
  readonly bankCode: string;
  /** Pays du compte (ISO 2 lettres), vide si inconnu. */
  readonly country: string;
  /**
   * Date du consentement déclaré, ISO — **`null` tant que le mandat n'est pas
   * signé**.
   *
   * ⚠️ Ce champ était non nullable jusqu'au 2026-09-12, et il est SERVI : un
   * front en ligne l'affiche en « signé le … ». Il se nullabilise plutôt que de
   * porter une date inventée le jour de la frappe — la date de frappe n'est pas
   * celle de la signature, et c'est cette dernière qu'on oppose en
   * contestation. Un écran qui ne teste pas le `null` affichera « signé le »
   * suivi de rien : dégradé, jamais faux.
   */
  readonly acceptedAt: string | null;
  /** ISO, ou `null` tant que le mandat n'a pas été révoqué. */
  readonly revokedAt: string | null;
  /**
   * Le **mandat signé** est-il déposé ? En contestation, la charge de la preuve
   * est sur nous : un mandat actif sans pièce est un mandat sans filet, et
   * l'écran doit le dire au lieu de l'afficher comme un mandat normal.
   */
  readonly hasProof: boolean;
  /** Nom du fichier de preuve déposé, vide s'il n'y en a pas. */
  readonly proofFileName: string;
}

/**
 * Tout ce dont la section « Moyens de paiement » a besoin, en une lecture : le
 * mandat courant (`null` si la société n'en a jamais eu, le cas ordinaire) et la
 * clé **publique** Stripe pour monter l'IBAN Element.
 *
 * La clé voyage avec la vue plutôt que par une variable de build : elle suit
 * l'environnement du backend, et un back-office pointé sur le mauvais compte
 * Stripe enregistrerait des mandats dans le vide. Rien de secret — `pk_…` est
 * faite pour le bundle.
 */
export interface MandateSectionView {
  readonly mandate: PaymentMandateView | null;
  readonly publishableKey: string;
}

/**
 * Ce qu'on saisit en déclarant qu'un mandat est **signé**.
 *
 * 🔴 Une seule donnée, et c'est la date portée par le PAPIER — jamais celle de
 * la saisie. Un mandat revient signé quelques jours après avoir été posté, et
 * c'est cette date-là qu'on oppose en contestation. Les confondre daterait
 * l'autorisation du jour où on l'a enregistrée.
 *
 * Une date seule (`YYYY-MM-DD`), sans heure : le papier n'en porte pas, et en
 * inventer une donnerait une précision que la pièce ne soutient pas.
 */
export const signMandatePayloadSchema = z.object({
  signedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, "une date au format AAAA-MM-JJ est attendue"),
});
export type SignMandatePayload = z.infer<typeof signMandatePayloadSchema>;

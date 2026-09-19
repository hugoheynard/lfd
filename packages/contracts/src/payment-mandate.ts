import { z } from "zod";

import type { SepaScheme } from "./legal-entity.js";

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
 * `active` seul autorise un prélèvement. `revoked` est notre geste (le client
 * retire son autorisation, ou on remplace le mandat). `pending` et `failed`
 * sont des états de l'époque Stripe : plus aucun code ne les écrit depuis la
 * suppression des mandats Stripe (2026-09-19). Ils restent dans l'enum parce
 * que c'est une valeur de base et un contrat servi. Un mandat ne s'efface jamais : il se date — c'est ce qui permet de
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
 * Ce qui **empêche de frapper** un mandat — un code par mention manquante.
 *
 * Des codes et non des phrases : l'écran en fait un libellé ET un lien vers le
 * dialogue qui saisit la mention, et une phrase ne se relie à rien.
 *
 * - `bank_account_missing` — aucun RIB : il se saisit dans « RIB » ;
 * - `issuer_missing` — aucune entité émettrice, ou incomplète, ou en double :
 *   Comptabilité › Entités juridiques ;
 * - `company_name_missing`, `siren_missing` — la raison sociale et le SIREN du
 *   débiteur, que seul le mandat **interentreprises** exige : Identité légale ;
 * - `holder_legal_form_missing` — la civilité ou forme juridique du titulaire
 *   du compte, exigée par le seul interentreprises : RIB.
 *
 * Plan `documentation/comptabilite/plan-mentions-obligatoires-du-mandat.md` §9.2.
 */
export const mintBlockerSchema = z.enum([
  "bank_account_missing",
  "issuer_missing",
  "company_name_missing",
  "siren_missing",
  "holder_legal_form_missing",
]);
export type MintBlocker = z.infer<typeof mintBlockerSchema>;

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
  /** Le schéma FIGÉ à la frappe — CORE ou interentreprises. */
  readonly scheme: SepaScheme;
  /** 4 derniers chiffres de l'IBAN, pour reconnaître le compte. */
  readonly last4: string;
  /** Code banque (BIC court) ; vide pour un mandat frappé chez nous, qui ne le pose pas. */
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
  /**
   * La **révision** de la pièce déposée : une empreinte opaque, vide sans pièce.
   * Ajoutée le 2026-09-15 (plan `documentation/comptabilite/plan-restes-du-mandat.md`
   * §7 #9).
   *
   * L'écran la renvoie telle quelle en déclarant le mandat signé : le serveur
   * refuse alors si le scan a été remplacé depuis que la fiche a été ouverte.
   * Ce n'est **jamais** la clé de stockage — elle ne désigne rien, elle se
   * compare.
   */
  readonly proofRevision: string;
}

/**
 * Ce que le **client** voit de son mandat — `GET /companies/:companyId/mandate`.
 *
 * Plan `documentation/comptabilite/plan-mandat-client.md`, fin du §9 (2026-09-14).
 *
 * Plus étroite que {@link PaymentMandateView}, et chaque absence est voulue :
 * ni `last4`, ni `bankCode`, ni `country` — le client a déjà sa carte RIB, et
 * une seconde source sur le compte finirait par contredire la première ; ni
 * `revokedAt` — un mandat révoqué se lit « aucun mandat en cours » côté client.
 */
export interface CustomerMandateView {
  readonly id: string;
  /** La RUM, que le client déclare à sa banque. */
  readonly reference: string;
  readonly status: MandateStatus;
  /** Le schéma FIGÉ à la frappe — CORE ou interentreprises. */
  readonly scheme: SepaScheme;
  /** Le scan signé est-il déposé ? Vrai = « en vérification » tant que `draft`. */
  readonly hasProof: boolean;
  /** Nom du fichier déposé, vide s'il n'y en a pas. */
  readonly proofFileName: string;
  /** Date portée par le papier signé (ISO), `null` tant que non activé. */
  readonly acceptedAt: string | null;
}

/**
 * Tout ce dont la section « Moyens de paiement » a besoin, en une lecture : le
 * mandat courant (`null` si la société n'en a jamais eu, le cas ordinaire), ce
 * qui empêche de le frapper, et le schéma de l'émetteur.
 */
export interface MandateSectionView {
  readonly mandate: PaymentMandateView | null;
  /**
   * @deprecated Vestige des mandats Stripe (supprimés le 2026-09-19) : servait
   * à monter l'IBAN Element. Plus rien ne le lit pour un mandat ; il reste servi
   * tant que le back-office déployé le lit, et se retire après son déploiement.
   */
  readonly publishableKey: string;
  /**
   * Ce qui empêche aujourd'hui de **frapper** un mandat pour cette société —
   * vide quand la frappe passerait. Champ ajouté le 2026-09-15 (plan
   * `documentation/comptabilite/plan-mentions-obligatoires-du-mandat.md` §9).
   *
   * Calculé par la même fonction que la frappe : l'écran ne peut pas annoncer
   * « prêt » quand le serveur refuserait, ni l'inverse.
   */
  readonly mintBlockers: readonly MintBlocker[];
  /**
   * Le schéma de l'émetteur, ou `null` s'il est absent, incomplet ou en double.
   * L'écran RIB en déduit que la forme juridique du titulaire est EXIGÉE
   * (interentreprises) — ajouté le 2026-09-15, même lecture que `mintBlockers`.
   */
  readonly issuerScheme: SepaScheme | null;
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
 *
 * ⚠️ « Une seule donnée » était vrai jusqu'au 2026-09-15 : s'y ajoute la
 * révision de la pièce relue, qui n'est pas une saisie mais un témoin.
 */
export const signMandatePayloadSchema = z.object({
  signedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, "une date au format AAAA-MM-JJ est attendue"),
  /**
   * La `proofRevision` de la pièce **relue** (depuis le 2026-09-15). Obligatoire :
   * une signature qui ne dit pas quelle pièce elle atteste ne prouve rien.
   */
  proofRevision: z.string().min(1, "la révision de la pièce relue est attendue"),
});
export type SignMandatePayload = z.infer<typeof signMandatePayloadSchema>;

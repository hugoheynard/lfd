import { z } from "zod";

/**
 * Le **RIB d'une société cliente** — le compte que nous débitons.
 *
 * ## Ce qui monte, et ce qui ne redescend jamais
 *
 * L'IBAN monte **en clair** sur une route staff murée, et **ne redescend
 * jamais** : la vue n'en rend que les quatre derniers caractères. Le BIC, lui,
 * redescend en entier — il désigne un établissement, pas un compte, et il figure
 * sur tout virement.
 *
 * C'est la même règle que pour le compte créancier, et pour une fois la symétrie
 * est réelle : dans les deux cas, rien à l'écran n'a besoin de lire un IBAN
 * entier.
 *
 * 🔴 En base, en revanche, les deux régimes DIFFÈRENT. `creditor_iban` est
 * stocké en clair ; celui-ci est **scellé** (AES-256-GCM). Notre compte reçoit
 * et nous en sommes le titulaire ; ceux-ci sont les données personnelles de
 * centaines de clients, et un dump de la base en ferait un fichier qui a une
 * valeur. L'asymétrie est assumée, pas subie.
 *
 * ## Un seul geste, jamais un compte à moitié
 *
 * Titulaire, adresse, IBAN, BIC arrivent ensemble. Un compte incomplet ne se
 * découvrirait qu'au **rejet du lot**, cinq jours après l'envoi — et un rejet se
 * paie en frais bancaires et en appel du client.
 *
 * ⚠️ Le titulaire et l'adresse sont ceux **que la banque du client connaît**, pas
 * ceux du registre. Ils peuvent diverger de la raison sociale déclarée sans que
 * personne se trompe, et c'est ce bloc-là qui s'imprime sur le mandat signé.
 */
export const setCompanyBankAccountPayloadSchema = z.object({
  iban: z.string().trim().min(1),
  bic: z.string().trim().min(1),
  holder: z.string().trim().min(1),
  line1: z.string().trim().min(1),
  line2: z.string().trim().default(""),
  postalCode: z.string().trim().min(1),
  city: z.string().trim().min(1),
  countryCode: z.string().trim().length(2).default("FR"),
});
export type SetCompanyBankAccountPayload = z.infer<typeof setCompanyBankAccountPayloadSchema>;

/**
 * Ce que le back-office montre du RIB d'un client.
 *
 * 🔴 **Aucun IBAN entier.** `last4` sert à *reconnaître* le compte (« ••••2606 »),
 * et c'est la seule question qu'on se pose devant une fiche. C'est aussi lui
 * qu'une zone de danger fera taper pour confirmer un remplacement.
 */
export interface CompanyBankAccountView {
  /** Titulaire tel que la banque du client le connaît. */
  readonly holder: string;
  readonly addressLine1: string;
  readonly addressLine2: string;
  readonly postalCode: string;
  readonly city: string;
  readonly countryCode: string;
  /** BIC complet — il désigne une banque, pas un compte. */
  readonly bic: string;
  /** 4 derniers caractères de l'IBAN. Jamais davantage. */
  readonly last4: string;

  /**
   * **Zone 14** — le code que le débiteur veut voir revenir sur son relevé.
   * Facultatif, `""` quand personne ne l'a renseigné.
   */
  readonly debtorReference: string;
  /** **Zone 19** — le numéro du contrat que ce mandat sert à régler. */
  readonly contractNumber: string;
  /** **Zone 20** — ce que ce contrat couvre, en une ligne. */
  readonly contractDescription: string;
}

/**
 * L'enveloppe que rend la route de lecture.
 *
 * ⚠️ **Un objet, et non un `CompanyBankAccountView | null` nu.** Nest sérialise
 * un `null` de contrôleur en **corps vide** : le front recevrait `""`, pas
 * `null`, et le distinguerait mal d'une panne. La même raison a donné sa forme à
 * `MandateSectionView` (constaté le 2026-09-12, par un e2e qui attendait `null`
 * et recevait une chaîne vide).
 */
export interface CompanyBankAccountSectionView {
  /** `null` tant que le client n'a jamais déposé de RIB — le cas ordinaire. */
  readonly account: CompanyBankAccountView | null;
}

/**
 * Les **zones facultatives** du mandat, seules — 14, 19 et 20 du modèle EPC.
 *
 * 🔴 Elles ont leur propre route, et ce n'est pas une commodité d'écran. Le
 * `PUT` du RIB exige l'IBAN, qui **ne redescend jamais** : renvoyer le RIB
 * entier pour corriger une description de contrat obligerait à le ressaisir à
 * chaque fois. Elles se réécrivent donc seules — ce qui est aussi la vérité du
 * domaine, rien ici ne touchant à ce que le débiteur a autorisé.
 */
export const setMandateOptionsPayloadSchema = z.object({
  debtorReference: z.string().trim().default(""),
  contractNumber: z.string().trim().default(""),
  contractDescription: z.string().trim().default(""),
});
export type SetMandateOptionsPayload = z.infer<typeof setMandateOptionsPayloadSchema>;

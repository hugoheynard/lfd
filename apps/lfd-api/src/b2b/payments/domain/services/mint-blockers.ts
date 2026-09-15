import type { SepaScheme } from "../../../accounting/domain/value-objects/sepa-scheme.js";

/**
 * Les codes de ce qui **empêche de frapper** un mandat, dans l'ordre où l'écran
 * les liste.
 *
 * Copie du `mintBlockerSchema` de `@lfd/contracts`, et la duplication est
 * voulue : le domaine ne tire pas Zod. Les lectures rendent ce type sous le nom
 * du contrat, donc un code ajouté ici sans l'être là-bas ne compile pas.
 */
export const MINT_BLOCKERS = [
  "bank_account_missing",
  "issuer_missing",
  "company_name_missing",
  "siren_missing",
  "holder_legal_form_missing",
] as const;
export type MintBlocker = (typeof MINT_BLOCKERS)[number];

/** Ce que la règle lit — trois sources, aucune n'est un agrégat entier (ISP). */
export interface MintBlockersInput {
  /** Le compte recopié du RIB, `null` quand aucun RIB n'est déposé. */
  readonly bankAccount: { readonly holderLegalForm: string } | null;
  /**
   * Le schéma sous lequel l'émetteur frapperait, `null` quand il n'y a pas
   * d'émetteur **unique et complet** — absent, incomplet ou en double.
   */
  readonly issuerScheme: SepaScheme | null;
  /** La société débitrice telle qu'enregistrée. */
  readonly debtor: { readonly companyName: string; readonly siren: string };
}

interface MentionRule {
  readonly blocker: MintBlocker;
  readonly missing: (input: MintBlockersInput) => boolean;
}

const isBlank = (text: string): boolean => text.trim() === "";

/** Ce que tout mandat exige, quel que soit son schéma. */
const COMMON_RULES: readonly MentionRule[] = [
  { blocker: "bank_account_missing", missing: (input) => input.bankAccount === null },
  { blocker: "issuer_missing", missing: (input) => input.issuerScheme === null },
];

/**
 * Ce que chaque formulaire ajoute — relevé sur les astérisques des deux
 * gabarits imprimés (plan `plan-mentions-obligatoires-du-mandat.md` §2).
 *
 * La forme juridique du titulaire n'est réclamée que sur un RIB **déposé** :
 * sans RIB, `bank_account_missing` envoie déjà vers le dialogue qui la saisit,
 * et deux blocages pour un seul geste feraient compter deux choses à faire.
 */
const RULES_BY_SCHEME: Readonly<Record<SepaScheme, readonly MentionRule[]>> = {
  CORE: [],
  B2B: [
    { blocker: "company_name_missing", missing: (input) => isBlank(input.debtor.companyName) },
    { blocker: "siren_missing", missing: (input) => isBlank(input.debtor.siren) },
    {
      blocker: "holder_legal_form_missing",
      missing: (input) => input.bankAccount !== null && isBlank(input.bankAccount.holderLegalForm),
    },
  ],
};

/**
 * Ce qui manque pour frapper un mandat — vide quand la frappe passerait.
 *
 * 🔴 **La seule** fonction qui en décide : la frappe (staff et client) la lit
 * pour refuser, les deux lectures pour l'annoncer. Deux calculs finiraient par
 * diverger, et un bouton « Frapper » actif sur un refus serveur est le pire des
 * deux écarts.
 *
 * Sans émetteur, le schéma est inconnu : seules les mentions communes se
 * jugent. Les mentions propres au schéma apparaîtront une fois l'émetteur
 * corrigé — on ne réclame pas un SIREN qu'un mandat CORE n'imprime pas.
 */
export function mintBlockersOf(input: MintBlockersInput): readonly MintBlocker[] {
  const rules =
    input.issuerScheme === null
      ? COMMON_RULES
      : [...COMMON_RULES, ...RULES_BY_SCHEME[input.issuerScheme]];
  return rules.filter((rule) => rule.missing(input)).map((rule) => rule.blocker);
}

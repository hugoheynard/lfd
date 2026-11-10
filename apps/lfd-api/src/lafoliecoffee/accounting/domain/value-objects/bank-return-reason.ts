import { InvalidBankReturnReasonError } from "../errors/collection-return-errors.js";

/**
 * Le genre d'un retour bancaire (plan `retours-bancaires.md`) :
 * un rejet AVANT règlement (`pain.002`), un retour APRÈS (`camt.054`), ou un
 * remboursement demandé par le débiteur — CORE seulement.
 */
export type BankReturnKind = "reject" | "return" | "refund_request";

/** « Autre » : la norme le nomme `NARR`, et il ne vaut rien sans ses mots. */
export const NARRATIVE_REASON = "NARR";

/**
 * Les motifs des **R-transactions SEPA** (guide de l'EPC, codes ISO 20022),
 * chacun avec ses mots pour le staff. Une liste FERMÉE : un code hors liste
 * est un fichier mal lu ou une saisie fausse, et se dit « autre » avec son
 * libellé.
 */
const REASON_LABELS = {
  AC01: "IBAN incorrect",
  AC04: "Compte clôturé",
  AC06: "Compte bloqué",
  AC13: "Compte d'un particulier sur un prélèvement interentreprises",
  AG01: "Prélèvement interdit sur ce compte",
  AG02: "Code d'opération invalide",
  AM04: "Provision insuffisante",
  AM05: "Opération en double",
  BE05: "Créancier non reconnu",
  CNOR: "Banque du créancier injoignable",
  DNOR: "Banque du débiteur injoignable",
  FF01: "Format de fichier invalide",
  MD01: "Pas de mandat",
  MD02: "Données du mandat manquantes ou fausses",
  MD06: "Remboursement demandé par le débiteur",
  MD07: "Débiteur décédé",
  MS02: "Refusé par le débiteur",
  MS03: "Motif non précisé par la banque",
  RC01: "BIC incorrect",
  RR01: "Identification du débiteur manquante",
  RR02: "Nom ou adresse du débiteur manquant",
  RR03: "Nom ou adresse du créancier manquant",
  RR04: "Motif réglementaire",
  SL01: "Service particulier de la banque du débiteur",
} as const;

export type BankReturnReasonCode = keyof typeof REASON_LABELS;

/**
 * `ExternalStatusReason1Code` — ce qu'un `pain.002` peut dire d'un rejet.
 * `MD06` n'y est pas : un remboursement ne se demande qu'APRÈS règlement.
 */
const STATUS_REASONS: ReadonlySet<string> = new Set(
  Object.keys(REASON_LABELS).filter((code) => code !== "MD06"),
);

/** `ExternalReturnReason1Code` — ce qu'un `camt.054` peut dire d'un retour. */
const RETURN_REASONS: ReadonlySet<string> = new Set(Object.keys(REASON_LABELS));

/**
 * Les motifs qui disent que le mandat ne tient plus : la banque ne connaît
 * pas de mandat, le compte est clos ou faux, le débiteur a refusé ou est
 * décédé. Ils PROPOSENT de révoquer (§ 2 bis-5) ; rien n'est révoqué seul.
 */
const REVOCATION_REASONS: ReadonlySet<string> = new Set(["AC01", "AC04", "MD01", "MD07", "MS02"]);

/** Le libellé le plus long qu'on garde d'un motif « autre » ou d'un fichier. */
export const REASON_LABEL_MAX = 140;

const CODE_SHAPE = /^[A-Z0-9]{4}$/u;

/**
 * **Le motif d'un retour** — un code ISO de la liste fermée, ou `NARR` avec
 * ses mots. Le code admis dépend du genre : un rejet parle la langue du
 * `pain.002`, un retour et un remboursement celle du `camt.054`.
 */
export class BankReturnReason {
  private constructor(
    readonly code: string,
    /** Les mots de la banque, ou les nôtres pour « autre » ; `null` pour un code connu sans libellé. */
    readonly label: string | null,
  ) {}

  /**
   * @throws {InvalidBankReturnReasonError} code mal formé, hors liste pour ce
   *         genre, ou « autre » sans libellé.
   */
  static of(kind: BankReturnKind, code: string, label: string | null): BankReturnReason {
    const trimmedLabel = label === null ? null : label.trim().slice(0, REASON_LABEL_MAX);
    const words = trimmedLabel === "" ? null : trimmedLabel;
    if (!CODE_SHAPE.test(code)) {
      throw new InvalidBankReturnReasonError(code, "un motif tient en quatre lettres ou chiffres");
    }
    if (code === NARRATIVE_REASON) {
      if (words === null) {
        throw new InvalidBankReturnReasonError(code, "un motif « autre » se dit avec ses mots");
      }
      return new BankReturnReason(code, words);
    }
    const admitted = kind === "reject" ? STATUS_REASONS : RETURN_REASONS;
    if (!admitted.has(code)) {
      throw new InvalidBankReturnReasonError(
        code,
        kind === "reject"
          ? "ce code n'est pas un motif de rejet (pain.002) — choisir « autre » et recopier le libellé de la banque"
          : "ce code n'est pas un motif de retour (camt.054) — choisir « autre » et recopier le libellé de la banque",
      );
    }
    return new BankReturnReason(code, words);
  }

  /** Réhydrate sans revalider la liste : un code admis hier reste lisible. */
  static rehydrate(code: string, label: string | null): BankReturnReason {
    return new BankReturnReason(code, label);
  }

  /** Les mots que l'écran affiche : ceux de la liste, sinon ceux saisis. */
  get description(): string {
    return reasonDescription(this.code, this.label);
  }

  /** Le motif dit-il que le mandat ne tient plus ? */
  get proposesRevocation(): boolean {
    return REVOCATION_REASONS.has(this.code);
  }
}

/**
 * Le motif qu'un FICHIER donne, ramené à ce que l'agrégat admet : un code
 * hors de la liste pour ce genre devient « autre », avec le code de la banque
 * en tête de ses mots — rien n'est perdu, rien n'est inventé.
 */
export function normalizedFileReason(
  kind: BankReturnKind,
  code: string,
  label: string | null,
): { readonly code: string; readonly label: string | null } {
  const admitted = kind === "reject" ? STATUS_REASONS : RETURN_REASONS;
  if (code === NARRATIVE_REASON || admitted.has(code)) {
    return { code, label };
  }
  const words = label === null ? `Code ${code}` : `Code ${code} : ${label}`;
  return { code: NARRATIVE_REASON, label: words.slice(0, REASON_LABEL_MAX) };
}

/** « Provision insuffisante », ou le libellé saisi, ou le code tel quel. */
export function reasonDescription(code: string, label: string | null): string {
  const known: string | undefined = (REASON_LABELS as Readonly<Record<string, string>>)[code];
  return known ?? label ?? code;
}

/** Le motif propose-t-il une révocation ? Pour une vue, sans l'objet. */
export function reasonProposesRevocation(code: string): boolean {
  return REVOCATION_REASONS.has(code);
}

/** La liste fermée, pour l'écran de saisie : code et mots. */
export const BANK_RETURN_REASONS: readonly { readonly code: string; readonly label: string }[] =
  Object.entries(REASON_LABELS).map(([code, label]) => ({ code, label }));

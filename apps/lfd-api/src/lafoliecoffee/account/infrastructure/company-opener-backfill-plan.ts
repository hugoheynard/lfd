/**
 * Une société que la reprise regarde : un principal (jamais un site) dont
 * l'auteur est vide.
 */
export interface CompanyWithoutOpener {
  readonly id: string;
  readonly reference: string;
  /** Le suiveur déjà posé, ou `null` : la reprise ne réécrit jamais un suiveur. */
  readonly followedByStaffId: string | null;
}

/** Le fait `company.declared` tel que le journal l'a gardé, pour une société. */
export interface DeclarationTrace {
  readonly companyId: string;
  /** `customer` | `staff` | `system` — seul `staff` désigne un auteur dans l'équipe. */
  readonly actorType: string;
  readonly actorId: string | null;
  /** Le nom figé au moment du fait, ou `null` quand l'annuaire ne le connaissait pas. */
  readonly actorName: string | null;
}

/** Ce qu'on écrirait pour une société, ou pourquoi on n'écrit rien. */
export type OpenerBackfillLine =
  | {
      readonly kind: "fill";
      readonly companyId: string;
      readonly reference: string;
      readonly declaredByStaffId: string;
      readonly declaredByName: string | null;
      /** `null` : un suiveur est déjà posé, il reste tel quel. */
      readonly followedByStaffId: string | null;
    }
  | {
      readonly kind: "skip";
      readonly companyId: string;
      readonly reference: string;
      readonly reason: OpenerSkipReason;
    };

/**
 * Pourquoi une société reste sans auteur :
 * - `no-declaration` : aucun fait `company.declared` au journal ;
 * - `not-staff` : déclarée par le client ou par le système ;
 * - `no-actor` : un fait staff sans `actor_id` — auteur inconnu ;
 * - `unresolved-sub` : un `sub` Auth0 que la conversion n'a pas su traduire
 *   en fiche staff — ce n'est pas un id de fiche, on ne le range pas comme tel.
 */
export type OpenerSkipReason = "no-declaration" | "not-staff" | "no-actor" | "unresolved-sub";

/**
 * **Ce que la reprise de l'auteur écrirait** (`plan-suivi-commercial.md`,
 * § 3.1) — pur, éprouvé sans base.
 *
 * Les sociétés et les faits viennent de DEUX lectures, une par schéma, et se
 * joignent ici en mémoire : jamais de jointure SQL entre `public` et `growth`.
 * Un acteur introuvable laisse la colonne vide, jamais une valeur inventée.
 */
export function planCompanyOpeners(
  companies: readonly CompanyWithoutOpener[],
  declarations: readonly DeclarationTrace[],
): readonly OpenerBackfillLine[] {
  const byCompany = new Map<string, DeclarationTrace>();
  for (const trace of declarations) {
    // Le fait est idempotent par société ; un doublon garderait le premier lu.
    if (!byCompany.has(trace.companyId)) {
      byCompany.set(trace.companyId, trace);
    }
  }
  return companies.map((company) => lineFor(company, byCompany.get(company.id)));
}

function lineFor(
  company: CompanyWithoutOpener,
  trace: DeclarationTrace | undefined,
): OpenerBackfillLine {
  const skip = (reason: OpenerSkipReason): OpenerBackfillLine => ({
    kind: "skip",
    companyId: company.id,
    reference: company.reference,
    reason,
  });
  if (trace === undefined) return skip("no-declaration");
  if (trace.actorType !== "staff") return skip("not-staff");
  const actorId = trace.actorId?.trim() ?? "";
  if (actorId === "") return skip("no-actor");
  if (actorId.includes("|")) return skip("unresolved-sub");
  const name = trace.actorName?.trim() ?? "";
  return {
    kind: "fill",
    companyId: company.id,
    reference: company.reference,
    declaredByStaffId: actorId,
    declaredByName: name === "" ? null : name,
    followedByStaffId: company.followedByStaffId === null ? actorId : null,
  };
}

/** Combien de déclarations staff historiques portent un acteur — le compte à lire avant d'écrire. */
export function staffDeclarationCoverage(declarations: readonly DeclarationTrace[]): {
  readonly staff: number;
  readonly withActor: number;
} {
  const staff = declarations.filter((trace) => trace.actorType === "staff");
  return {
    staff: staff.length,
    withActor: staff.filter((trace) => (trace.actorId?.trim() ?? "") !== "").length,
  };
}

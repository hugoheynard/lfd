/**
 * **Qui a arrêté le plan** (Hugo, 2026-10-06 — doc
 * `documentation/production/dossier-prod-du-jour.md`) : une personne du
 * personnel, ou l'arrêt automatique.
 *
 * Le nom est FIGÉ à l'arrêt : le dossier imprimé ne bouge plus, même si la
 * fiche est renommée ensuite. `null` quand la fiche n'en portait aucun.
 */
export type PlanSigner =
  | { readonly kind: "automatic" }
  | { readonly kind: "staff"; readonly staffUserId: string; readonly name: string | null };

/** L'auteur rangé en base pour un arrêt automatique (`production_day.closed_by`). */
export const AUTO_CLOSE_ACTOR = "auto-close";

export const AUTOMATIC_SIGNER: PlanSigner = { kind: "automatic" };

/** Une personne du personnel, nommée comme l'annuaire la nomme aujourd'hui. */
export function staffSigner(staffUserId: string, name: string | null): PlanSigner {
  return { kind: "staff", staffUserId, name };
}

/**
 * Le complément d'agent d'une phrase « Arrêté … le … » : « par Marie Dupont »,
 * « automatiquement », ou rien — un auteur inconnu (journée d'avant) ou une
 * fiche sans nom ne s'invente pas.
 */
export function signedBy(signer: PlanSigner | null): string {
  if (signer === null) {
    return "";
  }
  if (signer.kind === "automatic") {
    return "automatiquement";
  }
  return signer.name === null ? "" : `par ${signer.name}`;
}

/** « Arrêté par Marie Dupont le » / « arrêté le » — `verb` sans espace finale. */
export function signedVerb(verb: string, signer: PlanSigner | null): string {
  const agent = signedBy(signer);
  return agent === "" ? `${verb} le` : `${verb} ${agent} le`;
}

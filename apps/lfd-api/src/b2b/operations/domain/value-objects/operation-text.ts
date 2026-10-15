import { InvalidOperationTextError } from "../errors/operation-errors.js";

/** Un texte d'annonce dans ses langues — le français toujours. */
export interface OperationText {
  readonly fr: string;
  readonly en?: string;
  readonly it?: string;
}

/** Ce qu'on donne à {@link operationText} : les langues facultatives peuvent manquer ou être vides. */
export interface OperationTextInput {
  readonly fr: string;
  readonly en?: string | undefined;
  readonly it?: string | undefined;
}

/**
 * **Un texte d'annonce** — le nom ou l'accroche d'une opération.
 *
 * Rogné ; une traduction vide disparaît plutôt que de s'afficher en blanc, et
 * le français, que la boutique affiche d'abord, ne peut pas l'être.
 *
 * @param field ce que ce texte est, pour le message (« nom de l'opération »).
 * @throws {InvalidOperationTextError} le français est vide.
 */
export function operationText(field: string, raw: OperationTextInput): OperationText {
  const fr = raw.fr.trim();
  if (fr === "") {
    throw new InvalidOperationTextError(field);
  }
  const en = raw.en?.trim() ?? "";
  const it = raw.it?.trim() ?? "";
  return { fr, ...(en === "" ? {} : { en }), ...(it === "" ? {} : { it }) };
}

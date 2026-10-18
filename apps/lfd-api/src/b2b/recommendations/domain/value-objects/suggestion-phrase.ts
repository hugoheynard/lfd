import { InvalidSuggestionPhraseError } from "../errors/staff-suggestion-errors.js";

/**
 * Une phrase tient sur une ligne, sous la suggestion. La borne que le plan
 * laissait « à fixer » (§2) : 90 caractères par langue.
 */
export const MAX_SUGGESTION_PHRASE_LENGTH = 90;

/** La phrase du staff : le français toujours, l'anglais et l'italien s'il y en a. */
export interface SuggestionPhrase {
  readonly fr: string;
  readonly en?: string;
  readonly it?: string;
}

export interface SuggestionPhraseInput {
  readonly fr: string;
  readonly en?: string | undefined;
  readonly it?: string | undefined;
}

const LANGUAGES = { fr: "français", en: "anglais", it: "italien" } as const;

/**
 * **La raison affichée** (`suggestions-du-staff.md` §4). `null` = pas de phrase : la boutique
 * dit « Notre conseil ». Une phrase rognée ENTIÈREMENT vide vaut aussi `null`
 * — un champ effacé à l'écran n'est pas une phrase. Une traduction vide
 * disparaît.
 *
 * @throws {InvalidSuggestionPhraseError} une traduction sans français, ou une langue trop longue.
 */
export function suggestionPhrase(raw: SuggestionPhraseInput | null): SuggestionPhrase | null {
  if (raw === null) {
    return null;
  }
  const fr = raw.fr.trim();
  const en = raw.en?.trim() ?? "";
  const it = raw.it?.trim() ?? "";
  if (fr === "" && en === "" && it === "") {
    return null;
  }
  if (fr === "") {
    throw new InvalidSuggestionPhraseError(
      "missing_fr",
      LANGUAGES.fr,
      MAX_SUGGESTION_PHRASE_LENGTH,
    );
  }
  for (const [language, text] of [
    ["fr", fr],
    ["en", en],
    ["it", it],
  ] as const) {
    if (text.length > MAX_SUGGESTION_PHRASE_LENGTH) {
      throw new InvalidSuggestionPhraseError(
        "too_long",
        LANGUAGES[language],
        MAX_SUGGESTION_PHRASE_LENGTH,
      );
    }
  }
  return { fr, ...(en === "" ? {} : { en }), ...(it === "" ? {} : { it }) };
}

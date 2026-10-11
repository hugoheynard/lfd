import { SOURCE_LOCALE, type Locale } from "./shared.js";

/**
 * **Une image dont personne n'a écrit l'alternative porte son URL** — la règle,
 * écrite une fois et lue des deux côtés (sortie du serveur le 2026-10-11).
 *
 * La colonne est obligatoire ; « je n'ai pas encore décrit cette image » est
 * pourtant un état légitime du fonds. Le repli est l'URL, et pas une chaîne
 * vide : une alternative absente doit SE VOIR, jamais se confondre avec une
 * alternative rédigée.
 *
 * Elle vivait en trois copies — le dépôt, la description, et chaque écran qui
 * devait reconnaître le repli (`alt.fr === url`) pour ne pas l'afficher comme
 * un texte. Trois copies d'une règle finissent par en dire trois.
 */

/** Ce qu'un écran envoie : la source peut manquer, ou être laissée vide. */
export type DraftAlt = Readonly<Partial<Record<Locale, string>>>;

/**
 * L'alternative de cette image est-elle RÉDIGÉE ? — une langue source écrite,
 * qui n'est pas le repli sur l'URL.
 */
export function isMediaAltWritten(alt: DraftAlt | null | undefined, url: string): boolean {
  const source = alt?.[SOURCE_LOCALE]?.trim() ?? "";
  return source !== "" && source !== url;
}

/**
 * L'alternative à ranger : celle qu'on a écrite, ou l'URL faute de source.
 *
 * Les traductions d'une alternative sans source tombent avec elle : une
 * traduction de rien n'est pas une description.
 */
export function mediaAltOrUrl(alt: DraftAlt | null | undefined, url: string): DraftAlt {
  return alt !== null && alt !== undefined && isMediaAltWritten(alt, url)
    ? alt
    : { [SOURCE_LOCALE]: url };
}

import type { LegalMention } from "./platform-content.defaults.js";

/**
 * Les **sections requises** d'un document légal — le vocabulaire fermé des
 * paragraphes qu'une mention DOIT porter, et qu'on ne peut pas supprimer.
 *
 * Plan `documentation/legal/plan-page-confidentialite.md` §4.2 : Meta pointe
 * « la section de suppression des données », pas une ancre qu'un rédacteur
 * aurait tapée. Une obligation est donc une STRUCTURE — une clé posée par une
 * commande dédiée, refusée à la suppression par l'agrégat — et jamais un champ
 * libre qui se vide sans que rien ne le dise.
 *
 * ⚠️ Ce module n'importe que des TYPES, jamais zod : les deux fronts lisent ces
 * valeurs par `@lfd/contracts/content-values`, et le baril du paquet tire zod
 * dans un bundle de vitrine (+380 ko relevés). Le schéma, lui, dérive d'ici.
 */
export const legalSectionKeys = ["dataDeletion"] as const;
export type LegalSectionKey = (typeof legalSectionKeys)[number];

/**
 * Les sections qu'exige chaque mention, écrites une fois. Les CGV pourront
 * exiger `withdrawal` le jour venu, sans nouveau mécanisme.
 */
const REQUIRED_SECTIONS: Readonly<Record<LegalMention, readonly LegalSectionKey[]>> = {
  legalNotice: [],
  salesTerms: [],
  privacy: ["dataDeletion"],
  cookies: [],
  accessibility: [],
};

/** Les sections qu'une mention doit porter — une liste vide si elle n'en exige aucune. */
export function requiredSections(mention: LegalMention): readonly LegalSectionKey[] {
  return REQUIRED_SECTIONS[mention];
}

/**
 * L'**ancre** publique d'une section — dérivée de la clé, jamais de la saisie.
 *
 * Elle ne suit pas la langue : la page publique est en français, et Meta reçoit
 * une URL qui ne doit pas bouger quand un titre est corrigé.
 */
const SECTION_ANCHORS: Readonly<Record<LegalSectionKey, string>> = {
  dataDeletion: "suppression-des-donnees",
};

export function sectionAnchor(key: LegalSectionKey): string {
  return SECTION_ANCHORS[key];
}

/** Le libellé d'une section pour le staff (badge, encadré « section manquante »). */
export const legalSectionLabels: Readonly<Record<LegalSectionKey, string>> = {
  dataDeletion: "Suppression des données",
};

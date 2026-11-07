import { htmlEscape } from "./escape.js";

/**
 * **Les sections du corps d'un e-mail** — ce qui, dans la coquille, se place
 * entre le bandeau d'en-tête et le recours (plan
 * `documentation/contenu-ecommerce/plan-textes-des-e-mails.md`, E4, S1 et S2).
 *
 * L'en-tête et le recours ne sont PAS des sections : ce sont les cadres de
 * l'e-mail, ils restent en tête et en bas quel que soit l'ordre demandé.
 */

/**
 * Les sections, dans l'ordre par DÉFAUT — celui que la coquille rendait avant
 * qu'un ordre puisse se régler (S5). L'itinéraire (S7) s'y insère après
 * l'image : on vient de lire où et avec quoi venir, voici comment y aller.
 */
export const LAYOUT_SECTIONS = [
  "title",
  "body",
  "summary",
  "image",
  "itinerary",
  "cta",
  "secondaryLink",
  "footer",
] as const;

/** Une section du corps d'un e-mail. */
export type LayoutSectionId = (typeof LAYOUT_SECTIONS)[number];

/** Un identifiant de section ? Une chaîne venue d'ailleurs ne l'est pas d'office. */
export function isLayoutSectionId(candidate: string): candidate is LayoutSectionId {
  return (LAYOUT_SECTIONS as readonly string[]).includes(candidate);
}

/**
 * Les sections qui, ABSENTES, laissent quand même leur ligne vide dans le
 * HTML : les sept d'avant l'itinéraire. C'est ce qui garde, dans l'ordre par
 * défaut, chaque e-mail octet pour octet identique à son rendu d'avant les
 * sections (`mail-rendering-golden.spec.ts` côté API). L'itinéraire, venu
 * après, ne laisse rien quand il n'est pas là.
 */
const BLANK_LINE_WHEN_ABSENT: ReadonlySet<LayoutSectionId> = new Set<LayoutSectionId>([
  "title",
  "body",
  "summary",
  "image",
  "cta",
  "secondaryLink",
  "footer",
]);

/**
 * L'ordre effectif : celui demandé (inconnus et doublons écartés), puis les
 * sections qu'il ne nomme pas, dans l'ordre par défaut. Une demande partielle
 * ne fait donc jamais disparaître une section : c'est à l'app de refuser un
 * ordre incomplet, la coquille, elle, ne perd rien.
 */
export function effectiveSectionOrder(
  requested: readonly string[] | undefined,
): readonly LayoutSectionId[] {
  if (requested === undefined) {
    return LAYOUT_SECTIONS;
  }
  const named = [...new Set(requested.filter(isLayoutSectionId))];
  return [...named, ...LAYOUT_SECTIONS.filter((id) => !named.includes(id))];
}

/**
 * Un morceau du corps : une section de la coquille, ou un bloc libre d'un
 * document réarrangé (S4b), qui n'est jamais vide quand il est là.
 */
export type LayoutPart =
  | { readonly kind: "section"; readonly id: LayoutSectionId; readonly html: string }
  | { readonly kind: "free"; readonly id: string; readonly html: string };

function kept(part: LayoutPart): boolean {
  return part.kind === "free" || part.html !== "" || BLANK_LINE_WHEN_ABSENT.has(part.id);
}

function marked(part: LayoutPart): string {
  if (part.html === "") {
    return part.html;
  }
  return part.kind === "section"
    ? `<div data-mail-section="${part.id}">${part.html}</div>`
    : `<div data-mail-block="${htmlEscape(part.id)}">${part.html}</div>`;
}

/**
 * Assemble des morceaux dans l'ordre donné, avec la règle des lignes vides de
 * la coquille. `markSections` (l'aperçu de l'écran, S4) enveloppe chaque
 * morceau rendu d'un `<div>` neutre qui le nomme — jamais dans un e-mail
 * envoyé.
 */
export function joinParts(parts: readonly LayoutPart[], markSections: boolean): string {
  return parts
    .filter(kept)
    .map((part) => (markSections ? marked(part) : part.html))
    .join("\n        ");
}

/** Assemble le corps de la coquille dans l'ordre effectif. */
export function joinSections(
  fragments: Readonly<Record<LayoutSectionId, string>>,
  order: readonly LayoutSectionId[],
  markSections: boolean,
): string {
  return joinParts(
    order.map((id) => ({ kind: "section", id, html: fragments[id] })),
    markSections,
  );
}

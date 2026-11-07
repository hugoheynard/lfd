import type { MailEditorResources, MailValueResource } from '@lfd/mail-blocks';

/**
 * **Les ressources d'un e-mail, lues par l'éditeur** (plan
 * `plan-editeur-par-blocs.md`, § 24, R2). Les fiches sont servies par l'API
 * (`MailEditorView.resources`, R1) ; l'écran ne fait que les lire : nommer
 * une pastille, refuser une valeur posée dans une phrase qui ne la reçoit pas.
 * Ce qui s'enregistre ne change pas — `{ref}` reste `{ref}`.
 */

/** Un e-mail dont l'API n'a pas servi de ressources : rien à poser. */
export const EMPTY_MAIL_RESOURCES: MailEditorResources = { values: [], links: [], dataBlocks: [] };

/** Les fiches des valeurs, par nom technique. */
export function valueCardsByName(
  resources: MailEditorResources,
): ReadonlyMap<string, MailValueResource> {
  return new Map(resources.values.map((value) => [value.name, value]));
}

/**
 * Le refus d'une valeur posée dans une phrase, ou `null` si la phrase a le
 * droit de la porter (`phrases` de la fiche). Une valeur sans fiche est
 * refusée : l'e-mail ne la fournit pas.
 */
export function valueRefusal(
  cards: ReadonlyMap<string, MailValueResource>,
  name: string,
  phrasePath: string,
): string | null {
  const card = cards.get(name);
  if (card === undefined) {
    return `Cet e-mail ne fournit pas la valeur {${name}} : elle ne peut aller dans aucune de ses phrases.`;
  }
  if (card.phrases.includes(phrasePath)) {
    return null;
  }
  return `« ${card.label} » ne peut pas aller dans cette phrase : à l’envoi, elle n’y est pas fournie. Posez-la dans une phrase qui la reçoit.`;
}

/**
 * Ce qu'une pastille dit au survol : son nom, ce que c'est, et la valeur
 * qu'elle prend dans le cas affiché (ou l'exemple de la fiche).
 */
export function valueChipTitle(card: MailValueResource, shownValue: string | null): string {
  const example = shownValue === null || shownValue === '' ? card.example : shownValue;
  return `${card.label} — ${card.description}. Exemple : ${example}`;
}

/**
 * Donne à une pastille de valeur (`data-var`) le nom lisible de sa fiche, et
 * la valeur du cas au survol. La valeur rendue par le serveur est gardée une
 * fois (`data-example`) ; une pastille posée à la main n'en a pas, et prend
 * l'exemple de la fiche. Une valeur sans fiche garde ce qu'elle montrait.
 * Le relecteur (`readDictionaryText`) ne lit que `data-var` : `{ref}` reste
 * `{ref}`.
 */
export function labelValueChip(chip: Element, cards: ReadonlyMap<string, MailValueResource>): void {
  const name = chip.getAttribute('data-var');
  const card = name === null ? undefined : cards.get(name);
  if (name === null || card === undefined) {
    return;
  }
  if (!chip.hasAttribute('data-example')) {
    const shown = chip.textContent ?? '';
    chip.setAttribute('data-example', shown === `{${name}}` ? '' : shown);
  }
  chip.textContent = card.label;
  chip.setAttribute('title', valueChipTitle(card, chip.getAttribute('data-example')));
}

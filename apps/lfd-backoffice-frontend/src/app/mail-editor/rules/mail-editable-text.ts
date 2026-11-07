/**
 * **Le texte écrit sur place, relu au format du dictionnaire** (plan
 * `plan-editeur-par-blocs.md`, § 22, S5f) : une zone marquée du canevas
 * (`data-phrase`, `data-free-block`) contient du texte et des pastilles de
 * variables (`data-var`). Relue, une pastille redevient `{nom}` — quelle que
 * soit la valeur d'exemple qu'elle affiche —, un saut de ligne redevient `\n`.
 */

/** Les éléments qu'un navigateur pose pour une nouvelle ligne dans une zone modifiable. */
const LINE_ELEMENTS = new Set(['DIV', 'P']);

function readChildren(node: Node): string {
  let text = '';
  node.childNodes.forEach((child, index) => {
    text += readNode(child, index === 0);
  });
  return text;
}

function readNode(node: Node, first: boolean): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.nodeValue ?? '';
  }
  if (!(node instanceof Element)) {
    return '';
  }
  const variable = node.getAttribute('data-var');
  if (variable !== null) {
    return `{${variable}}`;
  }
  if (node.tagName === 'BR') {
    return '\n';
  }
  const inner = readChildren(node);
  return LINE_ELEMENTS.has(node.tagName) && !first ? `\n${inner}` : inner;
}

/**
 * Le texte d'une zone, au format du dictionnaire. Un `<br>` final que le
 * navigateur laisse dans une zone vidée ne compte pas.
 */
export function readDictionaryText(zone: Node): string {
  return readChildren(zone).replace(/\n$/, '');
}

/**
 * Une pastille de variable : non modifiable (on ne la casse pas en tapant),
 * effacée d'un coup. Elle affiche `{nom}` jusqu'au rendu suivant, qui pose la
 * valeur d'exemple du cas.
 */
export function variableChip(document: Document, name: string): HTMLElement {
  const chip = document.createElement('span');
  chip.setAttribute('data-var', name);
  chip.setAttribute('contenteditable', 'false');
  chip.textContent = `{${name}}`;
  return chip;
}

/** Pose une pastille à l'endroit du curseur (la sélection est d'abord effacée), et place le curseur après. */
export function insertChipAt(range: Range, chip: HTMLElement): void {
  range.deleteContents();
  range.insertNode(chip);
  range.setStartAfter(chip);
  range.collapse(true);
}

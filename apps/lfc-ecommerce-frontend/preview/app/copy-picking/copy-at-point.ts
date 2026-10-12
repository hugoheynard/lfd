import type { CopyMarkers } from './copy-markers';

/** Un texte marqué trouvé sous le pointeur : sa clé, sa boîte, et ce qu'il affiche. */
export interface CopyAtPoint {
  readonly key: string;
  /** La boîte du texte, en coordonnées de la fenêtre. */
  readonly rect: DOMRect;
  /** L'élément qui porte le texte — sa police est reprise par le champ. */
  readonly element: Element;
  /** Le texte affiché, sans marqueurs (variables déjà remplacées). */
  readonly shown: string;
}

/**
 * **Le texte marqué sous le pointeur** — l'appui des indicateurs et de
 * l'édition en place (2026-10-12).
 *
 * Le point désigne un nœud de texte et une position : le marqueur le plus
 * proche AVANT elle ouvre la phrase, le suivant la ferme. La boîte est celle
 * de cette plage (`Range.getBoundingClientRect`), pas de l'élément : un
 * bouton qui porte deux textes en montre deux. Le pointeur doit être DANS la
 * boîte — `caretPositionFromPoint` rend le caret le plus proche même au-dessus
 * du vide. Sans point lisible, le premier marqueur de l'élément visé.
 */
export function copyAtPoint(event: MouseEvent, markers: CopyMarkers): CopyAtPoint | null {
  const target = event.target;
  const document = target instanceof Node ? target.ownerDocument : event.view?.document;
  const caret = document?.caretPositionFromPoint?.(event.clientX, event.clientY) ?? null;
  const node = caret?.offsetNode ?? null;
  if (caret !== null && node !== null && node.nodeType === Node.TEXT_NODE) {
    const text = node.nodeValue ?? '';
    const found = markers.read(text);
    const index = found.filter((marker) => marker.index <= caret.offset).length - 1;
    const marker = found[index];
    const element = node.parentElement;
    if (marker !== undefined && element !== null) {
      const range = node.ownerDocument?.createRange();
      const end = found[index + 1]?.index ?? text.length;
      range?.setStart(node, marker.end);
      range?.setEnd(node, end);
      const rect = boxOf(range, element);
      return contains(rect, event.clientX, event.clientY)
        ? { key: marker.key, rect, element, shown: text.slice(marker.end, end) }
        : null;
    }
  }
  if (!(target instanceof Element)) {
    return null;
  }
  const key = markers.keyAt(target.textContent ?? '', 0);
  return key === null
    ? null
    : {
        key,
        rect: target.getBoundingClientRect(),
        element: target,
        shown: markers.strip(target.textContent ?? ''),
      };
}

/** La boîte de la plage ; celle de l'élément si le navigateur ne sait pas mesurer une plage. */
function boxOf(range: Range | undefined, element: Element): DOMRect {
  return range !== undefined && typeof range.getBoundingClientRect === 'function'
    ? range.getBoundingClientRect()
    : element.getBoundingClientRect();
}

/** Le point est-il dans la boîte ? Une boîte vide (mesure indisponible) ne refuse rien. */
function contains(rect: DOMRect, x: number, y: number): boolean {
  if (rect.width === 0 && rect.height === 0) {
    return true;
  }
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

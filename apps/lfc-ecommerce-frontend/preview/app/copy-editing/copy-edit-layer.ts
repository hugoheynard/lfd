import type { CopyAtPoint } from '../copy-picking/copy-at-point';

/** Ce que le champ reprend de la police du texte qu'il remplace. */
const FONT_PROPERTIES = [
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'line-height',
  'letter-spacing',
] as const;

/** Ce que la couche rapporte de ce qu'on fait dans le champ. */
export interface CopyEditLayerEvents {
  input(text: string): void;
  /** Entrée sans Maj, ou le champ a perdu le focus. */
  done(): void;
  /** Échap. */
  cancel(): void;
}

/**
 * **La couche d'édition de l'aperçu** (2026-10-12) — un calque posé AU-DESSUS
 * de la boutique, hors de son application Angular : le liseré et le crayon du
 * survol, et le champ flottant de l'édition en place.
 *
 * Rien n'y décale la mise en page : tout est positionné en coordonnées du
 * document sur la boîte du texte. Le calque laisse passer le pointeur
 * (`pointer-events: none`, `preview.scss`) ; seul le champ le reçoit.
 *
 * ⚠️ Le champ est un `<textarea>` natif, pas un `fold-textarea` : ce calque
 * vit en dehors de toute application Angular (la boutique est redémarrée à
 * chaque scène, le calque reste). Le texte y est du texte brut — `value`,
 * jamais `innerHTML`.
 */
export class CopyEditLayer {
  private readonly layer: HTMLElement;
  private readonly outline: HTMLElement;
  private readonly editor: HTMLElement;
  private readonly field: HTMLTextAreaElement;
  private readonly refusal: HTMLElement;
  private events: CopyEditLayerEvents | null = null;

  constructor(private readonly document: Document) {
    this.layer = this.element('div', 'preview-copy-layer');
    this.outline = this.element('div', 'preview-copy-outline');
    const pencil = this.element('span', 'preview-copy-pencil');
    pencil.textContent = '✎';
    pencil.setAttribute('aria-hidden', 'true');
    this.outline.append(pencil);
    this.editor = this.element('div', 'preview-copy-editor');
    this.field = this.element('textarea', 'preview-copy-field');
    this.field.setAttribute('aria-label', 'Modifier ce texte');
    this.field.rows = 1;
    this.refusal = this.element('p', 'preview-copy-refusal');
    this.refusal.setAttribute('role', 'status');
    this.editor.append(this.field, this.refusal);
    this.outline.hidden = true;
    this.editor.hidden = true;
    this.refusal.hidden = true;
    this.layer.append(this.outline, this.editor);
    document.body.append(this.layer);
    this.field.addEventListener('input', () => {
      this.fitHeight();
      this.events?.input(this.field.value);
    });
    this.field.addEventListener('keydown', (event) => this.key(event));
    this.field.addEventListener('blur', () => this.events?.done());
  }

  get editing(): boolean {
    return this.events !== null;
  }

  /** L'élément fait-il partie du champ flottant ? (Un clic dedans ne termine rien.) */
  owns(target: EventTarget | null): boolean {
    return target instanceof Node && this.editor.contains(target);
  }

  /** Le liseré et le crayon sur ce texte ; `null` : rien. */
  hover(copy: CopyAtPoint | null): void {
    if (copy === null) {
      this.outline.hidden = true;
      return;
    }
    this.place(this.outline, copy.rect);
    this.outline.style.height = `${copy.rect.height}px`;
    this.outline.hidden = false;
  }

  /** Le champ flottant, ancré sur le texte, pré-rempli de `text`, le focus dedans. */
  open(copy: CopyAtPoint, text: string, events: CopyEditLayerEvents): void {
    this.events = null;
    this.hover(null);
    this.place(this.editor, copy.rect);
    const style = this.document.defaultView?.getComputedStyle(copy.element);
    for (const property of FONT_PROPERTIES) {
      this.field.style.setProperty(property, style?.getPropertyValue(property) ?? '');
    }
    this.field.value = text;
    this.refuse(null);
    this.editor.hidden = false;
    this.fitHeight();
    this.events = events;
    this.field.focus();
    this.field.select();
  }

  /** Ferme le champ, sans rien rapporter. */
  close(): void {
    this.events = null;
    this.editor.hidden = true;
    this.refuse(null);
  }

  /** La raison d'un refus sous le champ ; `null` l'efface. */
  refuse(reason: string | null): void {
    this.refusal.textContent = reason ?? '';
    this.refusal.hidden = reason === null;
  }

  private key(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.events?.done();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.events?.cancel();
    }
  }

  /** En coordonnées du document : le calque défile avec la page. */
  private place(element: HTMLElement, rect: DOMRect): void {
    const view = this.document.defaultView;
    element.style.left = `${rect.left + (view?.scrollX ?? 0)}px`;
    element.style.top = `${rect.top + (view?.scrollY ?? 0)}px`;
    element.style.width = `${rect.width}px`;
  }

  private fitHeight(): void {
    this.field.style.height = 'auto';
    this.field.style.height = `${this.field.scrollHeight}px`;
  }

  private element<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className: string,
  ): HTMLElementTagNameMap[K] {
    const element = this.document.createElement(tag);
    element.className = className;
    return element;
  }
}

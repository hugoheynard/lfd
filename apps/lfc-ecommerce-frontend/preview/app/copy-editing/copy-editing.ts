import type { ShopCopyPreviewShowMessage } from '@lfd/contracts/shop-copy-preview';

import { copyAtPoint, type CopyAtPoint } from '../copy-picking/copy-at-point';
import type { CopyMarkers } from '../copy-picking/copy-markers';
import { CopyEditLayer } from './copy-edit-layer';

type Locale = ShopCopyPreviewShowMessage['locale'];

/** Ce que l'édition en place dit au back-office. */
export interface CopyEditingOutbox {
  pick(key: string): void;
  edit(key: string, locale: Locale, text: string): void;
}

/** Le texte ouvert : sa clé, sa langue, et ce qu'il disait à l'ouverture (pour Échap). */
interface OpenCopy {
  readonly key: string;
  readonly locale: Locale;
  readonly original: string;
  touched: boolean;
}

/**
 * **L'édition en place dans l'aperçu** (2026-10-12, demande de Hugo : « éditer
 * directement sur le preview, avec des indicateurs sur le texte modifiable »).
 *
 * - **Survol** d'un texte marqué : un liseré et un crayon (`CopyEditLayer`).
 * - **Clic** sur un texte marqué : le clic est INTERCEPTÉ — le bouton ou le
 *   lien qui le porte ne part pas —, `pick` part au back-office, et un champ
 *   s'ouvre sur le texte, pré-rempli de sa forme éditable (variables comprises,
 *   marqueurs retirés). Chaque frappe part en `edit` ; Entrée ou un clic
 *   ailleurs termine (sans rien déclencher d'autre) ; Échap renvoie le texte d'avant l'ouverture.
 * - **Alt + clic** navigue : le clic est rejoué SANS la touche, sur la même
 *   cible. Un modificateur plutôt qu'un réglage « Naviguer / Éditer » : rien
 *   à peindre par-dessus la boutique, aucun mode oublié dans le mauvais état.
 *   Et rejoué, parce que tel quel il ne naviguerait pas : `RouterLink` laisse
 *   au navigateur un clic modifié, et sous macOS Alt + clic sur un lien le
 *   TÉLÉCHARGE.
 *
 * L'aperçu ne fait que PROPOSER : le back-office vérifie clé, langue et
 * variables, l'API tranche. Un refus revient en `edit-refused` (`refuse`).
 */
export class CopyEditing {
  private readonly layer: CopyEditLayer;
  private readonly replayed = new WeakSet<Event>();
  private current: OpenCopy | null = null;
  /**
   * Le clic qui suit un appui hors du champ ouvert : l'appui a déjà terminé
   * l'édition (le champ perd le focus avant le clic), le clic ne doit pas
   * partir pour autant.
   */
  private swallowNextClick = false;

  constructor(
    private readonly document: Document,
    private readonly markers: CopyMarkers,
    private readonly outbox: CopyEditingOutbox,
    private readonly locale: () => Locale | null,
  ) {
    this.layer = new CopyEditLayer(document);
  }

  /** Branche le survol et le clic — en capture, avant la boutique. `signal` les débranche. */
  listen(signal?: AbortSignal): void {
    const options = { capture: true, ...(signal === undefined ? {} : { signal }) };
    this.document.addEventListener('mousemove', (event) => this.move(event), options);
    this.document.documentElement.addEventListener(
      'mouseleave',
      () => this.layer.hover(null),
      options,
    );
    this.document.addEventListener('mousedown', (event) => this.press(event), options);
    this.document.addEventListener('click', (event) => this.click(event), options);
  }

  /** Le back-office a refusé ce texte : la raison sous le champ, s'il est encore ouvert. */
  refuse(key: string, reason: string): void {
    if (this.current?.key === key) {
      this.layer.refuse(reason);
    }
  }

  private move(event: MouseEvent): void {
    if (this.layer.editing || event.altKey) {
      this.layer.hover(null);
      return;
    }
    this.layer.hover(copyAtPoint(event, this.markers));
  }

  private press(event: MouseEvent): void {
    this.swallowNextClick = this.layer.editing && !this.layer.owns(event.target);
    if (this.swallowNextClick) {
      this.finish();
    }
  }

  private click(event: MouseEvent): void {
    if (this.replayed.has(event) || this.layer.owns(event.target)) {
      return;
    }
    if (this.swallowNextClick || this.layer.editing) {
      // Un clic ailleurs termine l'édition — et ne déclenche rien d'autre.
      this.swallowNextClick = false;
      swallow(event);
      this.finish();
      return;
    }
    if (event.altKey) {
      swallow(event);
      this.replay(event);
      return;
    }
    const copy = copyAtPoint(event, this.markers);
    const locale = this.locale();
    if (copy === null || locale === null) {
      return;
    }
    swallow(event);
    this.outbox.pick(copy.key);
    this.open(copy, locale);
  }

  private open(copy: CopyAtPoint, locale: Locale): void {
    const original = this.markers.sourceOf(copy.key) ?? this.markers.strip(copy.shown);
    const current: OpenCopy = { key: copy.key, locale, original, touched: false };
    this.current = current;
    this.layer.open(copy, original, {
      input: (text) => {
        current.touched = true;
        this.layer.refuse(null);
        this.outbox.edit(current.key, current.locale, text);
      },
      done: () => this.finish(),
      cancel: () => {
        if (current.touched) {
          this.outbox.edit(current.key, current.locale, current.original);
        }
        this.finish();
      },
    });
  }

  private finish(): void {
    this.current = null;
    this.layer.close();
  }

  /** Le même clic, sans Alt, sur la même cible — celui-là, on le laisse passer. */
  private replay(event: MouseEvent): void {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    const clean = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX: event.clientX,
      clientY: event.clientY,
      button: event.button,
      view: event.view,
    });
    this.replayed.add(clean);
    target.dispatchEvent(clean);
  }
}

function swallow(event: Event): void {
  event.preventDefault();
  event.stopImmediatePropagation();
}

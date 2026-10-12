import { overlayCopy } from '../../../src/app/client/copy/shop-copy-overlay';
import { CopyMarkers } from '../copy-picking/copy-markers';
import { CopyEditing } from './copy-editing';

const RECT = { left: 10, top: 20, right: 210, bottom: 40, width: 200, height: 20, x: 10, y: 20 };

/**
 * Un bouton qui porte le texte marqué d'une clé à variable — l'écran montre
 * « 3 articles », l'éditeur connaît « {n} articles ».
 */
let stop = new AbortController();

function setup() {
  const markers = new CopyMarkers();
  const base = { cart: { count: '{n} articles' } };
  const marked = overlayCopy(base, markers.markAll(base));
  document.body.innerHTML = '<app-root><button type="button"></button></app-root>';
  const button = document.querySelector('button');
  if (button === null) {
    throw new Error('bouton absent');
  }
  button.textContent = marked.cart.count.replace('{n}', '3');
  const navigated = vi.fn();
  button.addEventListener('click', navigated);
  const text = button.firstChild;
  // jsdom ne sait ni pointer un caret, ni mesurer une plage (la boîte de l'élément
  // la remplace, comme dans un navigateur qui ne saurait pas) : on les joue.
  Object.assign(document, {
    caretPositionFromPoint: () => ({ offsetNode: text, offset: 6 }),
  });
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    ...RECT,
    toJSON: () => RECT,
  });
  const outbox = { pick: vi.fn(), edit: vi.fn() };
  const editing = new CopyEditing(document, markers, outbox, () => 'fr');
  stop = new AbortController();
  editing.listen(stop.signal);
  const at = (init: MouseEventInit = {}) => ({
    clientX: 50,
    clientY: 30,
    bubbles: true,
    cancelable: true,
    ...init,
  });
  return {
    button,
    navigated,
    outbox,
    editing,
    at,
    field: () => document.querySelector<HTMLTextAreaElement>('.preview-copy-field'),
    editor: () => document.querySelector<HTMLElement>('.preview-copy-editor'),
    outline: () => document.querySelector<HTMLElement>('.preview-copy-outline'),
  };
}

function type(field: HTMLTextAreaElement | null, text: string): void {
  if (field === null) {
    throw new Error('champ absent');
  }
  field.value = text;
  field.dispatchEvent(new Event('input'));
}

describe('l’édition en place dans l’aperçu', () => {
  afterEach(() => {
    stop.abort();
    vi.restoreAllMocks();
    Reflect.deleteProperty(document, 'caretPositionFromPoint');
  });

  it('au survol d’un texte marqué, pose le liseré sur sa boîte', () => {
    const { button, at, outline } = setup();
    expect(outline()?.hidden).toBe(true);
    button.dispatchEvent(new MouseEvent('mousemove', at()));
    expect(outline()?.hidden).toBe(false);
    expect(outline()?.style.left).toBe('10px');
    expect(outline()?.style.width).toBe('200px');
  });

  it('pas de liseré quand le pointeur est hors de la boîte du texte', () => {
    const { button, at, outline } = setup();
    button.dispatchEvent(new MouseEvent('mousemove', at({ clientX: 500 })));
    expect(outline()?.hidden).toBe(true);
  });

  it('un clic intercepte le bouton, envoie pick, et ouvre le champ pré-rempli sans marqueurs', () => {
    const { button, at, navigated, outbox, field, editor } = setup();
    button.dispatchEvent(new MouseEvent('click', at()));
    expect(navigated).not.toHaveBeenCalled();
    expect(outbox.pick).toHaveBeenCalledWith('cart.count');
    expect(editor()?.hidden).toBe(false);
    // Le texte éditable, variable comprise — pas « 3 articles », et aucun caractère invisible.
    expect(field()?.value).toBe('{n} articles');
  });

  it('chaque frappe part en edit, avec la langue affichée', () => {
    const { button, at, outbox, field } = setup();
    button.dispatchEvent(new MouseEvent('click', at()));
    type(field(), '{n} pains');
    expect(outbox.edit).toHaveBeenLastCalledWith('cart.count', 'fr', '{n} pains');
  });

  it('Échap renvoie le texte d’avant l’ouverture, et ferme', () => {
    const { button, at, outbox, field, editor } = setup();
    button.dispatchEvent(new MouseEvent('click', at()));
    type(field(), '{n} pains');
    field()?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
    expect(outbox.edit).toHaveBeenLastCalledWith('cart.count', 'fr', '{n} articles');
    expect(editor()?.hidden).toBe(true);
  });

  it('Entrée termine ; un clic ailleurs termine sans déclencher le bouton', () => {
    const { button, at, navigated, field, editor } = setup();
    button.dispatchEvent(new MouseEvent('click', at()));
    field()?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }));
    expect(editor()?.hidden).toBe(true);
    button.dispatchEvent(new MouseEvent('click', at()));
    button.dispatchEvent(new MouseEvent('mousedown', at()));
    button.dispatchEvent(new MouseEvent('click', at()));
    expect(editor()?.hidden).toBe(true);
    expect(navigated).not.toHaveBeenCalled();
  });

  it('Alt + clic navigue : le clic rejoué sans Alt atteint le bouton, sans champ ni pick', () => {
    const { button, at, navigated, outbox, editor } = setup();
    button.dispatchEvent(new MouseEvent('click', at({ altKey: true })));
    expect(navigated).toHaveBeenCalledTimes(1);
    expect(navigated.mock.calls[0]?.[0]).toMatchObject({ altKey: false });
    expect(outbox.pick).not.toHaveBeenCalled();
    expect(editor()?.hidden).toBe(true);
  });

  it('un refus de l’éditeur s’affiche sous le champ, et s’efface à la frappe suivante', () => {
    const { button, at, editing, field } = setup();
    button.dispatchEvent(new MouseEvent('click', at()));
    editing.refuse('cart.count', 'Il faut garder {n}');
    const refusal = document.querySelector<HTMLElement>('.preview-copy-refusal');
    expect(refusal?.hidden).toBe(false);
    expect(refusal?.textContent).toBe('Il faut garder {n}');
    type(field(), '{n} pains');
    expect(refusal?.hidden).toBe(true);
  });
});

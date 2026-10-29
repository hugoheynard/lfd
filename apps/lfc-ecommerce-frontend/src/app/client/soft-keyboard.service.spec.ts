import { opensSoftKeyboard } from './soft-keyboard.service';

function input(type: string, readOnly = false): HTMLInputElement {
  const element = document.createElement('input');
  element.type = type;
  element.readOnly = readOnly;
  return element;
}

describe('opensSoftKeyboard — ce champ ouvre-t-il le clavier de l’appareil', () => {
  it('oui pour un champ texte, un nombre, un e-mail ou une zone de texte', () => {
    expect(opensSoftKeyboard(input('text'))).toBe(true);
    expect(opensSoftKeyboard(input('number'))).toBe(true);
    expect(opensSoftKeyboard(input('email'))).toBe(true);
    expect(opensSoftKeyboard(document.createElement('textarea'))).toBe(true);
  });

  it('non pour une case, un bouton radio ou un bouton', () => {
    expect(opensSoftKeyboard(input('checkbox'))).toBe(false);
    expect(opensSoftKeyboard(input('radio'))).toBe(false);
    expect(opensSoftKeyboard(input('submit'))).toBe(false);
    expect(opensSoftKeyboard(document.createElement('button'))).toBe(false);
  });

  it('non pour un champ en lecture seule, ni sans cible', () => {
    expect(opensSoftKeyboard(input('text', true))).toBe(false);
    expect(opensSoftKeyboard(null)).toBe(false);
  });
});

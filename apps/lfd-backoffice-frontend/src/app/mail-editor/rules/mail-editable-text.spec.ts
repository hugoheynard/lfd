import { describe, expect, it } from 'vitest';

import { insertChipAt, readDictionaryText, variableChip } from './mail-editable-text';

function zone(html: string): HTMLElement {
  const element = document.createElement('span');
  element.innerHTML = html;
  return element;
}

describe('readDictionaryText — le texte relu au format du dictionnaire', () => {
  it('une pastille redevient {nom}, quelle que soit sa valeur d’exemple', () => {
    expect(
      readDictionaryText(zone('Votre commande <span data-var="ref">EXEMPLE-0001</span> est prête')),
    ).toBe('Votre commande {ref} est prête');
  });

  it('deux pastilles collées, en tête et en fin', () => {
    expect(
      readDictionaryText(
        zone(
          '<span data-var="a">1</span><span data-var="b">2</span> fin <span data-var="c"></span>',
        ),
      ),
    ).toBe('{a}{b} fin {c}');
  });

  it('garde les sauts de ligne du texte et lit un <br> comme un saut', () => {
    expect(readDictionaryText(zone('Bonjour,\n\nmerci'))).toBe('Bonjour,\n\nmerci');
    expect(readDictionaryText(zone('Bonjour,<br>merci'))).toBe('Bonjour,\nmerci');
  });

  it('lit les lignes qu’un navigateur pose en <div>', () => {
    expect(readDictionaryText(zone('Un<div>Deux</div><div>Trois</div>'))).toBe('Un\nDeux\nTrois');
    expect(readDictionaryText(zone('<div>Seul</div>'))).toBe('Seul');
  });

  it('ignore le <br> final d’une zone vidée', () => {
    expect(readDictionaryText(zone('<br>'))).toBe('');
    expect(readDictionaryText(zone('texte<br>'))).toBe('texte');
  });

  it('lit le texte d’un élément de mise en forme sans le garder', () => {
    expect(readDictionaryText(zone('a <strong>gras <span data-var="x">v</span></strong> b'))).toBe(
      'a gras {x} b',
    );
  });

  it('garde les espaces insécables, qui sont de la typographie', () => {
    expect(readDictionaryText(zone('Prête !'))).toBe('Prête !');
  });

  it('les accolades tapées restent telles quelles : le serveur juge', () => {
    expect(readDictionaryText(zone('{inconnu} et {ref'))).toBe('{inconnu} et {ref');
  });
});

describe('variableChip et insertChipAt', () => {
  it('une pastille non modifiable, relue en {nom}', () => {
    const chip = variableChip(document, 'firstName');
    expect(chip.getAttribute('contenteditable')).toBe('false');
    expect(chip.getAttribute('data-var')).toBe('firstName');
    expect(readDictionaryText(zone(chip.outerHTML))).toBe('{firstName}');
  });

  it('s’insère au curseur, en remplaçant la sélection', () => {
    const element = zone('Bonjour Jeanne !');
    document.body.append(element);
    const text = element.firstChild as Text;
    const range = document.createRange();
    range.setStart(text, 8);
    range.setEnd(text, 14);
    insertChipAt(range, variableChip(document, 'firstName'));
    expect(readDictionaryText(element)).toBe('Bonjour {firstName} !');
    expect(range.collapsed).toBe(true);
    element.remove();
  });
});

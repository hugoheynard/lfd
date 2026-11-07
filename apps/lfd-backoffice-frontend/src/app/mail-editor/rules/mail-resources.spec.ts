import type { MailValueResource } from '@lfd/mail-blocks';
import { describe, expect, it } from 'vitest';

import { readDictionaryText } from './mail-editable-text';
import {
  EMPTY_MAIL_RESOURCES,
  labelValueChip,
  valueCardsByName,
  valueRefusal,
} from './mail-resources';

const REF: MailValueResource = {
  name: 'ref',
  label: 'Référence de commande',
  description: 'le numéro de la commande',
  example: 'ORD-4812',
  phrases: ['subject', 'title.ready'],
};
const CARDS = valueCardsByName({ ...EMPTY_MAIL_RESOURCES, values: [REF] });

describe('Les ressources d’un e-mail, lues par l’éditeur', () => {
  it('accepte une valeur dans une phrase qui la reçoit', () => {
    expect(valueRefusal(CARDS, 'ref', 'title.ready')).toBeNull();
  });

  it('refuse une valeur dans une autre phrase, en la nommant par sa fiche', () => {
    expect(valueRefusal(CARDS, 'ref', 'intro')).toContain('« Référence de commande »');
  });

  it('refuse une valeur que l’e-mail ne fournit pas', () => {
    expect(valueRefusal(CARDS, 'firstName', 'subject')).toContain('{firstName}');
  });

  it('nomme une pastille rendue, garde sa valeur au survol, et relit toujours {ref}', () => {
    const zone = document.createElement('span');
    zone.innerHTML = 'Commande <span data-var="ref">EX-1</span> prête';
    const chip = zone.querySelector('[data-var]');
    if (chip === null) {
      throw new Error('pastille absente');
    }
    labelValueChip(chip, CARDS);
    labelValueChip(chip, CARDS);
    expect(chip.textContent).toBe('Référence de commande');
    expect(chip.getAttribute('title')).toContain('Exemple : EX-1');
    expect(readDictionaryText(zone)).toBe('Commande {ref} prête');
  });

  it('une pastille posée à la main prend l’exemple de la fiche', () => {
    const chip = document.createElement('span');
    chip.setAttribute('data-var', 'ref');
    chip.textContent = '{ref}';
    labelValueChip(chip, CARDS);
    expect(chip.getAttribute('title')).toContain('Exemple : ORD-4812');
  });

  it('une valeur sans fiche garde ce qu’elle montrait', () => {
    const chip = document.createElement('span');
    chip.setAttribute('data-var', 'inconnue');
    chip.textContent = 'X';
    labelValueChip(chip, CARDS);
    expect(chip.textContent).toBe('X');
  });
});

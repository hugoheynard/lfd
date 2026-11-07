import { TestBed } from '@angular/core/testing';
import type { MailValueResource } from '@lfd/mail-blocks';
import { describe, expect, it } from 'vitest';

import {
  type FreeBlockInput,
  MailBlockFragment,
  type PhraseInput,
  VARIABLE_DRAG_TYPE,
} from './mail-block-fragment';

const REF: MailValueResource = {
  name: 'ref',
  label: 'Référence de commande',
  description: 'le numéro de la commande',
  example: 'ORD-4812',
  phrases: ['subject'],
};
const FIRST_NAME: MailValueResource = {
  name: 'firstName',
  label: 'Prénom du destinataire',
  description: 'le prénom de la personne',
  example: 'Camille',
  phrases: ['greeting'],
};
const VALUES = new Map([
  ['ref', REF],
  ['firstName', FIRST_NAME],
]);

/** Un dépôt de valeur glissée : l'environnement de test n'a pas de `DragEvent` avec données. */
function dropOf(name: string): Event {
  const event = new Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', {
    value: {
      types: [VARIABLE_DRAG_TYPE],
      getData: (type: string) => (type === VARIABLE_DRAG_TYPE ? name : ''),
    },
  });
  return event;
}

const BODY =
  '<p><span data-phrase="subject">Votre commande <span data-var="ref">EXEMPLE-0001</span> est prête</span> <span data-phrase="inconnue">x</span></p><p><span data-free-block="libre-1" data-locale="fr">Bon appétit</span></p><a href="https://exemple.invalid">lien</a>';

function render(html: string, canWrite = true) {
  const fixture = TestBed.createComponent(MailBlockFragment);
  fixture.componentRef.setInput('html', html);
  fixture.componentRef.setInput('canWrite', canWrite);
  fixture.componentRef.setInput('phrasePaths', new Set(['subject']));
  fixture.componentRef.setInput('freeBlockIds', new Set(['libre-1']));
  fixture.componentRef.setInput('values', VALUES);
  fixture.detectChanges();
  const phrases: PhraseInput[] = [];
  const freeBlocks: FreeBlockInput[] = [];
  const refusals: string[] = [];
  fixture.componentInstance.phraseInput.subscribe((value) => phrases.push(value));
  fixture.componentInstance.freeBlockInput.subscribe((value) => freeBlocks.push(value));
  fixture.componentInstance.valueRefused.subscribe((value) => refusals.push(value));
  const element: HTMLElement = fixture.nativeElement;
  document.body.append(element);
  return { fixture, element, phrases, freeBlocks, refusals };
}

describe('MailBlockFragment — un fragment écrit sur place', () => {
  it('rend modifiables les seules zones connues, les variables en pastilles', () => {
    const { element } = render(BODY);
    expect(element.querySelector('[data-phrase="subject"]')?.getAttribute('contenteditable')).toBe(
      'plaintext-only',
    );
    expect(element.querySelector('[data-phrase="inconnue"]')?.hasAttribute('contenteditable')).toBe(
      false,
    );
    expect(element.querySelector('[data-free-block]')?.getAttribute('contenteditable')).toBe(
      'plaintext-only',
    );
    expect(element.querySelector('[data-var]')?.getAttribute('contenteditable')).toBe('false');
    element.remove();
  });

  it('sans le droit d’écrire, rien n’est modifiable', () => {
    const { element } = render(BODY, false);
    expect(element.querySelector('[contenteditable="plaintext-only"]')).toBeNull();
    element.remove();
  });

  it('relit une phrase au format du dictionnaire, et un bloc libre avec sa langue', () => {
    const { element, phrases, freeBlocks } = render(BODY);
    const zone = element.querySelector('[data-phrase="subject"]');
    zone?.dispatchEvent(new Event('input', { bubbles: true }));
    expect(phrases).toEqual([{ path: 'subject', text: 'Votre commande {ref} est prête' }]);
    const free = element.querySelector('[data-free-block]');
    if (free !== null) {
      free.textContent = 'Bonne dégustation';
    }
    free?.dispatchEvent(new Event('input', { bubbles: true }));
    expect(freeBlocks).toEqual([{ blockId: 'libre-1', locale: 'fr', text: 'Bonne dégustation' }]);
    element.remove();
  });

  it('recadre en CSS une image qui porte un format, pas l’originale', () => {
    const { element } = render(
      '<img src="https://m.fr/a.webp" alt="" data-image-format="2:1" data-image-focal-x="0.2" data-image-focal-y="0.8" />' +
        '<img src="https://m.fr/b.webp" alt="" data-plain />',
    );
    const framed = element.querySelector<HTMLImageElement>('img[data-image-format]')!;
    expect(framed.style.aspectRatio).toBe('2');
    expect(framed.style.objectFit).toBe('cover');
    expect(framed.style.objectPosition).toBe('20% 80%');
    expect(element.querySelector<HTMLImageElement>('img[data-plain]')!.style.objectFit).toBe('');
    element.remove();
  });

  it('refuse d’injecter un fragment dangereux, et le dit', () => {
    const { element } = render('<img src="x" onerror="alert(1)">');
    expect(element.querySelector('img')).toBeNull();
    expect(element.querySelector('[data-unsafe-fragment]')).not.toBeNull();
    element.remove();
  });

  it('ne remplace pas le fragment qui a le focus, puis le pose quand le focus part', () => {
    const { fixture, element } = render(BODY);
    const zone = element.querySelector<HTMLElement>('[data-phrase="subject"]');
    zone?.setAttribute('tabindex', '0');
    zone?.focus();
    expect(document.activeElement).toBe(zone);
    fixture.componentRef.setInput('html', '<p><span data-phrase="subject">Nouveau</span></p>');
    fixture.detectChanges();
    expect(element.querySelector('[data-phrase="subject"]')).toBe(zone);
    zone?.blur();
    zone?.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    expect(element.querySelector('[data-phrase="subject"]')?.textContent).toBe('Nouveau');
    element.remove();
  });

  it('n’ouvre pas les liens de l’e-mail', () => {
    const { element } = render(BODY);
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    element.querySelector('a')?.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
    element.remove();
  });

  it('une pastille montre le nom lisible de sa fiche, la valeur du cas au survol', () => {
    const { element } = render(BODY);
    const chip = element.querySelector('[data-var="ref"]');
    expect(chip?.textContent).toBe('Référence de commande');
    expect(chip?.getAttribute('title')).toContain('EXEMPLE-0001');
    expect(chip?.getAttribute('title')).toContain('le numéro de la commande');
    element.remove();
  });

  it('relit toujours {ref}, quel que soit le nom que la pastille affiche', () => {
    const { element, phrases } = render(BODY);
    element
      .querySelector('[data-phrase="subject"]')
      ?.dispatchEvent(new Event('input', { bubbles: true }));
    expect(phrases).toEqual([{ path: 'subject', text: 'Votre commande {ref} est prête' }]);
    element.remove();
  });

  it('pose une valeur déposée dans une phrase qui la reçoit, en pastille lisible', () => {
    const { element, phrases, refusals } = render(BODY);
    const zone = element.querySelector('[data-phrase="subject"]');
    zone?.dispatchEvent(dropOf('ref'));
    expect(refusals).toEqual([]);
    expect(phrases.at(-1)?.text).toBe('Votre commande {ref} est prête{ref}');
    expect(zone?.lastElementChild?.textContent).toBe('Référence de commande');
    element.remove();
  });

  it('refuse une valeur déposée dans une phrase qui ne la reçoit pas, et le dit', () => {
    const { element, phrases, refusals } = render(BODY);
    const zone = element.querySelector('[data-phrase="subject"]');
    const drop = dropOf('firstName');
    zone?.dispatchEvent(drop);
    expect(drop.defaultPrevented).toBe(true);
    expect(phrases).toEqual([]);
    expect(zone?.querySelector('[data-var="firstName"]')).toBeNull();
    expect(refusals).toHaveLength(1);
    expect(refusals[0]).toContain('« Prénom du destinataire » ne peut pas aller dans cette phrase');
    element.remove();
  });
});

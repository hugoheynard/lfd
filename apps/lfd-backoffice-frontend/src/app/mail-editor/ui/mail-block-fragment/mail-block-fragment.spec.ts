import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { type FreeBlockInput, MailBlockFragment, type PhraseInput } from './mail-block-fragment';

const BODY =
  '<p><span data-phrase="subject">Votre commande <span data-var="ref">EXEMPLE-0001</span> est prête</span> <span data-phrase="inconnue">x</span></p><p><span data-free-block="libre-1" data-locale="fr">Bon appétit</span></p><a href="https://exemple.invalid">lien</a>';

function render(html: string, canWrite = true) {
  const fixture = TestBed.createComponent(MailBlockFragment);
  fixture.componentRef.setInput('html', html);
  fixture.componentRef.setInput('canWrite', canWrite);
  fixture.componentRef.setInput('phrasePaths', new Set(['subject']));
  fixture.componentRef.setInput('freeBlockIds', new Set(['libre-1']));
  fixture.detectChanges();
  const phrases: PhraseInput[] = [];
  const freeBlocks: FreeBlockInput[] = [];
  fixture.componentInstance.phraseInput.subscribe((value) => phrases.push(value));
  fixture.componentInstance.freeBlockInput.subscribe((value) => freeBlocks.push(value));
  const element: HTMLElement = fixture.nativeElement;
  document.body.append(element);
  return { fixture, element, phrases, freeBlocks };
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
});

import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import type { ContactBandCopy } from '../../copy/screens/accueil-public.copy';
import { ContactBand } from './contact-band';

const COPY: ContactBandCopy = {
  kicker: 'On répond',
  title: 'Une question,\nun imprévu ?',
  who: 'Camille et Malik, au Labo, de 7 h à 19 h.',
  call: 'Appeler',
  write: 'Écrire',
  note: 'Entre 12 h et 14 h on est au four.',
};

function boot(copy: ContactBandCopy = COPY): ComponentFixture<ContactBand> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [ContactBand] });
  const fixture = TestBed.createComponent(ContactBand);
  fixture.componentRef.setInput('copy', copy);
  fixture.detectChanges();
  return fixture;
}

const text = (fixture: ComponentFixture<ContactBand>, selector: string): string | undefined =>
  (fixture.nativeElement as HTMLElement).querySelector(selector)?.textContent?.trim();

describe('ContactBand', () => {
  it('dit tout ce qu’on lui passe, et rien d’autre', () => {
    const fixture = boot();

    expect(text(fixture, '.kicker')).toBe(COPY.kicker);
    expect(text(fixture, '.who')).toBe(COPY.who);
    expect(text(fixture, '.call')).toBe(COPY.call);
    expect(text(fixture, '.write')).toBe(COPY.write);
    expect(text(fixture, '.note')).toBe(COPY.note);
  });

  /**
   * Régression : la coupe du titre vient du DICTIONNAIRE et non d'un `<br>` —
   * une traduction n'a pas à connaître le HTML, et l'italien ne se plie pas où
   * le français se plie. Le rendu garde donc le saut de ligne tel quel.
   */
  it('garde la coupe de ligne que la copie porte', () => {
    const titre = (boot().nativeElement as HTMLElement).querySelector('.title');

    expect(titre?.textContent).toBe(COPY.title);
    expect(titre?.querySelector('br')).toBeNull();
  });

  /**
   * 🔴 Les deux liens sont de VRAIS liens `tel:` / `mailto:`, pas des boutons
   * qui appelleraient `window.open` : sur un téléphone, c'est le système qui
   * doit décider ce qu'il fait d'un numéro.
   */
  it('appelle et écrit par les protocoles, pas par du script', () => {
    const band = boot().nativeElement as HTMLElement;

    expect(band.querySelector('.call')?.getAttribute('href')).toBe('tel:+33479061240');
    expect(band.querySelector('.write')?.getAttribute('href')).toBe(
      'mailto:contact@lafoliecoffee.fr',
    );
  });

  /**
   * La bande ne sait pas à qui elle parle : c'est l'écran qui choisit la
   * variante. Changer la copie change donc tout ce qu'elle dit, sans classe ni
   * drapeau d'état à l'intérieur.
   */
  it('change de propos avec sa copie, sans rien décider', () => {
    const fixture = boot({ ...COPY, title: 'Une commande\nparticulière ?', who: 'Un buffet ?' });

    expect(text(fixture, '.who')).toBe('Un buffet ?');
    expect(text(fixture, '.kicker')).toBe(COPY.kicker);
  });
});

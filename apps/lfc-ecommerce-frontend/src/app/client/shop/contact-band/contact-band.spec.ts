import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { FoldPanelHostService } from 'fold-ng';
import { describe, expect, it, vi } from 'vitest';

import type { ContactBandCopy } from '../../copy/screens/accueil-public.copy';
import { ContactDialog } from '../contact-dialog/contact-dialog';
import { ContactBand } from './contact-band';

const COPY: ContactBandCopy = {
  kicker: 'On répond',
  phones: [{ label: '', number: '+33 4 79 06 12 40' }],
  title: 'Une question,\nun imprévu ?',
  who: 'Camille et Malik, au Labo, de 7 h à 19 h.',
  call: 'Appeler',
  write: 'Écrire',
};

let opened: unknown[];

function boot(copy: ContactBandCopy = COPY): ComponentFixture<ContactBand> {
  opened = [];
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [ContactBand],
    providers: [
      {
        provide: FoldPanelHostService,
        useValue: { open: vi.fn((component: unknown) => opened.push(component)) },
      },
    ],
  });
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
    expect(text(fixture, '.call .number')).toBe('+33 4 79 06 12 40');
    expect(text(fixture, '.write')).toBe(COPY.write);
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
   * 🔴 Appeler reste un VRAI lien `tel:`, pas un bouton qui appellerait
   * `window.open` : sur un téléphone, c'est le système qui décide ce qu'il fait
   * d'un numéro. Le numéro composé est celui qu'on lit, sans ses espaces.
   */
  it('appelle par le protocole, le numéro qu’elle affiche', () => {
    const band = boot().nativeElement as HTMLElement;

    expect(band.querySelector('.call')?.getAttribute('href')).toBe('tel:+33479061240');
  });

  it('un bouton par numéro, libellé, le premier seul en plein', () => {
    const band = boot({
      ...COPY,
      phones: [
        { label: 'Service commercial', number: '04 79 00 00 01' },
        { label: 'Boutique de Val d’Isère', number: '04 79 00 00 02' },
      ],
    }).nativeElement as HTMLElement;
    const calls = Array.from(band.querySelectorAll('a.call'));

    expect(calls.map((a) => a.getAttribute('href'))).toEqual(['tel:0479000001', 'tel:0479000002']);
    expect(calls[0]?.textContent).toContain('Service commercial');
    expect(calls.map((a) => a.classList.contains('more'))).toEqual([false, true]);
  });

  /** « Écrire » n'est plus un `mailto:` : il ouvre le dialogue « Nous écrire ». */
  it('écrit par le dialogue, pas par la messagerie du poste', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    const band = boot().nativeElement as HTMLElement;
    const write = band.querySelector<HTMLButtonElement>('button.write');

    expect(write?.getAttribute('href')).toBeNull();
    write?.click();
    expect(opened).toEqual([ContactDialog]);
    vi.unstubAllGlobals();
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

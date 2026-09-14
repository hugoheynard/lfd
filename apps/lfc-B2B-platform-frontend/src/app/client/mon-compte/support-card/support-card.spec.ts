import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FoldPanelHostService } from 'fold-ng';

import { ClientContent } from '../../client-content.service';
import { FR } from '../../copy/fr';
import type { PublishedReach } from '../../support-channels';
import { SupportPanel } from '../support-panel/support-panel';
import { SupportCard } from './support-card';

/** Le contact décidé le 2026-09-14 : une adresse, pas de téléphone pour le moment. */
const CELINE: PublishedReach = {
  phone: '',
  phoneHref: '',
  email: 'celine@lafoliedouce.com',
};

let opened: unknown[] = [];

function boot(reach: PublishedReach): ComponentFixture<SupportCard> {
  opened = [];
  // L'environnement de test n'a pas `matchMedia`, que le côté d'ouverture lit au clic.
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (): Pick<MediaQueryList, 'matches'> => ({ matches: true }),
  });
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [SupportCard],
    providers: [
      // La carte lit le CONTACT COMMERCIAL : l'identité du pied de page n'est pas fournie.
      { provide: ClientContent, useValue: { commercialContact: signal(reach) } },
      {
        provide: FoldPanelHostService,
        useValue: {
          open: (component: unknown): void => {
            opened.push(component);
          },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(SupportCard);
  fixture.detectChanges();
  return fixture;
}

describe('SupportCard', () => {
  describe('au bureau', () => {
    it('montre l’adresse sous le titre, en lien mailto, sans dialogue ni téléphone vide', () => {
      const el = boot(CELINE).nativeElement as HTMLElement;
      const desk = el.querySelector('fold-card.desk');

      expect(desk?.textContent).toContain(FR.account.supportTitle);
      expect(desk?.querySelector('a.email')?.getAttribute('href')).toBe(
        'mailto:celine@lafoliedouce.com',
      );
      expect(desk?.querySelector('a.email')?.textContent?.trim()).toBe('celine@lafoliedouce.com');
      // Pas de téléphone renseigné : pas de lien vide.
      expect(desk?.querySelector('a.phone')).toBeNull();
      // Une carte qui contient des liens n'est pas un bouton.
      expect(desk?.getAttribute('role')).not.toBe('button');

      desk?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(opened).toEqual([]);
    });

    it('donne aussi le téléphone quand il est renseigné', () => {
      const el = boot({ ...CELINE, phone: '04 79 06 12 40', phoneHref: 'tel:+33479061240' })
        .nativeElement as HTMLElement;
      expect(el.querySelector('fold-card.desk a.phone')?.getAttribute('href')).toBe(
        'tel:+33479061240',
      );
    });
  });

  describe('en pile', () => {
    it('dit le geste, sans coordonnées, et ouvre le panneau du service commercial', () => {
      const fixture = boot(CELINE);
      const mobile = (fixture.nativeElement as HTMLElement).querySelector('fold-card.mobile');

      expect(mobile?.textContent).toContain(FR.account.supportTitle);
      expect(mobile?.querySelector('a')).toBeNull();
      mobile?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(opened).toEqual([SupportPanel]);
    });
  });

  it('se tait sans aucun canal', () => {
    const el = boot({ phone: '', phoneHref: '', email: '' }).nativeElement as HTMLElement;
    expect(el.querySelector('fold-card')).toBeNull();
  });
});

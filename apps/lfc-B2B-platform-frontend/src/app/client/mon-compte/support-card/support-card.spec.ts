import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FoldPanelHostService } from 'fold-ng';

import { ClientContent } from '../../client-content.service';
import { FR } from '../../copy/fr';
import type { PublishedReach } from '../../support-channels';
import { SupportPanel } from '../support-panel/support-panel';
import { SupportCard } from './support-card';

const PUBLISHED: PublishedReach = {
  phone: '04 79 06 12 40',
  phoneHref: 'tel:+33479061240',
  email: 'contact@lafoliecoffee.fr',
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
      { provide: ClientContent, useValue: { identity: signal(reach) } },
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
  it('dit le geste, sans coordonnées', () => {
    const el = boot(PUBLISHED).nativeElement as HTMLElement;

    expect(el.textContent).toContain(FR.account.supportTitle);
    expect(el.querySelector('fold-card')?.classList.contains('contact')).toBe(true);
    // Les coordonnées vivent dans le panneau : la carte reste courte.
    expect(el.querySelector('a')).toBeNull();
  });

  it('ouvre le panneau du service commercial', () => {
    const fixture = boot(PUBLISHED);
    (fixture.nativeElement as HTMLElement)
      .querySelector('fold-card')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(opened).toEqual([SupportPanel]);
  });

  it('se tait sans aucun canal publié', () => {
    const el = boot({ phone: '', phoneHref: '', email: '' }).nativeElement as HTMLElement;
    expect(el.querySelector('fold-card')).toBeNull();
  });
});

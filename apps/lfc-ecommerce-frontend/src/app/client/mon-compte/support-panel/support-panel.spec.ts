import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FoldPanelRef } from 'fold-ng';

import { ClientContent } from '../../client-content.service';
import type { PublishedReach } from '../../support-channels';
import { SupportPanel } from './support-panel';

const PUBLISHED: PublishedReach = {
  phone: '04 79 06 12 40',
  phoneHref: 'tel:+33479061240',
  email: 'contact@lafoliecoffee.fr',
};

function boot(reach: PublishedReach): ComponentFixture<SupportPanel> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [SupportPanel],
    providers: [
      { provide: ClientContent, useValue: { commercialContact: signal(reach) } },
      { provide: FoldPanelRef, useValue: { close: (): void => undefined } },
    ],
  });
  const fixture = TestBed.createComponent(SupportPanel);
  fixture.detectChanges();
  return fixture;
}

describe('SupportPanel', () => {
  it('donne le numéro et l’adresse du CONTACT COMMERCIAL, en liens composables avec leur icône', () => {
    const el = boot(PUBLISHED).nativeElement as HTMLElement;

    const phone = el.querySelector<HTMLAnchorElement>('a.phone');
    expect(phone?.getAttribute('href')).toBe('tel:+33479061240');
    expect(phone?.querySelector('fold-icon[name="phone"]')).not.toBeNull();

    const email = el.querySelector<HTMLAnchorElement>('a.email');
    expect(email?.getAttribute('href')).toBe('mailto:contact@lafoliecoffee.fr');
    expect(email?.querySelector('fold-icon[name="mail"]')).not.toBeNull();
  });

  it('compose le lien depuis le numéro quand le lien n’est pas saisi', () => {
    const el = boot({ ...PUBLISHED, phoneHref: '' }).nativeElement as HTMLElement;
    expect(el.querySelector('a.phone')?.getAttribute('href')).toBe('tel:0479061240');
  });

  it('retire un canal non renseigné', () => {
    const el = boot({ ...PUBLISHED, email: '' }).nativeElement as HTMLElement;
    expect(el.querySelector('a.email')).toBeNull();
    expect(el.querySelector('a.phone')).not.toBeNull();
  });
});

import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ClientContent } from '../../client-content.service';
import { FR } from '../../copy/fr';
import { SupportCard } from './support-card';

/** Les trois champs de l'identité publiée que la carte lit. */
interface Reach {
  readonly phone: string;
  readonly phoneHref: string;
  readonly email: string;
}

const PUBLISHED: Reach = {
  phone: '04 79 06 12 40',
  phoneHref: 'tel:+33479061240',
  email: 'contact@lafoliecoffee.fr',
};

function boot(reach: Reach): ComponentFixture<SupportCard> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [SupportCard],
    providers: [{ provide: ClientContent, useValue: { identity: signal(reach) } }],
  });
  const fixture = TestBed.createComponent(SupportCard);
  fixture.detectChanges();
  return fixture;
}

describe('SupportCard', () => {
  let fixture: ComponentFixture<SupportCard>;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;

  it('donne le numéro et l’adresse PUBLIÉS, en liens composables', () => {
    fixture = boot(PUBLISHED);

    expect(el().textContent).toContain(FR.account.supportTitle);
    const phone = el().querySelector<HTMLAnchorElement>('a.phone');
    expect(phone?.getAttribute('href')).toBe('tel:+33479061240');
    expect(phone?.textContent).toContain('04 79 06 12 40');
    expect(phone?.querySelector('fold-icon[aria-hidden="true"]')).not.toBeNull();

    const email = el().querySelector<HTMLAnchorElement>('a.email');
    expect(email?.getAttribute('href')).toBe('mailto:contact@lafoliecoffee.fr');
    expect(email?.textContent).toContain('contact@lafoliecoffee.fr');
    expect(email?.querySelector('fold-icon[aria-hidden="true"]')).not.toBeNull();
  });

  it('compose le lien depuis le numéro quand le lien n’est pas saisi', () => {
    fixture = boot({ ...PUBLISHED, phoneHref: '' });

    expect(el().querySelector('a.phone')?.getAttribute('href')).toBe('tel:0479061240');
  });

  it('retire un canal non renseigné, et se tait sans aucun', () => {
    fixture = boot({ ...PUBLISHED, email: '' });
    expect(el().querySelector('a.email')).toBeNull();
    expect(el().querySelector('a.phone')).not.toBeNull();

    fixture = boot({ phone: '', phoneHref: '', email: '' });
    expect(el().querySelector('fold-card')).toBeNull();
  });
});

import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ClientChrome } from '../../client/client-chrome.service';
import { ClientLocale } from '../../client/client-locale.service';
import { fill } from '../../client/copy/client-copy.service';
import { FR } from '../../client/copy/fr';
import { IT } from '../../client/copy/it';
import { MOCK_CLIENT } from '../../client/mock-client';
import { CommandePage } from './commande-page';

/**
 * L'écran est piloté par le DOM : ses membres sont `protected`, et ce qui compte
 * est ce que voit la personne qui l'utilise.
 */
describe('CommandePage', () => {
  let fixture: ComponentFixture<CommandePage>;
  let chrome: ClientChrome;

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const text = (): string => el().textContent ?? '';

  const button = (label: string): HTMLButtonElement => {
    const found = Array.from(el().querySelectorAll('button')).find((b) =>
      (b.textContent ?? '').includes(label),
    );
    if (!found) {
      throw new Error(`Aucun bouton « ${label} » à l'écran.`);
    }
    return found;
  };

  const click = (label: string): void => {
    button(label).click();
    fixture.detectChanges();
  };

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [CommandePage] });
    fixture = TestBed.createComponent(CommandePage);
    chrome = TestBed.inject(ClientChrome);
    fixture.detectChanges();
  });

  it('accueille par son prénom, et pose une seule question', () => {
    expect(text()).toContain(fill(FR.commande.title, { name: MOCK_CLIENT.firstName }));
    expect(chrome.kicker()).toBe(FR.chrome.kickerCommande);
    expect(chrome.back()).toBeNull();
  });

  it('nomme chaque mode DEUX FOIS — le fournil, puis le client', () => {
    // C'est l'invariant de la carte : la pastille porte le mot du bon de
    // commande, le titre celui du client. Perdre l'un des deux la vide.
    const pickup = el().querySelector('app-mode-card[data-mode="pickup"]');
    expect(pickup?.textContent).toContain(FR.commande.pickupBadge);
    expect(pickup?.textContent).toContain('Je passe');

    const delivery = el().querySelector('app-mode-card[data-mode="delivery"]');
    expect(delivery?.textContent).toContain(FR.commande.deliveryBadge);
    expect(delivery?.textContent).toContain('l’apporte');
  });

  it('rappelle la commande prête, avec son numéro', () => {
    expect(text()).toContain(fill(FR.commande.qrSub, { order: MOCK_CLIENT.lastOrder }));
    expect(text()).toContain(FR.commande.qrAction);
  });

  it('une porte sans écran le DIT, au lieu de ne rien faire', () => {
    expect(text()).not.toContain(FR.commande.pending);

    click(FR.commande.browseTitle);

    expect(text()).toContain(FR.commande.pending);
  });

  it("l'urgence propose le rappel ET l'appel direct", () => {
    expect(text()).toContain(FR.commande.urgenceTitle);

    const tel = el().querySelector('a[href^="tel:"]');
    expect(tel?.getAttribute('href')).toBe(`tel:${MOCK_CLIENT.phone.replaceAll(' ', '')}`);
  });

  it("un créneau confirmé remonte dans l'encart, et s'annule", () => {
    click(FR.commande.urgenceCta);
    expect(chrome.back()).not.toBeNull();

    click('14 h – 15 h');
    click(FR.rappel.ctaReady);

    expect(text()).toContain(fill(FR.pro.booked, { slot: '14 h – 15 h' }));
    expect(text()).toContain(MOCK_CLIENT.phone);

    click(FR.pro.cancel);
    expect(text()).toContain(FR.commande.urgenceTitle);
  });

  it('change de langue à chaud, sans rechargement', () => {
    TestBed.inject(ClientLocale).current.set('it');
    fixture.detectChanges();

    expect(text()).toContain(IT.commande.pickupBadge);
    expect(chrome.kicker()).toBe(IT.chrome.kickerCommande);
  });
});

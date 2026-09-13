import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { DEFAULT_SALES_TERMS } from '@lfd/contracts/content-values';
import { FoldPanelHostService } from 'fold-ng';

import { SalesTermsPanel } from '../sales-terms-panel/sales-terms-panel';
import { ClientFoot } from './client-foot';

describe('le pied de page — la barre légale', () => {
  let opened: unknown[];

  const boot = (): HTMLElement => {
    TestBed.resetTestingModule();
    opened = [];
    TestBed.configureTestingModule({
      imports: [ClientFoot],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: FoldPanelHostService,
          useValue: {
            open: (component: unknown) => {
              opened.push(component);
              return { close: () => undefined };
            },
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(ClientFoot);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  };

  const termsButton = (host: HTMLElement): HTMLButtonElement | null =>
    host.querySelector<HTMLButtonElement>('.legal-links button');

  afterEach(() => {
    // Le contenu du pied part au montage ; les CGV, elles, ne partent PAS —
    // c'est tout l'objet du chargement paresseux.
    const http = TestBed.inject(HttpTestingController);
    http.match(() => true);
    http.verify();
  });

  /**
   * 🔴 Le bouton ne se raccroche pas aux liens de `foot().legal.links` : ce
   * sont des CHAÎNES LIBRES éditées au back-office, et y reconnaître « CGV »
   * serait un couplage par chaîne de caractères qu'un rédacteur casserait en
   * corrigeant une faute.
   */
  it('porte un bouton distinct des liens légaux, nommé par le TITRE du document', () => {
    const host = boot();
    const button = termsButton(host);

    expect(button).not.toBeNull();
    expect(button?.textContent?.trim()).toBe(DEFAULT_SALES_TERMS.title.fr);
    // Les liens libres restent des libellés inertes, sans geste attaché.
    expect(host.querySelectorAll('.legal-links .link').length).toBeGreaterThan(0);
  });

  it('ouvre le dialogue des conditions, et ne charge rien avant ce clic', () => {
    const host = boot();
    // Aucune lecture des CGV au rendu : le pied n'a demandé que son contenu.
    const http = TestBed.inject(HttpTestingController);
    expect(http.match((req) => req.url.includes('sales-terms'))).toHaveLength(0);

    termsButton(host)?.click();

    expect(opened).toEqual([SalesTermsPanel]);
  });
});

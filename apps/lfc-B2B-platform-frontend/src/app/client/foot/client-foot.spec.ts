import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { FooterContent, FooterContentView, LegalMentionDisplay } from '@lfd/contracts';
import {
  DEFAULT_FOOTER_CONTENT,
  DEFAULT_SALES_TERMS,
  legalMentionLabels,
} from '@lfd/contracts/content-values';
import { FoldPanelHostService } from 'fold-ng';

import { SalesTermsPanel } from '../sales-terms-panel/sales-terms-panel';
import { ClientFoot } from './client-foot';

describe('le pied de page — la barre légale', () => {
  let opened: unknown[];
  let fixture: ReturnType<typeof TestBed.createComponent<ClientFoot>>;

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
    fixture = TestBed.createComponent(ClientFoot);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  };

  /**
   * Répond à la lecture du pied de page avec l'affichage de mentions demandé.
   *
   * C'est le SEUL chemin par lequel l'écran apprend ce qui s'affiche : le
   * contenu de départ les montre toutes, et un test qui ne répondrait pas
   * n'éprouverait donc que ce repli.
   */
  const servirMentions = (mentions: LegalMentionDisplay): void => {
    const content: FooterContent = { ...DEFAULT_FOOTER_CONTENT, legalMentions: mentions };
    const view: FooterContentView = {
      content,
      revision: 1,
      updatedAt: new Date(0).toISOString(),
      updatedBy: null,
    };
    TestBed.inject(HttpTestingController)
      .expectOne((req) => req.url.includes('/content/footer'))
      .flush(view);
    fixture.detectChanges();
  };

  const toutesSauf = (cachees: readonly (keyof LegalMentionDisplay)[]): LegalMentionDisplay => ({
    legalNotice: !cachees.includes('legalNotice'),
    salesTerms: !cachees.includes('salesTerms'),
    privacy: !cachees.includes('privacy'),
    cookies: !cachees.includes('cookies'),
    accessibility: !cachees.includes('accessibility'),
  });

  const lienCgv = (host: HTMLElement): HTMLButtonElement | null =>
    host.querySelector<HTMLButtonElement>('.legal-links button');

  const mentionsAffichees = (host: HTMLElement): readonly string[] =>
    [...host.querySelectorAll('.legal-links > *')].map((el) => el.textContent?.trim() ?? '');

  afterEach(() => {
    // Le contenu du pied part au montage ; les CGV, elles, ne partent PAS —
    // c'est tout l'objet du chargement paresseux.
    const http = TestBed.inject(HttpTestingController);
    http.match(() => true);
    http.verify();
  });

  /**
   * 🔴 Les mentions ne sont plus des libellés libres : leur mot vient du
   * CONTRAT, et seul leur affichage vient de la base. Une mention légale porte
   * un nom consacré — le rédacteur l'affiche ou la masque, il ne la renomme
   * pas, et il ne peut plus en inventer une qui n'existe pas.
   */
  it('affiche le vocabulaire fermé, dans son ordre, avec les mots du contrat', () => {
    const host = boot();
    servirMentions(toutesSauf([]));

    expect(mentionsAffichees(host)).toEqual([
      legalMentionLabels.fr.legalNotice,
      // Les CGV en deuxième position, et nommées par le TITRE de leur
      // document : renommer les CGV renomme leur propre lien.
      DEFAULT_SALES_TERMS.title.fr,
      legalMentionLabels.fr.privacy,
      legalMentionLabels.fr.cookies,
      legalMentionLabels.fr.accessibility,
    ]);
  });

  it('ne rend pas une mention décochée', () => {
    const host = boot();
    servirMentions(toutesSauf(['cookies', 'accessibility']));

    const affichees = mentionsAffichees(host);
    expect(affichees).not.toContain(legalMentionLabels.fr.cookies);
    expect(affichees).not.toContain(legalMentionLabels.fr.accessibility);
    expect(affichees).toContain(legalMentionLabels.fr.legalNotice);
  });

  /**
   * Les CGV sont masquables comme les autres — ce sont des prérequis dont la
   * maison décide l'affichage, pas une exception. Ce qui reste impossible,
   * c'est d'AJOUTER une mention hors du vocabulaire.
   */
  it('retire le lien vivant quand les CGV sont décochées', () => {
    const host = boot();
    expect(lienCgv(host)).not.toBeNull();

    servirMentions(toutesSauf(['salesTerms']));

    expect(lienCgv(host)).toBeNull();
    expect(mentionsAffichees(host)).not.toContain(DEFAULT_SALES_TERMS.title.fr);
  });

  it('ouvre le dialogue des conditions, et ne charge rien avant ce clic', () => {
    const host = boot();
    // Aucune lecture des CGV au rendu : le pied n'a demandé que son contenu.
    const http = TestBed.inject(HttpTestingController);
    expect(http.match((req) => req.url.includes('sales-terms'))).toHaveLength(0);

    lienCgv(host)?.click();

    expect(opened).toEqual([SalesTermsPanel]);
  });
});

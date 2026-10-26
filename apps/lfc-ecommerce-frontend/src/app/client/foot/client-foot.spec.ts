import { vi } from 'vitest';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import type { FooterContent, FooterContentView, LegalMentionDisplay } from '@lfd/contracts';
import {
  DEFAULT_FOOTER_CONTENT,
  legalMentionLabels,
  legalMentionOrder,
} from '@lfd/contracts/content-values';
import { FoldPanelHostService } from 'fold-ng';

import { LegalDocumentPanel } from '../legal-document-panel/legal-document-panel';
import { SalesTermsPanel } from '../sales-terms-panel/sales-terms-panel';
import { ClientFoot } from './client-foot';

/** Ce que le pied a demandé d'ouvrir : le composant, et la mention passée en `data`. */
interface Ouverture {
  readonly component: unknown;
  readonly data: unknown;
}

describe('le pied de page — la barre légale', () => {
  let opened: Ouverture[];
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
            open: (component: unknown, config?: { readonly data?: unknown }) => {
              opened.push({ component, data: config?.data });
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
    termsOfUse: !cachees.includes('termsOfUse'),
  });

  /** Les liens VIVANTS de la barre — `fold-link` rend un `<button>` en mode bouton. */
  const liens = (host: HTMLElement): readonly HTMLButtonElement[] => [
    ...host.querySelectorAll<HTMLButtonElement>('.legal-links button'),
  ];

  const mentionsAffichees = (host: HTMLElement): readonly string[] =>
    [...host.querySelectorAll('.legal-links > *')].map((el) => el.textContent?.trim() ?? '');

  afterEach(() => {
    // Le contenu du pied part au montage ; les DOCUMENTS, eux, ne partent PAS —
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
   *
   * Le mot vient du contrat pour les CINQ, CGV comprises : nommer la barre par
   * le titre des documents obligerait à les charger tous d'avance.
   */
  it('affiche le vocabulaire fermé, dans son ordre, avec les mots du contrat', () => {
    const host = boot();
    servirMentions(toutesSauf([]));

    expect(mentionsAffichees(host)).toEqual([
      legalMentionLabels.fr.legalNotice,
      legalMentionLabels.fr.salesTerms,
      legalMentionLabels.fr.privacy,
      legalMentionLabels.fr.cookies,
      legalMentionLabels.fr.accessibility,
      legalMentionLabels.fr.termsOfUse,
    ]);
  });

  it('masque les CGU décochées, et elles seules', () => {
    const host = boot();
    servirMentions(toutesSauf(['termsOfUse']));

    expect(liens(host)).toHaveLength(legalMentionOrder.length - 1);
    expect(mentionsAffichees(host)).not.toContain(legalMentionLabels.fr.termsOfUse);
  });

  /**
   * 🔴 Plus aucun libellé inerte : une mention qu'on affiche est une mention
   * qu'on peut lire. Le compte s'affirme AVANT toute lecture élément par
   * élément — une barre vide passerait toutes les assertions d'une boucle.
   */
  it('rend toutes les mentions cochées en liens vivants', () => {
    const host = boot();
    servirMentions(toutesSauf([]));

    expect(liens(host)).toHaveLength(legalMentionOrder.length);
    // Aucun texte mort à côté des liens : autant d'enfants que de boutons.
    expect(mentionsAffichees(host)).toHaveLength(legalMentionOrder.length);
  });

  it('ne rend rien pour une mention décochée', () => {
    const host = boot();
    servirMentions(toutesSauf(['cookies', 'accessibility']));

    expect(liens(host)).toHaveLength(legalMentionOrder.length - 2);
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
  it('retire le lien quand les CGV sont décochées', () => {
    const host = boot();
    expect(mentionsAffichees(host)).toContain(legalMentionLabels.fr.salesTerms);

    servirMentions(toutesSauf(['salesTerms']));

    expect(mentionsAffichees(host)).not.toContain(legalMentionLabels.fr.salesTerms);
  });

  /**
   * Chaque lien ouvre le dialogue de SA mention : c'est la CLÉ qui relie le
   * lien au document, jamais son texte. Les CGV ont le leur — un seul lien,
   * deux textes derrière un switch.
   */
  it('ouvre le dialogue de la mention cliquée', async () => {
    const host = boot();
    servirMentions(toutesSauf([]));

    const boutons = liens(host);
    // Le compte d'abord : sans lui, une barre vide rendrait la boucle muette.
    expect(boutons).toHaveLength(legalMentionOrder.length);
    for (const [index, bouton] of boutons.entries()) {
      bouton.click();
      // Le dialogue des CGV se charge à la demande (budget du paquet initial) :
      // un `import()` dont la résolution dépend de la charge. Un seul tour de
      // boucle suffisait seul et échouait en suite complète (CI, 2026-10-15) ;
      // on attend donc l'ouverture elle-même, pas un délai.
      const mention = legalMentionOrder[index];
      await vi.waitFor(() =>
        expect(opened[index]).toEqual(
          mention === 'salesTerms'
            ? { component: SalesTermsPanel, data: undefined }
            : { component: LegalDocumentPanel, data: mention },
        ),
      );
    }
    expect(opened).toHaveLength(legalMentionOrder.length);
  });

  it('ne charge aucun document avant le premier clic', () => {
    const host = boot();
    servirMentions(toutesSauf([]));

    // Le pied n'a demandé que son contenu : les cinq documents dorment.
    const http = TestBed.inject(HttpTestingController);
    expect(http.match((req) => req.url.includes('/content/legal/'))).toHaveLength(0);

    const premier = liens(host)[0];
    expect(premier).toBeDefined();
    premier?.click();

    // La lecture appartient au DIALOGUE, pas au pied : celui-ci n'a fait
    // qu'ouvrir, et l'hôte des panneaux est doublé ici.
    expect(opened).toHaveLength(1);
  });

  /**
   * Régression : le pied de page affichait un numéro par défaut inventé
   * (« 04 79 06 12 40 ») tant qu'aucun n'était saisi (2026-10-26, Hugo : « on
   * ne peut plus afficher une information fausse »).
   */
  it("n'affiche ni numéro ni horaires d'appel quand aucun numéro n'est saisi", () => {
    const host = boot();
    servirMentions(toutesSauf([]));

    expect(host.querySelector('.phone')).toBeNull();
    expect(host.querySelector('.phone-hours')).toBeNull();
    expect(host.textContent).not.toContain('04 79 06 12 40');
  });

  /** RGAA 13.2 (lot A3) : un lien qui ouvre un nouvel onglet le dit dans son nom. */
  it('nomme chaque réseau social en disant qu’il ouvre un nouvel onglet', () => {
    const host = boot();
    servirMentions(toutesSauf([]));

    const pills = [...host.querySelectorAll<HTMLAnchorElement>('a.social-pill')];
    expect(pills.length).toBeGreaterThan(0);
    for (const pill of pills) {
      expect(pill.target).toBe('_blank');
      expect(pill.getAttribute('aria-label')).toBe(
        `${pill.textContent?.trim() ?? ''} (nouvel onglet)`,
      );
    }
  });
});

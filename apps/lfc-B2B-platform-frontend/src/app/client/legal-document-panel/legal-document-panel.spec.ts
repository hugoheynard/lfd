import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  type TestRequest,
} from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { LegalDocumentView } from '@lfd/contracts';
import { DEMO_LEGAL_DOCUMENTS, type LegalMention } from '@lfd/contracts/content-values';

import { AUTH_CONFIG } from '../../auth/auth.config';
import { FR } from '../copy/fr';
import { LegalDocumentPanel } from './legal-document-panel';

/** ⚠️ L'URL porte le mot du CONTRAT (`salesTerms`), pas la clé de stockage. */
const url = (mention: LegalMention): string => `${AUTH_CONFIG.apiBaseUrl}/content/legal/${mention}`;

/** Deux articles, dans un ordre que seul le document décide. */
const VIEW: LegalDocumentView = {
  content: {
    title: { fr: 'Conditions de vente', en: 'Terms of sale', it: 'Condizioni di vendita' },
    paragraphs: [
      {
        id: 'p_commande',
        fr: { title: 'Commande', body: 'La commande engage.' },
        en: { title: 'Order', body: 'An order binds.' },
        it: { title: 'Ordine', body: 'L’ordine impegna.' },
      },
      {
        id: 'p_litiges',
        fr: { title: 'Litiges', body: 'Le tribunal compétent.' },
        en: { title: 'Disputes', body: 'The competent court.' },
        it: { title: 'Controversie', body: 'Il tribunale competente.' },
      },
    ],
  },
  revision: 3,
  updatedAt: '2026-01-01T00:00:00.000Z',
  updatedBy: null,
};

/** Le document des cookies — il sert à montrer que le dialogue n'est PAS celui des CGV. */
const COOKIES: LegalDocumentView = {
  ...VIEW,
  content: {
    title: { fr: 'Gestion des cookies', en: 'Cookie policy', it: 'Gestione dei cookie' },
    paragraphs: [
      {
        id: 'p_traceurs',
        fr: { title: 'Traceurs', body: 'Les traceurs déposés.' },
        en: { title: 'Trackers', body: 'The trackers set.' },
        it: { title: 'Traccianti', body: 'I traccianti impostati.' },
      },
    ],
  },
};

describe('le dialogue d’une mention légale', () => {
  let fixture: ComponentFixture<LegalDocumentPanel>;
  let http: HttpTestingController;

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const text = (): string => el().textContent ?? '';
  /** Le rang et le titre de chaque article, dans l'ordre du DOM. */
  const articles = (): string[] =>
    Array.from(el().querySelectorAll('.article-head')).map((head) => {
      const rank = head.querySelector('.rank')?.textContent?.trim() ?? '';
      const title = head.querySelector('.article-title')?.textContent?.trim() ?? '';
      return `${rank} ${title}`;
    });

  /** Monte le dialogue SUR une mention : c'est la seule chose qui les distingue. */
  const ouvrir = (mention: LegalMention): void => {
    fixture = TestBed.createComponent(LegalDocumentPanel);
    fixture.componentRef.setInput('data', mention);
    fixture.detectChanges();
  };

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [LegalDocumentPanel],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    ouvrir('salesTerms');
  });

  afterEach(() => http.verify());

  /** La requête que l'ouverture déclenche — le chargement est PARESSEUX. */
  const pending = (mention: LegalMention = 'salesTerms'): TestRequest =>
    http.expectOne(url(mention));

  it('lit le document de SA mention à l’ouverture, et pas avant', () => {
    // Une seule requête, celle que cette ouverture-ci a déclenchée, et sur la
    // mention demandée : un dialogue de cookies ne lit pas les CGV.
    pending().flush(VIEW);
  });

  it('montre l’état de chargement fold tant que la réponse n’est pas là', () => {
    expect(el().querySelector('fold-loading')).not.toBeNull();
    expect(text()).toContain(FR.legalDocument.loading);

    pending().flush(VIEW);
  });

  it('porte le titre du document, qui nomme aussi le dialogue', () => {
    pending().flush(VIEW);
    fixture.detectChanges();

    expect(text()).toContain('Conditions de vente');
  });

  it('numérote les articles dans l’ordre du document', () => {
    pending().flush(VIEW);
    fixture.detectChanges();

    // L'ordre porte du sens : un article de litige se lit après celui qu'il
    // concerne. Le rang est celui de la liste, jamais un tri.
    expect(articles()).toEqual(['1. Commande', '2. Litiges']);
    expect(text()).toContain('Le tribunal compétent.');
  });

  /**
   * La mention est un PARAMÈTRE, pas un composant de plus : le même dialogue
   * sert les cinq, et il lit celui qu'on lui a donné.
   */
  it('sert une autre mention sans rien partager avec les CGV', () => {
    // Le montage du `beforeEach` a déjà demandé les CGV ; on le solde.
    pending().flush(VIEW);

    ouvrir('cookies');
    pending('cookies').flush(COOKIES);
    fixture.detectChanges();

    expect(text()).toContain('Gestion des cookies');
    expect(articles()).toEqual(['1. Traceurs']);
    expect(text()).not.toContain('Le tribunal compétent.');
  });

  /**
   * 🔴 Le repli sert le TITRE, jamais un article — `DEFAULT_LEGAL_DOCUMENT`
   * n'en porte aucun. Une lecture en échec le DIT donc, au lieu de remplir le
   * dialogue : montrer au client un engagement que personne n'a publié serait
   * pire que de lui annoncer une panne.
   *
   * Ce que le test garde, c'est qu'aucun texte de démonstration — le seul qui
   * pourrait entrer ici par accident, puisque c'est lui que sème le
   * développement — n'atteint jamais cette surface.
   */
  it('dit l’échec au lieu de servir les articles de repli', () => {
    pending().flush('nope', { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    const state = el().querySelector('fold-empty-state');
    expect(state).not.toBeNull();
    expect(state?.getAttribute('tone')).toBe('alert');
    expect(text()).toContain(FR.legalDocument.errorTitle);

    // ⚠️ La longueur s'affirme AVANT la boucle : parcourir une liste vide ne
    // refuse rien, et rendrait ce test vert pour la mauvaise raison.
    const corpsDeDemonstration = DEMO_LEGAL_DOCUMENTS.salesTerms.paragraphs.map(
      (article) => article.fr.body,
    );
    expect(corpsDeDemonstration.length).toBeGreaterThan(0);
    for (const corps of corpsDeDemonstration) {
      expect(text()).not.toContain(corps);
    }
  });

  it('le bouton de l’état d’erreur rejoue la lecture', () => {
    pending().flush('nope', { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    const retry = el().querySelector<HTMLButtonElement>('fold-empty-state button');
    expect(retry?.textContent).toContain(FR.legalDocument.retry);
    retry?.click();
    fixture.detectChanges();

    pending().flush(VIEW);
    fixture.detectChanges();
    expect(articles()).toEqual(['1. Commande', '2. Litiges']);
  });

  it('un document sans article passe par l’état vide de fold', () => {
    pending().flush({ ...VIEW, content: { ...VIEW.content, paragraphs: [] } });
    fixture.detectChanges();

    expect(el().querySelector('fold-empty-state')).not.toBeNull();
    expect(text()).toContain(FR.legalDocument.emptyTitle);
  });

  it('le corps défile dans son propre conteneur, jamais la page derrière', () => {
    pending().flush(VIEW);
    fixture.detectChanges();

    // La classe est le contrat avec la feuille de style (`overflow-y: auto`) ;
    // jsdom ne calcule pas de mise en page, mais un renommage se voit ici.
    expect(el().querySelector('.body')).not.toBeNull();
    expect(el().querySelector('.body')?.getAttribute('lang')).toBe('fr');
  });
});

import { HttpClient } from '@angular/common/http';
import { inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import type { LegalDocument, LegalDocumentView } from '@lfd/contracts';
// ⚠️ Les VALEURS passent par `content-values` et non par le baril : celui-ci
// tire zod, qui n'a rien à faire dans un bundle de vitrine — mesuré, +380 ko,
// et le budget passait de vert à rouge.
import {
  DEFAULT_LEGAL_DOCUMENT,
  type LegalDocumentKey,
  type SalesTermsDocument,
} from '@lfd/contracts/content-values';

import { AUTH_CONFIG } from '../auth/auth.config';
import { ClientLocale } from './client-locale.service';

/** Où en est la lecture d'un document. Le titre, lui, est toujours disponible. */
export type LegalDocumentStatus = 'idle' | 'loading' | 'ready' | 'failed';

/**
 * Ce qu'on sait du PDF de référence d'un texte de CGV : `unknown` tant que la
 * sonde n'a pas répondu, `absent` pour un 404 — ou toute autre réponse : un
 * bouton qui mènerait à une erreur promet un document qu'on ne peut pas donner.
 */
export type LegalPdfAvailability = 'unknown' | 'available' | 'absent';

/** Un article prêt à l'affichage : son rang de lecture, dans la langue courante. */
export interface LegalDocumentArticle {
  readonly id: string;
  /** Le numéro imprimé devant le titre — le rang, à partir de 1. */
  readonly rank: number;
  readonly title: string;
  readonly body: string;
}

/**
 * Les **documents de mentions légales**, tels que la boutique les lit.
 *
 * Les CGV professionnelles (`salesTermsPro`) se lisent par la même route
 * publique, sans connexion (plan `legal/plan-cgv-par-audience.md`, C2′
 * remplacé le 2026-10-15) : quelle page les montre à qui reste à trancher au
 * lot des pages de la boutique. Jamais rédigées, elles rendent leur titre et
 * aucun article — « en cours de rédaction ».
 *
 * Un service pour les CINQ, et non cinq services : les mentions ont exactement
 * la même forme, ce qui les distingue est leur CLÉ. L'état est donc tenu **par
 * mention** — un visiteur qui ouvre les cookies ne charge pas les CGV, et une
 * lecture ratée d'un document n'abîme pas celle d'un autre.
 *
 * **Chargement paresseux, à la première ouverture de CETTE mention, puis
 * gardé.** Le document ne part pas dans le rendu de chaque page : la plupart
 * des visiteurs n'en ouvriront aucun, et une centaine d'articles dans les trois
 * langues est la charge la plus lourde du contenu de plateforme.
 * `ensureLoaded()` est donc appelé par le panneau, pas par le constructeur.
 *
 * **Le repli ne sert QUE le titre.** `DEFAULT_LEGAL_DOCUMENT(mention)` nomme le
 * document avant toute réponse, et ne porte **aucun article** : servir les
 * articles de démonstration en place des vrais montrerait au client un
 * engagement que personne n'a publié, et le fait qu'ils avouent en être ne
 * répare rien — ce qu'on lit d'abord, c'est le titre. D'où l'asymétrie assumée :
 * un titre se replie, un engagement non, et une lecture ratée se DIT
 * (`failed`).
 */
@Injectable({ providedIn: 'root' })
export class ClientLegalDocuments {
  private readonly http = inject(HttpClient);
  private readonly locale = inject(ClientLocale);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /** Ce qui a été lu, mention par mention. Absent = jamais chargé. */
  private readonly documents = signal<Partial<Record<LegalDocumentKey, LegalDocument>>>({});
  private readonly states = signal<Partial<Record<LegalDocumentKey, LegalDocumentStatus>>>({});
  private readonly pdfs = signal<Partial<Record<SalesTermsDocument, LegalPdfAvailability>>>({});
  /** Les sondes parties : une seconde ouverture n'en relance pas une en vol. */
  private readonly probed = new Set<SalesTermsDocument>();

  /**
   * Où en est la lecture d'une mention — c'est ce que le panneau donne à ses
   * états fold.
   *
   * Une méthode et non un signal par mention : elle LIT un signal, donc elle
   * reste réactive partout où on l'appelle (un `computed`, un gabarit), sans
   * obliger le service à fabriquer cinq jeux de signaux dont quatre ne servent
   * jamais.
   */
  statusOf(mention: LegalDocumentKey): LegalDocumentStatus {
    return this.states()[mention] ?? 'idle';
  }

  /** Le titre du document dans la langue courante. Jamais vide, repli compris. */
  titleOf(mention: LegalDocumentKey): string {
    return this.documentOf(mention).title[this.locale.current()];
  }

  /** Les articles dans l'ordre de lecture, numérotés, dans la langue courante. */
  articlesOf(mention: LegalDocumentKey): readonly LegalDocumentArticle[] {
    const code = this.locale.current();
    return this.documentOf(mention).paragraphs.map((paragraph, index) => ({
      id: paragraph.id,
      rank: index + 1,
      title: paragraph[code].title,
      body: paragraph[code].body,
    }));
  }

  /**
   * Charge le document de cette mention s'il ne l'est pas déjà.
   *
   * Idempotent : deux ouvertures successives ne déclenchent qu'un appel, et une
   * lecture en cours n'est pas relancée. Une lecture ÉCHOUÉE, elle, se rejoue —
   * c'est ce que fait le bouton « Réessayer » du panneau.
   */
  ensureLoaded(mention: LegalDocumentKey): void {
    // ⚠️ Navigateur SEULEMENT, comme `ClientContent` : le rendu serveur n'a pas
    // à attendre un appel réseau pour un dialogue que personne n'a encore
    // ouvert.
    const state = this.statusOf(mention);
    if (!this.isBrowser || state === 'loading' || state === 'ready') {
      return;
    }
    this.setStatus(mention, 'loading');
    // ⚠️ Dans l'URL, la mention s'écrit comme le CONTRAT la nomme
    // (`salesTerms`) — la clé de stockage (`sales-terms`) est l'affaire de
    // l'adaptateur, côté serveur.
    this.http
      .get<LegalDocumentView>(`${AUTH_CONFIG.apiBaseUrl}/content/legal/${mention}`)
      .subscribe({
        next: (view) => {
          this.documents.update((all) => ({ ...all, [mention]: view.content }));
          this.setStatus(mention, 'ready');
        },
        // Dit, pas avalé : le visiteur a ouvert ce dialogue pour lire un
        // document, et lui montrer le texte de démonstration à la place serait
        // pire qu'une panne annoncée.
        error: () => this.setStatus(mention, 'failed'),
      });
  }

  /** Le document lu, ou le repli — un titre, aucun article. */
  private documentOf(mention: LegalDocumentKey): LegalDocument {
    return this.documents()[mention] ?? DEFAULT_LEGAL_DOCUMENT(mention);
  }

  private setStatus(mention: LegalDocumentKey, status: LegalDocumentStatus): void {
    this.states.update((all) => ({ ...all, [mention]: status }));
  }

  /**
   * L'adresse du PDF de référence en vigueur d'un texte de CGV (C3) —
   * publique, servie en `attachment` sous un nom daté. Un 404 dit qu'aucun
   * PDF n'est encore déposé : la page garde alors son texte seul.
   */
  pdfUrlOf(document: SalesTermsDocument): string {
    return `${AUTH_CONFIG.apiBaseUrl}/content/legal/${document}/pdf`;
  }

  /** Ce qu'on sait du PDF en vigueur de ce texte — c'est ce qui montre ou cache le bouton. */
  pdfOf(document: SalesTermsDocument): LegalPdfAvailability {
    return this.pdfs()[document] ?? 'unknown';
  }

  /**
   * Demande au serveur s'il existe un PDF en vigueur pour ce texte, une fois.
   *
   * Un `HEAD` sur l'adresse de téléchargement elle-même : la route publique ne
   * dit pas autrement qu'un PDF est déposé (vérifié le 2026-10-15,
   * `legal-document-files.controller.ts` — `GET :mention/pdf`, 404 sinon), et
   * Express répond au `HEAD` d'une route `GET`. Un échec, quel qu'il soit,
   * cache le bouton plutôt que de mener à une erreur.
   */
  ensurePdfProbed(document: SalesTermsDocument): void {
    if (!this.isBrowser || this.probed.has(document)) {
      return;
    }
    this.probed.add(document);
    this.http.head(this.pdfUrlOf(document)).subscribe({
      next: () => this.setPdf(document, 'available'),
      error: () => this.setPdf(document, 'absent'),
    });
  }

  private setPdf(document: SalesTermsDocument, availability: LegalPdfAvailability): void {
    this.pdfs.update((all) => ({ ...all, [document]: availability }));
  }
}

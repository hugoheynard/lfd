import { HttpClient } from '@angular/common/http';
import { inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import type {
  LegalDocument,
  LegalDocumentPdfView,
  PublishedLegalDocumentView,
} from '@lfd/contracts';
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
  /** Le PDF en vigueur que la lecture a annoncé, `null` sans PDF. Absent = pas encore lu. */
  private readonly pdfs = signal<Partial<Record<LegalDocumentKey, LegalDocumentPdfView | null>>>(
    {},
  );
  /** La révision publiée que la lecture a rendue. Absent = pas encore lu. */
  private readonly revisions = signal<Partial<Record<LegalDocumentKey, number>>>({});

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
      .get<PublishedLegalDocumentView>(`${AUTH_CONFIG.apiBaseUrl}/content/legal/${mention}`)
      .subscribe({
        next: (view) => {
          this.documents.update((all) => ({ ...all, [mention]: view.content }));
          this.pdfs.update((all) => ({ ...all, [mention]: view.pdf }));
          this.revisions.update((all) => ({ ...all, [mention]: view.revision }));
          this.setStatus(mention, 'ready');
        },
        // Dit, pas avalé : le visiteur a ouvert ce dialogue pour lire un
        // document, et lui montrer le texte de démonstration à la place serait
        // pire qu'une panne annoncée.
        error: () => this.setStatus(mention, 'failed'),
      });
  }

  /**
   * **La révision publiée** du texte lu, ou `null` : pas encore lu, lecture
   * ratée, ou jamais rédigé (révision 0, « en cours de rédaction », C1′).
   *
   * C'est elle que la case des CGV du panier envoie avec la commande : la
   * version lue AVEC le texte, celle que le client a pu ouvrir.
   */
  publishedRevisionOf(mention: LegalDocumentKey): number | null {
    const revision = this.revisions()[mention] ?? 0;
    return revision > 0 ? revision : null;
  }

  /**
   * Relit le document même s'il l'a déjà été — le serveur vient de dire qu'il
   * a changé (une commande refusée pour des CGV périmées).
   */
  reload(mention: LegalDocumentKey): void {
    if (this.statusOf(mention) === 'loading') {
      return;
    }
    this.setStatus(mention, 'idle');
    this.ensureLoaded(mention);
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
   * publique, servie en `attachment` sous un nom daté. On ne la tend que si
   * la lecture du texte a annoncé un PDF ({@link hasPdf}).
   */
  pdfUrlOf(document: SalesTermsDocument): string {
    return `${AUTH_CONFIG.apiBaseUrl}/content/legal/${document}/pdf`;
  }

  /**
   * Ce texte a-t-il un PDF en vigueur ? C'est la lecture du texte qui le dit
   * (`pdf` de la vue publique, Hugo, 2026-10-15) — aucune sonde. Tant que le
   * texte n'est pas lu, ou si sa lecture a échoué : non, et le bouton reste
   * caché plutôt que de mener à une erreur.
   */
  hasPdf(document: SalesTermsDocument): boolean {
    return (this.pdfs()[document] ?? null) !== null;
  }
}

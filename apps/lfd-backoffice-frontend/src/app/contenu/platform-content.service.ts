import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  FooterContent,
  FooterContentView,
  LegalDocumentFileDeposited,
  LegalDocumentFileHistoryView,
  LegalDocumentHeading,
  LegalDocumentParagraphCreated,
  LegalDocumentParagraphPayload,
  LegalDocumentView,
  LegalDocumentKey,
  LegalSectionKey,
  SalesTermsDocument,
} from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../api/api-config';

/**
 * La base des routes d'un document de mention.
 *
 * ⚠️ La mention s'écrit dans l'URL comme le CONTRAT la nomme (`salesTerms`), et
 * non comme la table la stocke (`sales-terms`) : la correspondance est une
 * table explicite de l'adaptateur serveur, et la recopier ici en ferait une
 * seconde qui dériverait au premier ajout.
 */
function legalBase(mention: LegalDocumentKey): string {
  return `${B2B_API_BASE}/admin/content/legal/${mention}`;
}

/** Le segment d'un paragraphe, échappé une seule fois pour les quatre routes. */
function paragraphPath(mention: LegalDocumentKey, paragraphId: string): string {
  return `${legalBase(mention)}/paragraphs/${encodeURIComponent(paragraphId)}`;
}

/**
 * **Contenu de plateforme** — les textes de la vitrine.
 *
 * La lecture passe par la surface STAFF et non la publique, alors que les deux
 * rendent le même pied de page : seule la staff porte la révision et la
 * dernière main, et c'est précisément ce dont l'écran d'édition a besoin pour
 * dire à un rédacteur que quelqu'un a enregistré entre-temps.
 *
 * Les cinq mentions légales partagent les mêmes méthodes, paramétrées par la
 * mention : elles ont la même forme, et cinq jeux de méthodes auraient divergé
 * au premier correctif.
 */
@Injectable({ providedIn: 'root' })
export class PlatformContentService {
  private readonly http = inject(HttpClient);

  /** Le pied de page, avec sa révision. Aboutit toujours (cf. l'API). */
  async footer(): Promise<FooterContentView> {
    return firstValueFrom(this.http.get<FooterContentView>(`${B2B_API_BASE}/admin/content/footer`));
  }

  /**
   * Enregistre le pied de page ENTIER, dans ses trois langues.
   *
   * `PUT` et non `PATCH` : un enregistrement partiel laisserait une langue en
   * arrière sans que rien ne le dise.
   */
  async saveFooter(content: FooterContent): Promise<FooterContentView> {
    return firstValueFrom(
      this.http.put<FooterContentView>(`${B2B_API_BASE}/admin/content/footer`, content),
    );
  }

  /** Un document de mention, avec sa révision. Aboutit toujours — le serveur
   *  sert le document de départ tant que personne n'a enregistré. */
  async legalDocument(mention: LegalDocumentKey): Promise<LegalDocumentView> {
    return firstValueFrom(this.http.get<LegalDocumentView>(legalBase(mention)));
  }

  /**
   * Renomme le document, dans les trois langues.
   *
   * ⚠️ Rend `void`, comme toutes les écritures d'un document : une commande ne
   * rend pas de modèle de lecture. L'écran RELIT derrière, plutôt que de
   * recoudre une vue de son côté.
   *
   * Toutes les écritures portent `expectedRevision`, la révision LUE : le
   * serveur refuse (409 `legal_document.revision.stale`) si quelqu'un a
   * enregistré entre-temps, au lieu de réécrire le document sans son geste.
   */
  async renameLegalDocument(
    mention: LegalDocumentKey,
    title: LegalDocumentHeading,
    expectedRevision: number,
  ): Promise<void> {
    await firstValueFrom(
      this.http.put<void>(`${legalBase(mention)}/title`, { ...title, expectedRevision }),
    );
  }

  /** Ajoute un article, dans les trois langues. Rend son identifiant — le seul
   *  retour qu'une commande se permet, parce que rien d'autre ne le donne. */
  async addLegalParagraph(
    mention: LegalDocumentKey,
    payload: LegalDocumentParagraphPayload,
    expectedRevision: number,
  ): Promise<LegalDocumentParagraphCreated> {
    return firstValueFrom(
      this.http.post<LegalDocumentParagraphCreated>(`${legalBase(mention)}/paragraphs`, {
        ...payload,
        expectedRevision,
      }),
    );
  }

  /**
   * Crée une **section requise** (la suppression des données de la politique
   * de confidentialité) avec le texte saisi par le rédacteur — le serveur n'en
   * pose aucun de départ. Seule route qui pose une clé de section.
   */
  async addLegalRequiredSection(
    mention: LegalDocumentKey,
    section: LegalSectionKey,
    payload: LegalDocumentParagraphPayload,
    expectedRevision: number,
  ): Promise<LegalDocumentParagraphCreated> {
    return firstValueFrom(
      this.http.post<LegalDocumentParagraphCreated>(`${legalBase(mention)}/sections`, {
        ...payload,
        section,
        expectedRevision,
      }),
    );
  }

  /** Réécrit un article ENTIER — les trois langues, celles qu'on ne touche pas
   *  comprises : la route remplace la charge utile, elle ne la rapièce pas. La
   *  clé de section, elle, n'y figure pas : le serveur la garde. */
  async editLegalParagraph(
    mention: LegalDocumentKey,
    paragraphId: string,
    payload: LegalDocumentParagraphPayload,
    expectedRevision: number,
  ): Promise<void> {
    await firstValueFrom(
      this.http.put<void>(paragraphPath(mention, paragraphId), { ...payload, expectedRevision }),
    );
  }

  /** Retire un article du document. La route `DELETE` n'a pas de corps : la
   *  révision lue voyage en chaîne de requête. */
  async removeLegalParagraph(
    mention: LegalDocumentKey,
    paragraphId: string,
    expectedRevision: number,
  ): Promise<void> {
    await firstValueFrom(
      this.http.delete<void>(paragraphPath(mention, paragraphId), {
        params: { expectedRevision },
      }),
    );
  }

  /** Déplace un article au rang demandé, compté à partir de zéro. */
  async moveLegalParagraph(
    mention: LegalDocumentKey,
    paragraphId: string,
    position: number,
    expectedRevision: number,
  ): Promise<void> {
    await firstValueFrom(
      this.http.put<void>(`${paragraphPath(mention, paragraphId)}/position`, {
        position,
        expectedRevision,
      }),
    );
  }

  /**
   * L'historique des PDF de référence d'un texte de CGV, le plus récent
   * d'abord (plan `legal/plan-cgv-par-audience.md`, C3, C5).
   */
  async legalFileHistory(document: SalesTermsDocument): Promise<LegalDocumentFileHistoryView> {
    return firstValueFrom(
      this.http.get<LegalDocumentFileHistoryView>(`${legalBase(document)}/files`),
    );
  }

  /**
   * Dépose un PDF, qui devient celui en vigueur ; le précédent est remplacé,
   * jamais écrasé. Multipart `file` : le serveur juge les octets, pas le nom.
   */
  async depositLegalFile(
    document: SalesTermsDocument,
    file: File,
  ): Promise<LegalDocumentFileDeposited> {
    const form = new FormData();
    form.append('file', file, file.name);
    return firstValueFrom(
      this.http.post<LegalDocumentFileDeposited>(`${legalBase(document)}/files`, form),
    );
  }
}

/**
 * L'adresse de téléchargement d'un dépôt précis — PUBLIQUE : chaque dépôt a
 * été, à son heure, le PDF que la boutique servait à tous. Un simple lien
 * suffit, sans jeton ni blob.
 */
export function legalFileUrl(document: SalesTermsDocument, fileId: string): string {
  return `${B2B_API_BASE}/content/legal/${document}/files/${encodeURIComponent(fileId)}`;
}

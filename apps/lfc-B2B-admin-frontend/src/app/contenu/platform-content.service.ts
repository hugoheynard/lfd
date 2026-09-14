import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  FooterContent,
  FooterContentView,
  LegalDocumentHeading,
  LegalDocumentParagraphCreated,
  LegalDocumentParagraphPayload,
  LegalDocumentView,
  LegalMention,
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
function legalBase(mention: LegalMention): string {
  return `${B2B_API_BASE}/admin/content/legal/${mention}`;
}

/** Le segment d'un paragraphe, échappé une seule fois pour les quatre routes. */
function paragraphPath(mention: LegalMention, paragraphId: string): string {
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
  async legalDocument(mention: LegalMention): Promise<LegalDocumentView> {
    return firstValueFrom(this.http.get<LegalDocumentView>(legalBase(mention)));
  }

  /**
   * Renomme le document, dans les trois langues.
   *
   * ⚠️ Rend `void`, comme toutes les écritures d'un document : une commande ne
   * rend pas de modèle de lecture. L'écran RELIT derrière, plutôt que de
   * recoudre une vue de son côté — c'est la seule façon qu'il voie aussi ce
   * qu'un autre rédacteur a enregistré entre-temps.
   */
  async renameLegalDocument(mention: LegalMention, title: LegalDocumentHeading): Promise<void> {
    await firstValueFrom(this.http.put<void>(`${legalBase(mention)}/title`, title));
  }

  /** Ajoute un article, dans les trois langues. Rend son identifiant — le seul
   *  retour qu'une commande se permet, parce que rien d'autre ne le donne. */
  async addLegalParagraph(
    mention: LegalMention,
    payload: LegalDocumentParagraphPayload,
  ): Promise<LegalDocumentParagraphCreated> {
    return firstValueFrom(
      this.http.post<LegalDocumentParagraphCreated>(`${legalBase(mention)}/paragraphs`, payload),
    );
  }

  /** Réécrit un article ENTIER — les trois langues, celles qu'on ne touche pas
   *  comprises : la route remplace la charge utile, elle ne la rapièce pas. */
  async editLegalParagraph(
    mention: LegalMention,
    paragraphId: string,
    payload: LegalDocumentParagraphPayload,
  ): Promise<void> {
    await firstValueFrom(this.http.put<void>(paragraphPath(mention, paragraphId), payload));
  }

  /** Retire un article du document. */
  async removeLegalParagraph(mention: LegalMention, paragraphId: string): Promise<void> {
    await firstValueFrom(this.http.delete<void>(paragraphPath(mention, paragraphId)));
  }

  /** Déplace un article au rang demandé, compté à partir de zéro. */
  async moveLegalParagraph(
    mention: LegalMention,
    paragraphId: string,
    position: number,
  ): Promise<void> {
    await firstValueFrom(
      this.http.put<void>(`${paragraphPath(mention, paragraphId)}/position`, { position }),
    );
  }
}

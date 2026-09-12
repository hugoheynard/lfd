import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type {
  AssignCreditorIdentifierPayload,
  CorrectLegalEntityPayload,
  CreatedIdResponse,
  DeclareLegalEntityPayload,
  LegalEntityView,
  SetCreditorAccountPayload,
  SetMandateDefaultsPayload,
  SetPreNotificationPayload,
} from '@lfd/contracts';

import { B2B_API_BASE } from '../api/api-config';

/**
 * Accès à la surface **staff** des entités juridiques émettrices.
 *
 * Transport pur : aucune règle ici. Ce qu'un écran doit savoir de la complétude
 * d'une entité arrive **déjà répondu** dans la vue (`canCollect`,
 * `missingToCollect`) — recalculer côté front ferait une seconde définition de
 * « complète », et c'est celle que l'utilisateur lit qui dériverait.
 *
 * 🔴 L'IBAN part par `setCreditorAccount` et ne revient jamais : la vue n'en
 * porte que les quatre derniers caractères. Aucune méthode de lecture ne peut
 * le rendre — il n'y en a pas côté serveur.
 */
@Injectable({ providedIn: 'root' })
export class LegalEntitiesService {
  private readonly http = inject(HttpClient);
  private readonly base = `${B2B_API_BASE}/admin/accounting/legal-entities`;

  async list(): Promise<readonly LegalEntityView[]> {
    return firstValueFrom(this.http.get<readonly LegalEntityView[]>(this.base));
  }

  /**
   * Une entité, lue seule.
   *
   * L'écran de détail passe par ici plutôt que de filtrer `list()` : une fiche
   * ouverte par son URL doit pouvoir répondre « cette entité n'existe pas »,
   * ce qu'un filtre sur une liste ne distingue pas d'une liste vide.
   */
  async one(id: string): Promise<LegalEntityView> {
    return firstValueFrom(this.http.get<LegalEntityView>(`${this.base}/${id}`));
  }

  /**
   * La fiche de mandat SEPA préremplie de notre bloc créancier — un exemple,
   * sans débiteur ni RUM.
   *
   * Le serveur répond **409** quand l'entité ne peut pas encaisser : l'appelant
   * ne propose donc le geste que sur une entité complète, plutôt que d'offrir
   * un bouton dont la seule issue serait un message d'erreur.
   *
   * `inline` bascule le `Content-Disposition` du serveur : c'est la différence
   * entre REGARDER la fiche dans un onglet et l'accumuler dans un dossier de
   * téléchargements. Un seul point d'appel plutôt que deux méthodes — l'URL
   * n'est écrite qu'une fois.
   */
  async sampleMandate(id: string, options: { readonly inline?: boolean } = {}): Promise<Blob> {
    return firstValueFrom(
      this.http.get(`${this.base}/${id}/mandat-sepa-exemple.pdf`, {
        responseType: 'blob',
        params: options.inline === true ? { inline: '1' } : {},
      }),
    );
  }

  async declare(payload: DeclareLegalEntityPayload): Promise<string> {
    const created = await firstValueFrom(this.http.post<CreatedIdResponse>(this.base, payload));
    return created.id;
  }

  async correct(id: string, payload: CorrectLegalEntityPayload): Promise<void> {
    await firstValueFrom(this.http.put<void>(`${this.base}/${id}`, payload));
  }

  /** Sans retour : l'agrégat refuse un second ICS, et le serveur répond 409. */
  async assignCreditorIdentifier(
    id: string,
    payload: AssignCreditorIdentifierPayload,
  ): Promise<void> {
    await firstValueFrom(this.http.put<void>(`${this.base}/${id}/creditor-identifier`, payload));
  }

  async setCreditorAccount(id: string, payload: SetCreditorAccountPayload): Promise<void> {
    await firstValueFrom(this.http.put<void>(`${this.base}/${id}/creditor-account`, payload));
  }

  /**
   * Les réglages de mandat de l'entité — zones 20 et 12 du modèle EPC.
   *
   * Sur l'entité et non sur le compte d'un client : ils décrivent ce que NOUS
   * vendons, et la même phrase part sur tous les mandats qu'elle émet.
   */
  async setMandateDefaults(id: string, payload: SetMandateDefaultsPayload): Promise<void> {
    await firstValueFrom(this.http.put<void>(`${this.base}/${id}/mandate-defaults`, payload));
  }

  /**
   * Attache (ou remplace) le **logo imprimé sur les mandats**.
   *
   * ⚠️ En `multipart`, et sans `Content-Type` posé à la main : `FormData` le
   * fixe lui-même avec la frontière que le corps porte, et l'écraser produit un
   * corps que le serveur ne sait plus découper.
   */
  async setLogo(id: string, file: File): Promise<void> {
    const body = new FormData();
    body.append('file', file);
    await firstValueFrom(this.http.post<void>(`${this.base}/${id}/logo`, body));
  }

  /** Retire le logo. Le mandat ressort avec sa cellule vide, et reste valide. */
  async removeLogo(id: string): Promise<void> {
    await firstValueFrom(this.http.delete<void>(`${this.base}/${id}/logo`));
  }

  /**
   * Le logo courant, en mémoire.
   *
   * Comme l'aperçu de mandat : un `<img src="/admin/…">` partirait **sans le
   * jeton staff** — l'intercepteur ne voit que les requêtes `HttpClient` — et le
   * navigateur afficherait une image cassée.
   */
  async logo(id: string): Promise<Blob> {
    return firstValueFrom(this.http.get(`${this.base}/${id}/logo`, { responseType: 'blob' }));
  }

  async setPreNotification(id: string, payload: SetPreNotificationPayload): Promise<void> {
    await firstValueFrom(this.http.put<void>(`${this.base}/${id}/pre-notification`, payload));
  }

  async setArchived(id: string, archived: boolean): Promise<void> {
    await firstValueFrom(this.http.put<void>(`${this.base}/${id}/archived`, { archived }));
  }
}

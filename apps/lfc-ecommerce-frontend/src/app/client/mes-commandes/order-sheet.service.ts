import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { AUTH_CONFIG } from '../../auth/auth.config';
import { AuthFacade } from '../../auth/auth.facade';

/**
 * Le **bon de commande en PDF**, tel que le serveur le fabrique.
 *
 * ## Pourquoi le serveur, et pas le navigateur
 *
 * L'espace client fabriquait son bon **ici**, en texte, à partir de la feuille
 * JSON (`GET /orders/:id/bon`). Ça marchait, et ça manquait l'essentiel : le
 * document qu'un client garde n'était alors garanti par rien. Le serveur, lui,
 * **archive** ce qu'il a servi la première fois et rend ces octets-là ensuite —
 * de sorte qu'un avenant appliqué le lendemain ne réécrit pas le papier que le
 * client a déjà dans la poche. Deux clients qui téléchargent le même bon à deux
 * mois d'intervalle obtiennent le même fichier, au bit près.
 *
 * Un rendu navigateur ne peut pas offrir ça : il refabrique à chaque fois, à
 * partir de ce que la commande dit **aujourd'hui**.
 *
 * ## Ce que ce service ne fait pas
 *
 * Il ne compose aucune mise en page et ne connaît aucun montant : il demande un
 * fichier et le propose. La feuille JSON reste servie par ailleurs pour ce qui a
 * besoin de la LIRE ; ce chemin-ci ne sert qu'à en emporter une copie.
 *
 * ⚠️ Le bon **ne porte aucun QR**, et ce n'est pas un oubli : le jeton de remise
 * n'est pas sur la feuille, donc ce chemin ne peut pas l'imprimer. Un QR sur un
 * papier qui voyage avec le colis se ferait scanner par le coursier.
 */
@Injectable({ providedIn: 'root' })
export class OrderSheetService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthFacade);

  /**
   * Va chercher le PDF d'une commande et le rend en `Blob`.
   *
   * L'identifiant est celui du **serveur**, jamais la référence affichée : c'est
   * la clé que la route attend, et le mur de la commande est appliqué derrière —
   * une commande qu'on n'a pas le droit de lire rend 404, exactement comme une
   * commande qui n'existe pas.
   */
  async pdfOf(orderId: string): Promise<Blob> {
    const token = await firstValueFrom(this.auth.accessToken$());
    return firstValueFrom(
      this.http.get(`${AUTH_CONFIG.apiBaseUrl}/orders/${encodeURIComponent(orderId)}/bon.pdf`, {
        headers: { Authorization: `Bearer ${token}` },
        responseType: 'blob',
      }),
    );
  }
}

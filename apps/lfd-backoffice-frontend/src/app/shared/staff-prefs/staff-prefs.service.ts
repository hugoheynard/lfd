import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { StaffNavPreferencesPatch } from '@lfd/contracts';

import { B2B_API_BASE } from '../../api/api-config';
import { PermissionsStore } from '../../auth/permissions.store';

/**
 * Les préférences de navigation qui suivent la **personne**, pas la machine.
 *
 * `UiPrefsStore` garde ce qui est replié dans CE navigateur ; ce service-ci
 * garde ce que quelqu'un a choisi, où qu'il se rebranche. Le téléphone du pétrin
 * n'est pas la machine du chef, et c'est la personne qui reprend son poste :
 * `localStorage` ne pouvait pas le porter.
 *
 * **La lecture ne coûte rien** : le sac arrive déjà avec `GET /admin/me`, que
 * `PermissionsStore` a lu une fois pour toute l'application. Ouvrir un second
 * appel pour la même réponse ferait deux vérités possibles le même matin.
 *
 * 🔴 **L'écriture est tolérante à la panne, et c'est le point.** Une préférence
 * d'affichage n'a jamais le droit de casser un écran : un `PATCH` refusé, une
 * route pas encore déployée, un réseau absent au sous-sol — dans les trois cas
 * la catégorie reste celle de la session, et personne n'est dérangé. Le prix
 * d'un échec est de rechoisir sa fiche au prochain poste.
 */
@Injectable({ providedIn: 'root' })
export class StaffPrefsService {
  private readonly http = inject(HttpClient);
  private readonly permissions = inject(PermissionsStore);

  /**
   * La fiche d'atelier sur laquelle cette personne s'est mise, `null` si elle
   * n'a jamais choisi.
   *
   * Le `?.` sur `navPrefs` n'est pas de la superstition : le contrat le déclare
   * obligatoire, mais un backend d'une version antérieure ne l'envoie pas, et
   * l'écran doit ouvrir quand même.
   */
  async worksheetCategory(): Promise<string | null> {
    await this.permissions.ensureLoaded();
    return this.permissions.identity()?.navPrefs?.worksheetCategory ?? null;
  }

  /**
   * Retient la fiche choisie. **Sans attendre, sans rien dire** : l'écran a déjà
   * basculé, et ce qui se joue ici ne le concerne plus.
   */
  async remember(patch: StaffNavPreferencesPatch): Promise<void> {
    try {
      await firstValueFrom(this.http.patch<void>(`${B2B_API_BASE}/admin/me/prefs`, patch));
    } catch {
      // Volontairement muet : voir le JSDoc de la classe. Une préférence perdue
      // coûte un clic au prochain poste ; un écran cassé coûte une fournée.
    }
  }
}

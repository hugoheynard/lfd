import { ChangeDetectionStrategy, Component, inject, type OnInit } from '@angular/core';
import {
  FoldBadgeComponent,
  FoldButtonComponent,
  FoldCalloutComponent,
  FoldCardComponent,
  FoldFieldComponent,
  FoldFieldListComponent,
  FoldPageLayoutComponent,
  FoldPageSectionComponent,
} from 'fold-ng';

import { NotifyService } from '../../notify.service';
import { PushNotificationsService } from '../../shared/push/push-notifications.service';
import { QrCode } from '../../shared/qr-code/qr-code';

/**
 * **Obtenir l'app mobile.**
 *
 * Il n'y a pas d'app à télécharger : le back-office est déjà l'app mobile, et
 * tout le travail est déjà fait dans la mise en page. Ce qui manquait était le
 * chemin — passer du poste au téléphone demandait de retaper une URL interne
 * longue, ou de se l'envoyer par e-mail. Un QR code et un bouton « copier »
 * suffisent, et la page en profite pour dire l'étape qu'on oublie toujours :
 * l'ajout à l'écran d'accueil, sans quoi on rouvre un onglet de navigateur.
 *
 * L'adresse vient de `location.origin` plutôt que d'une constante : dev,
 * préproduction et production n'ont pas la même, et un lien codé en dur aurait
 * renvoyé tout le monde vers celle du développeur.
 */
@Component({
  selector: 'app-app-mobile-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    QrCode,
    FoldBadgeComponent,
    FoldButtonComponent,
    FoldCalloutComponent,
    FoldCardComponent,
    FoldFieldComponent,
    FoldFieldListComponent,
    FoldPageLayoutComponent,
    FoldPageSectionComponent,
  ],
  templateUrl: './app-mobile-page.html',
  styleUrl: './app-mobile-page.scss',
})
export class AppMobilePage implements OnInit {
  private readonly notify = inject(NotifyService);

  /** Public : le gabarit lit son état et son occupation directement. */
  protected readonly push = inject(PushNotificationsService);

  /** L'adresse de CETTE instance — jamais une constante d'environnement. */
  protected readonly appUrl = window.location.origin;

  /**
   * Constater l'état des notifications au premier affichage — jamais avant :
   * la matrice des cas (iOS non installé, permission refusée, serveur sans
   * clé) n'a de sens que sur cet écran-là, et l'interroger ailleurs ferait un
   * appel réseau pour rien.
   */
  async ngOnInit(): Promise<void> {
    await this.push.refresh();
  }

  protected async enablePush(): Promise<void> {
    try {
      await this.push.subscribe();
      if (this.push.state() === 'subscribed') {
        this.notify.success('Notifications activées sur cet appareil.');
      }
    } catch (error) {
      this.notify.error(error, "Impossible d'activer les notifications.");
    }
  }

  protected async disablePush(): Promise<void> {
    try {
      await this.push.unsubscribe();
      this.notify.info('Notifications désactivées sur cet appareil.');
    } catch (error) {
      this.notify.error(error, 'Impossible de désactiver les notifications.');
    }
  }

  protected async copyLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.appUrl);
      this.notify.success('Lien copié.');
    } catch (error) {
      this.notify.error(error, 'Copie impossible — sélectionnez le lien à la main.');
    }
  }
}

import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import type { PushCapability } from '@lfd/contracts';
import { firstValueFrom } from 'rxjs';

import { B2B_API_BASE } from '../../api/api-config';
import {
  isIos,
  pushStateOf,
  pushSupported,
  runningInstalled,
  vapidKeyToBytes,
  type PushState,
} from './web-push';

/** Le chemin du service worker, servi tel quel depuis `public/`. */
const WORKER = '/sw.js';

/**
 * L'abonnement de **cet appareil** aux notifications poussées.
 *
 * Le service ne décide de rien : il constate (le navigateur sait-il faire, la
 * permission, l'abonnement en cours, la clé du serveur) et délègue la lecture
 * de ces faits à `pushStateOf`, qui est pure. Ce partage est ce qui rend la
 * matrice des cas — iOS non installé, permission refusée, serveur sans clé —
 * testable sans navigateur.
 */
@Injectable({ providedIn: 'root' })
export class PushNotificationsService {
  private readonly http = inject(HttpClient);

  private readonly stateValue = signal<PushState>('unsupported');
  /** Ce que l'écran affiche. Lecture seule au dehors. */
  readonly state = this.stateValue.asReadonly();

  private readonly busyValue = signal(false);
  readonly busy = this.busyValue.asReadonly();

  private publicKey: string | null = null;

  /**
   * Constate l'état, sans jamais rien demander.
   *
   * Aucune demande de permission ici : une bannière système qui surgit à
   * l'ouverture d'un écran se fait refuser, et un refus est **définitif** —
   * le navigateur ne redemandera plus. La permission ne se demande que sur un
   * geste explicite.
   */
  async refresh(): Promise<void> {
    const supported = pushSupported();
    this.publicKey = supported ? await this.readPublicKey() : null;
    this.stateValue.set(
      pushStateOf({
        supported,
        publicKey: this.publicKey,
        installed: runningInstalled(),
        ios: isIos(),
        permission: supported ? Notification.permission : 'default',
        subscribed: supported ? (await this.current()) !== null : false,
      }),
    );
  }

  /** Demande la permission, abonne, et déclare l'abonnement au serveur. */
  async subscribe(): Promise<void> {
    const key = this.publicKey;
    if (key === null || this.busyValue()) {
      return;
    }
    this.busyValue.set(true);
    try {
      if ((await Notification.requestPermission()) !== 'granted') {
        await this.refresh();
        return;
      }
      const registration = await navigator.serviceWorker.register(WORKER);
      const subscription = await registration.pushManager.subscribe({
        // Obligatoire, et vrai : chaque poussée fait apparaître une bannière.
        // Une notification silencieuse serait un canal de fond, que ni Chrome
        // ni Safari n'accordent à une application web.
        userVisibleOnly: true,
        applicationServerKey: vapidKeyToBytes(key),
      });
      await firstValueFrom(
        this.http.post<void>(`${B2B_API_BASE}/admin/notifications/push`, subscription.toJSON()),
      );
      await this.refresh();
    } finally {
      this.busyValue.set(false);
    }
  }

  /**
   * Désabonne cet appareil — côté navigateur ET côté serveur.
   *
   * Le serveur d'abord : s'il refuse, on n'a rien perdu. L'inverse laisserait
   * une ligne qui pousse vers un abonnement mort, et on ne l'apprendrait qu'au
   * premier 410.
   */
  async unsubscribe(): Promise<void> {
    const subscription = await this.current();
    if (subscription === null || this.busyValue()) {
      return;
    }
    this.busyValue.set(true);
    try {
      await firstValueFrom(
        this.http.delete<void>(`${B2B_API_BASE}/admin/notifications/push`, {
          body: { endpoint: subscription.endpoint },
        }),
      );
      await subscription.unsubscribe();
      await this.refresh();
    } finally {
      this.busyValue.set(false);
    }
  }

  /** L'abonnement en cours de CE navigateur, ou `null`. */
  private async current(): Promise<PushSubscription | null> {
    const registration = await navigator.serviceWorker.getRegistration(WORKER);
    return (await registration?.pushManager.getSubscription()) ?? null;
  }

  /**
   * La clé publique du serveur, ou `null` s'il n'en a pas — comme si le
   * navigateur ne savait pas faire, du point de vue de l'écran. Un échec
   * réseau rend `null` aussi : mieux vaut dire « indisponible » qu'offrir un
   * bouton qui échouera plus loin.
   */
  private async readPublicKey(): Promise<string | null> {
    try {
      const capability = await firstValueFrom(
        this.http.get<PushCapability>(`${B2B_API_BASE}/admin/notifications/push/key`),
      );
      return capability.publicKey;
    } catch {
      return null;
    }
  }
}

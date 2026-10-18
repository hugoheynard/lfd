import type { HttpClient } from '@angular/common/http';
import { MAX_AUDIENCE_EVENTS_PER_BATCH } from '@lfd/contracts/shop-values';
import type {
  ProductAudienceBatchPayload,
  ProductAudienceEvent,
  ProductAudienceEventInput,
  ProductAudienceSource,
} from '@lfd/contracts/shop-values';

import { AUTH_CONFIG } from '../../auth/auth.config';

/** Au plus un envoi toutes les cinq secondes : un geste n'attend pas le réseau. */
export const AUDIENCE_FLUSH_DELAY_MS = 5_000;

/**
 * La source d'un geste qui ne vient d'aucune suggestion. Écrite ici plutôt
 * qu'importée (`NO_AUDIENCE_SOURCE`) : le paquet initial est à son plafond, et
 * importer la valeur la rangeait dans un morceau initial partagé (2026-10-18).
 */
const DIRECT_SOURCE: ProductAudienceSource = 'none';

/** D'où vient un geste de suggestion : sa source, et l'emplacement compté. */
export interface AudienceOrigin {
  readonly source: ProductAudienceSource;
  readonly placement: string;
}

/** Ce que la file sait faire du réseau — doublé dans les tests. */
export interface AudienceTransport {
  /** Envoi ordinaire, pendant la visite. */
  send(body: string): void;
  /** Envoi de départ (`pagehide`) : la page ne survivra pas à une réponse. */
  sendOnLeave(body: string): void;
}

/** Ce que la file sait faire du temps — doublé dans les tests. */
export interface AudienceTimer {
  schedule(run: () => void, delayMs: number): void;
}

/**
 * **La file des gestes**, vidée par lots.
 *
 * Un geste entre dans la file ; le premier arme un envoi différé, qui part
 * avec tout ce qui s'est accumulé. Au-delà d'un lot plein, on envoie tout de
 * suite — le serveur refuse un lot trop gros entier. À `pagehide`, ce qui
 * reste part par balise. Un envoi qui échoue est perdu : c'est une mesure,
 * et la perdre ne doit jamais coûter un geste au client.
 */
export class ProductAudienceQueue {
  private pending: ProductAudienceEventInput[] = [];
  private armed = false;

  constructor(
    private readonly transport: AudienceTransport,
    private readonly timer: AudienceTimer,
  ) {}

  /**
   * Sans origine, le geste ne vient d'aucune suggestion (vue, ajout direct).
   * Une suggestion porte sa source et son emplacement — pour le staff, l'id
   * de la règle en minuscules (§6 du plan des suggestions du staff).
   */
  record(sku: string, event: ProductAudienceEvent, origin: AudienceOrigin | null = null): void {
    this.pending.push(
      origin === null
        ? { sku, event, source: DIRECT_SOURCE }
        : { sku, event, source: origin.source, placement: origin.placement },
    );
    if (this.pending.length >= MAX_AUDIENCE_EVENTS_PER_BATCH) {
      this.flush(false);
    } else if (!this.armed) {
      this.armed = true;
      this.timer.schedule(() => this.flush(false), AUDIENCE_FLUSH_DELAY_MS);
    }
  }

  /** Envoie ce qui attend, par lots bornés. */
  flush(leaving: boolean): void {
    this.armed = false;
    while (this.pending.length > 0) {
      const payload: ProductAudienceBatchPayload = {
        events: this.pending.splice(0, MAX_AUDIENCE_EVENTS_PER_BATCH),
      };
      const body = JSON.stringify(payload);
      if (leaving) {
        this.transport.sendOnLeave(body);
      } else {
        this.transport.send(body);
      }
    }
  }
}

const AUDIENCE_URL = `${AUTH_CONFIG.apiBaseUrl}/shop/audience`;

/**
 * Le réseau réel. `text/plain` partout : c'est le seul type qu'une balise
 * envoie sans pré-vol CORS, et le serveur relit ce texte en JSON. Un échec
 * est avalé : c'est une mesure, jamais un geste du client.
 */
function browserTransport(http: HttpClient): AudienceTransport {
  return {
    send: (body) => {
      http
        .post<void>(AUDIENCE_URL, body, {
          headers: { 'Content-Type': 'text/plain' },
          keepalive: true,
        })
        .subscribe({ error: () => undefined });
    },
    sendOnLeave: (body) => {
      navigator.sendBeacon(AUDIENCE_URL, new Blob([body], { type: 'text/plain' }));
    },
  };
}

let shared: ProductAudienceQueue | null = null;

/** La file du navigateur, créée au premier geste et vidée au départ de la page. */
export function sharedAudienceQueue(http: HttpClient): ProductAudienceQueue {
  if (shared === null) {
    const queue = new ProductAudienceQueue(browserTransport(http), {
      schedule: (run, delayMs) => setTimeout(run, delayMs),
    });
    addEventListener('pagehide', () => queue.flush(true));
    shared = queue;
  }
  return shared;
}

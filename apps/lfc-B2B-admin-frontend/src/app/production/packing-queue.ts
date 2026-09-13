import { isPlatformBrowser } from '@angular/common';
import { computed, DestroyRef, inject, Injectable, PLATFORM_ID, signal } from '@angular/core';

import { PackingService } from './packing.service';

/** La clé sous laquelle la file tient — une seule, pour pouvoir tout jeter d'un geste. */
const STORAGE_KEY = 'lfc.admin.packing-queue';

/**
 * Un geste en attente : mettre **une** ligne d'**un** bac dedans, ou l'en
 * sortir.
 *
 * Il porte son `packed` plutôt que d'exister en deux sortes : c'est ce qui
 * permet à un second geste sur la même ligne de **remplacer** le premier au lieu
 * de s'ajouter derrière lui. Cocher puis décocher les doigts farinés ne doit pas
 * envoyer deux ordres contradictoires au serveur — seul le dernier compte.
 *
 * ⚠️ La fermeture d'un bac n'entre PAS ici, et ce n'est pas un oubli : c'est un
 * fait irréversible dont le commerce tire son `ready`. Un fait annoncé en
 * différé serait annoncé sans que personne l'ait vu partir.
 */
export interface QueuedPackingMark {
  readonly date: string;
  /** Le numéro de commande — c'est le bac. */
  readonly reference: string;
  readonly sku: string;
  readonly packed: boolean;
  /** Vide autorisé : on coche d'abord, on signe si on veut. */
  readonly initials: string;
}

/**
 * La clé d'unicité : une ligne d'un bac d'une journée, et rien de plus fin.
 *
 * Le bac en fait partie, contrairement à la file de la fiche d'atelier : le même
 * SKU se retrouve dans dix bacs le même jour, et une clé qui l'omettrait ferait
 * qu'une coche chez un client effacerait celle d'un autre.
 */
function keyOf(mark: QueuedPackingMark): string {
  return `${mark.date} ${mark.reference} ${mark.sku}`;
}

/**
 * **Les coches de colisage qui n'ont pas pu partir.** Le fournil est en
 * sous-sol.
 *
 * Sœur de `WorksheetQueue`, et copiée sur elle jusqu'au mécanisme : la coche
 * s'écrit dans l'écran d'abord et part ensuite ; ce qui n'est pas parti attend
 * ici, dans le navigateur, et repart à la reconnexion. Le pied dit combien de
 * gestes attendent — jamais un écran qui a l'air d'avoir enregistré alors que
 * non.
 *
 * **Deux files et non une**, alors que le mécanisme est le même : leurs clés
 * n'ont pas la même forme (le bac s'ajoute à la ligne) et leurs envois ne visent
 * pas la même route. Les fondre demanderait un discriminant dans chaque entrée
 * stockée, donc une migration du `localStorage` des postes le jour où la
 * troisième arrive — pour économiser une soixantaine de lignes.
 *
 * Tolérante à la panne comme sa sœur : un stockage refusé (navigation privée,
 * quota) ne casse rien — la file vit alors en mémoire, et le pied dit toujours
 * la vérité sur ce qui reste à envoyer.
 */
@Injectable({ providedIn: 'root' })
export class PackingQueue {
  private readonly api = inject(PackingService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly marks = signal<readonly QueuedPackingMark[]>([]);
  /**
   * Le vidage en cours. Les appels s'enchaînent derrière lui au lieu de se
   * croiser : deux vidages concurrents enverraient deux fois le même ordre, et
   * un appelant qui repartirait aussitôt croirait que rien n'est parti.
   */
  private inFlight: Promise<void> | null = null;

  /** Combien de gestes attendent. `0` = tout est parti. */
  readonly pending = computed(() => this.marks().length);

  /**
   * Le navigateur se dit-il hors ligne ? Faux au rendu serveur, où la question
   * n'a pas de sens.
   */
  readonly offline = signal(false);

  constructor() {
    const destroyRef = inject(DestroyRef);
    if (!this.isBrowser) {
      return;
    }
    this.marks.set(this.read());
    this.offline.set(!navigator.onLine);

    const onOnline = (): void => {
      this.offline.set(false);
      void this.flush();
    };
    const onOffline = (): void => this.offline.set(true);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    destroyRef.onDestroy(() => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    });

    // Ce qui restait de la session précédente part sans attendre un clic : une
    // coche d'hier soir ne doit pas dépendre de quelqu'un qui rouvre le poste.
    void this.flush();
  }

  /**
   * Enregistre un geste et tente de l'envoyer.
   *
   * Toujours par la file, même en ligne : deux chemins d'écriture — un direct,
   * un différé — divergeraient au premier cas d'erreur, et c'est justement
   * l'erreur qui compte ici.
   */
  mark(mark: QueuedPackingMark): void {
    const key = keyOf(mark);
    this.write([...this.marks().filter((queued) => keyOf(queued) !== key), mark]);
    void this.flush();
  }

  /**
   * Envoie ce qui attend, dans l'ordre, et s'arrête au premier refus.
   *
   * S'arrêter plutôt que continuer : un échec réseau vaut pour les suivants, et
   * les tenter tous ferait autant d'allers-retours perdus. Un refus du serveur
   * (un bac déjà fermé, une journée non arrêtée) n'est pas rattrapable non
   * plus — mais il retient alors la file, et le pied continue de le dire.
   */
  async flush(): Promise<void> {
    if (!this.isBrowser) {
      return;
    }
    // On se met DERRIÈRE le vidage en cours plutôt que d'abandonner : un
    // appelant qui repart sans rien attendre ne saurait pas que son geste n'a
    // pas encore été tenté.
    const run = (this.inFlight ?? Promise.resolve()).then(() => this.drain());
    this.inFlight = run.catch(() => undefined);
    await run;
  }

  private async drain(): Promise<void> {
    for (const mark of [...this.marks()]) {
      try {
        await this.api.mark(mark.date, mark.reference, mark.sku, mark.packed, mark.initials);
      } catch {
        return;
      }
      // Par identité, et non par clé : si la ligne a été recochée PENDANT
      // l'envoi, l'entrée en file n'est plus celle qu'on vient d'envoyer, et
      // la retirer perdrait le dernier geste.
      this.write(this.marks().filter((queued) => queued !== mark));
    }
  }

  private write(marks: readonly QueuedPackingMark[]): void {
    this.marks.set(marks);
    if (!this.isBrowser) {
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(marks));
    } catch {
      // Quota plein ou stockage refusé : la file reste en mémoire pour la
      // session. Elle ne survivra pas à un rechargement, et c'est tout ce qu'on
      // perd — le compteur, lui, continue de dire vrai.
    }
  }

  private read(): readonly QueuedPackingMark[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw === null) {
        return [];
      }
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter(isMark) : [];
    } catch {
      // Une file illisible (version d'avant, édition à la main) vaut une file
      // vide : on ne rejoue pas une forme qu'on ne reconnaît pas.
      return [];
    }
  }
}

/** Une entrée relue tient-elle la forme ? Sinon elle ne sera pas rejouée. */
function isMark(value: unknown): value is QueuedPackingMark {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const mark: Partial<Record<keyof QueuedPackingMark, unknown>> = value;
  return (
    typeof mark.date === 'string' &&
    typeof mark.reference === 'string' &&
    typeof mark.sku === 'string' &&
    typeof mark.packed === 'boolean' &&
    typeof mark.initials === 'string'
  );
}

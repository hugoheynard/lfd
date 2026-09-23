import { Injectable, computed, inject, signal } from '@angular/core';
import { httpErrorMessage } from '@lfd/endpoints';

import { MediaLibraryHttpApi } from './media-library-http-api';

/** Où en est UN fichier du lot. */
export type UploadState = 'attente' | 'envoi' | 'déposé' | 'refusé';

/**
 * Un fichier du lot, et ce qu'il est devenu.
 *
 * Le fichier lui-même est gardé : c'est ce qui permet de **réessayer** ceux qui
 * ont échoué sans redemander à quelqu'un de retrouver les bons dans son
 * explorateur — le geste le plus pénible d'un import en lot raté.
 */
export interface UploadEntry {
  readonly file: File;
  readonly name: string;
  readonly state: UploadState;
  /** Le refus du serveur, en français. `null` tant qu'il n'y a pas de refus. */
  readonly reason: string | null;
}

/**
 * **Le dépôt en lot** — l'écran enchaîne, le serveur prend un fichier à la fois.
 *
 * La route `POST /pim/mediatheque` ne reçoit qu'un `file`. Le « lot » est donc
 * une affaire d'écran, et ce magasin est cet écran-là : il tient la file, l'état
 * de chacun, et le compte rendu.
 */
@Injectable()
export class BatchUploadStore {
  private readonly api = inject(MediaLibraryHttpApi);

  private readonly queue = signal<readonly UploadEntry[]>([]);

  /** La file, pour l'affichage. */
  readonly entries = this.queue.asReadonly();

  readonly running = signal(false);

  readonly deposited = computed(() => this.countOf('déposé'));
  readonly refused = computed(() => this.countOf('refusé'));
  readonly remaining = computed(() => this.countOf('attente') + this.countOf('envoi'));

  /** Y a-t-il de quoi réessayer ? */
  readonly hasRefused = computed(() => this.refused() > 0);

  /**
   * Dépose une sélection, l'une après l'autre.
   *
   * 🔴 **SÉQUENTIEL, et ce n'est pas de la prudence** : le serveur lit les
   * octets en mémoire pour en mesurer le type et les dimensions, et sa garde de
   * transport plafonne à 25 Mo par requête. Vingt fichiers en parallèle, c'est
   * vingt tampons simultanés dans un processus qui sert aussi le back-office.
   *
   * Le lot **ne s'arrête jamais** sur un refus : un fichier mal formé ne doit
   * pas priver les dix-neuf autres de leur dépôt. C'est le compte rendu qui
   * porte l'échec, pas l'interruption.
   *
   * @returns le nombre de fichiers réellement déposés — l'appelant sait alors
   *   s'il a quelque chose à relire.
   */
  async send(files: readonly File[]): Promise<number> {
    this.queue.set(
      files.map((file) => ({ file, name: file.name, state: 'attente', reason: null })),
    );
    return this.drain();
  }

  /**
   * Rejoue les seuls refusés.
   *
   * Sans risque de doublon : la clé de stockage est le SHA-256 du contenu, donc
   * redéposer les mêmes octets retombe sur la même entrée. Un lot à moitié passé
   * se reprend en entier sans qu'on ait à trier.
   */
  async retry(): Promise<number> {
    this.queue.update((current) =>
      current.map((entry) =>
        entry.state === 'refusé' ? { ...entry, state: 'attente', reason: null } : entry,
      ),
    );
    return this.drain();
  }

  /** Oublie le compte rendu. Les fichiers déposés, eux, restent déposés. */
  clear(): void {
    this.queue.set([]);
  }

  private async drain(): Promise<number> {
    this.running.set(true);
    let sent = 0;
    try {
      // Par index et non par itération sur une copie : l'état de chaque entrée
      // est réécrit au fur et à mesure, et l'écran doit le voir avancer.
      for (const [index, entry] of this.queue().entries()) {
        if (entry.state !== 'attente') {
          continue;
        }
        this.mark(index, 'envoi', null);
        try {
          await this.api.upload(entry.file);
          this.mark(index, 'déposé', null);
          sent += 1;
        } catch (caught) {
          // Le refus du serveur vit dans l'enveloppe, pas dans `message` — qui
          // vaudrait « Http failure response for … : 400 ». C'est la phrase
          // française du backend qu'il faut rendre, celle qui nomme le format
          // attendu ou le poids dépassé.
          this.mark(index, 'refusé', httpErrorMessage(caught, 'Dépôt refusé.'));
        }
      }
    } finally {
      this.running.set(false);
    }
    return sent;
  }

  private mark(index: number, state: UploadState, reason: string | null): void {
    this.queue.update((current) =>
      current.map((entry, position) => (position === index ? { ...entry, state, reason } : entry)),
    );
  }

  private countOf(state: UploadState): number {
    return this.queue().filter((entry) => entry.state === state).length;
  }
}

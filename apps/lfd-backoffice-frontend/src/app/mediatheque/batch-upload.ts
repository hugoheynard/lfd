import { Injectable, computed, inject, signal } from '@angular/core';
import { httpErrorMessage } from '@lfd/endpoints';

import { MediaLibraryHttpApi } from './media-library-http-api';
import { IMAGE_MEASURE, checkBeforeUpload } from './upload-check';

/**
 * Où en est UN fichier du lot. `déjà au fonds` n'est pas un échec : les
 * octets y étaient, et rien n'a changé — pas même la série (D2).
 */
export type UploadState = 'attente' | 'envoi' | 'déposé' | 'déjà au fonds' | 'refusé';

/** Qui a refusé : le poste, avant l'envoi, ou le serveur. */
export type RefusedBy = 'poste' | 'serveur';

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
  /** Le refus, en français. `null` tant qu'il n'y a pas de refus. */
  readonly reason: string | null;
  /** `null` tant qu'il n'y a pas de refus. Un refus du poste ne se réessaie pas. */
  readonly refusedBy: RefusedBy | null;
  /**
   * La série que l'image porte APRÈS le dépôt — celle d'origine si elle était
   * déjà au fonds (D2). `null` : aucune, ou pas encore déposée.
   */
  readonly seriesId: string | null;
}

/**
 * **Le dépôt en lot** — l'écran enchaîne, le serveur prend un fichier à la fois.
 *
 * La route `POST /media` ne reçoit qu'un `file`. Le « lot » est donc une
 * affaire d'écran, et ce magasin est cet écran-là : il tient la file, l'état de
 * chacun, et le compte rendu.
 *
 * ⚠️ Cette phrase citait `POST /pim/mediatheque` — une route qui n'a jamais
 * porté ce nom sous cette forme, et dont le préfixe est tombé au déménagement
 * du 2026-09-23. La bibliothèque est un bloc à elle : ses routes sont à la
 * racine.
 *
 * 🔴 **Le compte rendu vit en MÉMOIRE, et rien de plus.** Fermer l'onglet
 * l'efface : personne ne peut dire demain ce qui n'est pas entré aujourd'hui.
 * C'est ce que l'historique persistant des refus doit combler — et il ne
 * remplacera pas cette file, parce que rejouer demande les OCTETS, que seul le
 * navigateur détient.
 */
@Injectable()
export class BatchUploadStore {
  private readonly api = inject(MediaLibraryHttpApi);
  private readonly measure = inject(IMAGE_MEASURE);
  /** La série du lot en cours — elle part avec chaque fichier, réessais compris. */
  private seriesId: string | null = null;

  private readonly queue = signal<readonly UploadEntry[]>([]);

  /** La file, pour l'affichage. */
  readonly entries = this.queue.asReadonly();

  readonly running = signal(false);

  readonly deposited = computed(() => this.countOf('déposé'));
  readonly alreadyKnown = computed(() => this.countOf('déjà au fonds'));
  readonly refused = computed(() => this.countOf('refusé'));
  readonly remaining = computed(() => this.countOf('attente') + this.countOf('envoi'));

  /**
   * Y a-t-il de quoi réessayer ? Seuls les refus du SERVEUR comptent : un
   * fichier refusé par le poste le serait à nouveau, octets inchangés.
   */
  readonly hasRefused = computed(() =>
    this.queue().some((entry) => entry.state === 'refusé' && entry.refusedBy === 'serveur'),
  );

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
   * @returns le nombre de fichiers réellement passés (déposés ou retrouvés au
   *   fonds) — l'appelant sait alors s'il a quelque chose à relire.
   */
  async send(files: readonly File[], seriesId: string | null = null): Promise<number> {
    this.seriesId = seriesId;
    this.queue.set(
      files.map((file) => ({
        file,
        name: file.name,
        state: 'attente',
        reason: null,
        refusedBy: null,
        seriesId: null,
      })),
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
        entry.state === 'refusé' && entry.refusedBy === 'serveur'
          ? { ...entry, state: 'attente', reason: null, refusedBy: null }
          : entry,
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
        this.mark(index, { state: 'envoi' });
        // Vérifié AVANT l'envoi : un fichier que le serveur refuserait ne
        // traverse pas le réseau pour l'apprendre. Le serveur reste l'autorité.
        const local = await checkBeforeUpload(entry.file, this.measure);
        if (local !== null) {
          this.mark(index, { state: 'refusé', reason: local, refusedBy: 'poste' });
          continue;
        }
        try {
          const uploaded = await this.api.upload(entry.file, this.seriesId);
          this.mark(index, {
            state: uploaded.alreadyInLibrary ? 'déjà au fonds' : 'déposé',
            seriesId: uploaded.seriesId,
          });
          sent += 1;
        } catch (caught) {
          // Le refus du serveur vit dans l'enveloppe, pas dans `message` — qui
          // vaudrait « Http failure response for … : 400 ». C'est la phrase
          // française du backend qu'il faut rendre, celle qui nomme le format
          // attendu ou le poids dépassé.
          this.mark(index, {
            state: 'refusé',
            reason: httpErrorMessage(caught, 'Dépôt refusé.'),
            refusedBy: 'serveur',
          });
        }
      }
    } finally {
      this.running.set(false);
    }
    return sent;
  }

  private mark(index: number, patch: Partial<Omit<UploadEntry, 'file' | 'name'>>): void {
    this.queue.update((current) =>
      current.map((entry, position) => (position === index ? { ...entry, ...patch } : entry)),
    );
  }

  private countOf(state: UploadState): number {
    return this.queue().filter((entry) => entry.state === state).length;
  }
}

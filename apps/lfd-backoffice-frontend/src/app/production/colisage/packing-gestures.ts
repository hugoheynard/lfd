import { inject, Injectable, signal } from '@angular/core';

import type { PackingContainerStep, PackingLine, PackingSheet } from '@lfd/contracts';

import { PermissionsStore } from '../../auth/permissions.store';
import { packingMarkKey } from '../packing-board';
import { PackingService } from '../packing.service';
import { serverMessageOf } from '../server-message';
import { PackingDayReader } from './packing-day.reader';

/**
 * **CE QU'ON FAIT** au poste de colisage — cocher, compter un container,
 * déclarer prête — avec l'état de chaque envoi et de chaque échec.
 *
 * Fourni par l'écran (`providers` de `Colisage`), comme {@link PackingDayReader}
 * qu'il injecte. Sorti de `Colisage` le 2026-09-14.
 *
 * 🔴 **Une seule dépendance, dans un seul sens** : chaque geste accepté finit par
 * la relecture d'après écriture du lecteur. Le lecteur, lui, ne connaît pas les
 * gestes. Et les gestes ne connaissent pas la navigation : après une
 * déclaration, c'est l'écran qui oublie le choix et dit « déclarée ».
 *
 * Aucun chiffre n'est écrit ici — l'écran relit ce que le serveur a calculé.
 */
@Injectable()
export class PackingGestures {
  private readonly api = inject(PackingService);
  private readonly permissions = inject(PermissionsStore);
  private readonly day = inject(PackingDayReader);

  /**
   * La dernière coche refusée, avec le produit, la commande et la raison du
   * serveur. 🔴 La case est revenue en arrière : il reste à le DIRE, sinon elle a
   * l'air d'avoir bougé toute seule. Elle se nomme elle-même, d'où qu'ouvrir une
   * autre commande ne l'efface pas.
   */
  private readonly markRefused = signal<string | null>(null);
  readonly markFailed = this.markRefused.asReadonly();

  /** Une déclaration en vol, relecture comprise — le bouton se désarme. */
  private readonly declaring = signal(false);
  readonly closing = this.declaring.asReadonly();

  /** La déclaration vient d'échouer : rien n'a été annoncé au commerce. */
  private readonly declareRefused = signal(false);
  readonly closeFailed = this.declareRefused.asReadonly();

  /** Un geste sur les containers en vol : « + » et « − » se désarment pendant ce temps. */
  private readonly stepping = signal(false);
  readonly containersBusy = this.stepping.asReadonly();

  /** Le geste sur les containers vient d'être refusé. */
  private readonly stepRefused = signal(false);
  readonly containersFailed = this.stepRefused.asReadonly();

  /** Oublie les échecs qui portent sur UNE commande — quand on en ouvre une autre, ou qu'on relit. */
  forgetOrderFailures(): void {
    this.declareRefused.set(false);
    this.stepRefused.set(false);
  }

  /**
   * « + » et « − » s'offrent-ils sur cette commande ? Une commande déclarée prête
   * ne change plus de compte.
   *
   * ⚠️ La LECTURE d'un état servi (`packedAt`), pas une règle calculée : le
   * contrat ne porte pas de `canStepContainers` (vérifié le 2026-09-14). Ici, et
   * nulle part ailleurs : l'écran l'appelle pour ses boutons, le geste pour son
   * garde.
   */
  canStepContainers(sheet: PackingSheet): boolean {
    return sheet.packedAt === null;
  }

  /**
   * « Déclarer prête » est-il permis ? **La règle du serveur**
   * (`canDeclareReady`), et rien d'autre que le geste en vol. Une règle décidée
   * par l'écran aurait proposé un jour un geste que le serveur refuse.
   */
  canDeclare(sheet: PackingSheet): boolean {
    return sheet.canDeclareReady && !this.declaring();
  }

  /**
   * Met une ligne dans le bac, ou l'en sort — puis **relit**.
   *
   * La case se coche avant la réponse et se désarme le temps de l'envoi : un
   * second geste contraire pourrait arriver avant le premier. Refusée, elle
   * revient en arrière et l'écran dit pourquoi. Aucun chiffre n'est réécrit.
   */
  async toggle(sheet: PackingSheet, line: PackingLine, packed: boolean): Promise<void> {
    // 🔴 Deux refus, deux raisons : une commande déclarée prête ne revient pas
    // dessus ; une ligne dont l'article n'est pas sorti du four redeviendra
    // cochable. Le gabarit désarme déjà les deux cases — ce garde-ci tient le
    // clavier, le test et le jour où un `click()` arrive d'ailleurs.
    if (sheet.packedAt !== null || line.awaitingProduction) {
      return;
    }
    // La date est prise UNE fois : la clé de la case et l'envoi doivent parler de
    // la même journée, même si une relecture la change pendant l'envoi.
    const date = this.day.date();
    const key = packingMarkKey(date, sheet.reference, line.sku);
    if (this.day.busy().has(key)) {
      return;
    }
    const initials = this.initials();
    this.markRefused.set(null);
    this.day.setShown(key, packed);
    this.day.setBusy(key, true);
    try {
      await this.api.mark(date, sheet.reference, line.sku, packed, initials);
    } catch (error) {
      this.day.setBusy(key, false);
      this.day.setShown(key, null);
      this.markRefused.set(
        `${line.productName} · ${sheet.customerLabel} — ${serverMessageOf(error)}`,
      );
      return;
    }
    const read = await this.day.rereadAfterWrite();
    this.day.setBusy(key, false);
    // Relue : l'état montré cède la place à ce que le serveur a relu. Pas relue
    // (échec, ou devancée) : il reste — le geste a été ACCEPTÉ, et c'est vrai —
    // jusqu'à la prochaine lecture inscrite, qui l'effacera.
    if (read) {
      this.day.setShown(key, null);
    }
  }

  /**
   * Ajoute ou retire **un** container, puis relit.
   *
   * 🔴 **Un sens, pas un total** : le serveur compte. Aucun compte local, aucun
   * plafond, aucune comparaison à zéro — il rend `remove` à zéro sans effet.
   * Refusé, le geste se dit ; le compte affiché n'a pas bougé.
   */
  async stepContainers(sheet: PackingSheet, step: PackingContainerStep): Promise<void> {
    if (!this.canStepContainers(sheet) || this.stepping()) {
      return;
    }
    this.stepRefused.set(false);
    this.stepping.set(true);
    try {
      await this.api.stepContainers(this.day.date(), sheet.reference, step);
    } catch {
      this.stepRefused.set(true);
      this.stepping.set(false);
      return;
    }
    await this.day.rereadAfterWrite();
    this.stepping.set(false);
  }

  /**
   * **Déclare la commande prête**, puis relit. Le seul geste irréversible du
   * poste, et le seul qui n'attende pas le réseau en silence : un échec reste à
   * l'écran.
   *
   * Rend `true` si la déclaration a été acceptée : l'écran enchaîne alors sur la
   * commande suivante. La relecture déplace aussi la marchandise, les compteurs
   * et l'avancement de la journée — tous calculés au serveur.
   */
  async declare(sheet: PackingSheet): Promise<boolean> {
    if (!this.canDeclare(sheet)) {
      return false;
    }
    this.declaring.set(true);
    this.declareRefused.set(false);
    try {
      await this.api.packOrder(this.day.date(), sheet.reference);
    } catch {
      this.declareRefused.set(true);
      this.declaring.set(false);
      return false;
    }
    await this.day.rereadAfterWrite();
    this.declaring.set(false);
    return true;
  }

  /**
   * Les initiales de qui coche, prises sur la personne connectée — les demander à
   * l'écran ferait taper deux lettres les doigts farinés à chaque ligne.
   */
  private initials(): string {
    const me = this.permissions.identity();
    if (me === null) {
      return '';
    }
    return `${me.firstName.charAt(0)}${me.lastName.charAt(0)}`.toUpperCase();
  }
}

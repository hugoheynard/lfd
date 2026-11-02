import {
  ResupplyNotArrivableError,
  ResupplyNotLaunchedNotMountableError,
} from "./site-resupply-gate-errors.js";
import type {
  ResupplyTarget,
  SiteResupplyDeparture,
  SiteResupplyLaunch,
  SiteResupplyStatus,
  SiteResupplyTrace,
} from "./site-resupply-snapshot.js";

/** Ce que le suivi lit du réassort qui le porte, à l'instant du geste. */
export interface ProgressContext {
  readonly status: SiteResupplyStatus;
  readonly target: ResupplyTarget;
  readonly serviceDay: string;
}

/**
 * **Le suivi d'un réassort envoyé** — lancé, parti, arrivé. Une part de
 * `SiteResupply`, sortie de l'agrégat pour qu'il tienne en un fichier (dette
 * du réassort, 2026-11-02) ; seul l'agrégat la construit et l'appelle,
 * avec son propre état en `ProgressContext`.
 */
export class SiteResupplyProgress {
  constructor(
    private arrivedTrace: SiteResupplyTrace | null,
    private launchedMark: SiteResupplyLaunch | null,
    private departedMark: SiteResupplyDeparture | null,
  ) {}

  get arrived(): SiteResupplyTrace | null {
    return this.arrivedTrace;
  }

  get launched(): SiteResupplyLaunch | null {
    return this.launchedMark;
  }

  get departed(): SiteResupplyDeparture | null {
    return this.departedMark;
  }

  /**
   * **Le fournil l'a lancé** (R4a) — l'affichage, posé par l'abonné au fait
   * `production.resupply_launched`. Seul un « au plus tôt » envoyé se lance,
   * jamais une sortie de réserve (A1.4) ; rejoué, rien ne change.
   *
   * `launchable` : un « au plus tôt » envoyé, hors réserve (décidé par
   * l'agrégat, qui porte la visée et l'origine).
   *
   * @returns `true` si l'affichage vient d'être posé ; `false` sinon (déjà
   *   posé, ou réassort qui n'est pas un « au plus tôt » envoyé — l'abonné
   *   l'écarte sans relivrer le fait sans fin).
   */
  recordLaunch(launchable: boolean, launch: SiteResupplyLaunch): boolean {
    if (!launchable || this.launchedMark !== null) {
      return false;
    }
    this.launchedMark = launch;
    return true;
  }

  /**
   * **La tournée qui porte son transfert est partie** (R4d) — l'affichage,
   * posé par l'abonné au fait `delivery.transfer_departed`. Seul un réassort
   * envoyé part ; rejoué, rien ne change. Aucun refus n'en dépend :
   * « Réceptionner » reste permis avant comme après.
   *
   * @returns `true` si l'affichage vient d'être posé ; `false` sinon.
   */
  recordDeparture(context: ProgressContext, departure: SiteResupplyDeparture): boolean {
    if (context.status !== "placed" || this.departedMark !== null) {
      return false;
    }
    this.departedMark = departure;
    return true;
  }

  /**
   * **« Il est là »** (l'arrivée au point, R3e) — le même signal pour les deux chemins : la
   * réception au site du transfert qui le porte, ou « Monté » au fournil.
   * `reception`, lue par l'appelant (`null` avant « Réceptionner »).
   *
   * Refusé sur une demande en cours ou un réassort annulé. Déjà arrivé, ou
   * déjà réceptionné (le comptoir fait foi, il n'attend pas le signal), rien
   * ne change : `false`, et personne ne sonne une seconde fois.
   *
   * @returns `true` si le réassort vient de passer d'attendu à arrivé.
   * @throws {ResupplyNotArrivableError}
   */
  markArrived(
    context: ProgressContext,
    trace: SiteResupplyTrace,
    reception: SiteResupplyTrace | null,
  ): boolean {
    if (context.status !== "placed") {
      throw new ResupplyNotArrivableError(context.status === "draft");
    }
    if (this.arrivedTrace !== null || reception !== null) {
      return false;
    }
    this.arrivedTrace = trace;
    return true;
  }

  /**
   * **« Monté »** (R3e) — « il est là » par le geste du fournil. Un « au plus
   * tôt » n'est monté qu'une fois LANCÉ (« Lancer » puis « Monté », Q4, R4c) : avant, il n'est pas
   * au plan, rien n'a été fabriqué pour lui. Déjà arrivé ou réceptionné, rien
   * ne change et rien n'est refusé. `launched` est lu au fournil par
   * l'appelant, jamais à la colonne d'affichage du commerce.
   *
   * @returns `true` si le réassort vient de passer d'attendu à arrivé.
   * @throws {ResupplyNotArrivableError} @throws {ResupplyNotLaunchedNotMountableError}
   */
  markMounted(
    context: ProgressContext,
    trace: SiteResupplyTrace,
    reception: SiteResupplyTrace | null,
    launched: boolean,
  ): boolean {
    const awaited = context.status === "placed" && this.arrivedTrace === null && reception === null;
    if (awaited && context.target === "asap" && !launched) {
      throw new ResupplyNotLaunchedNotMountableError(context.serviceDay);
    }
    return this.markArrived(context, trace, reception);
  }
}

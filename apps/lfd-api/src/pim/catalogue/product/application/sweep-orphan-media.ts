import { Logger } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../../../platform/time/clock.js";
import { MediaStore } from "../../../../platform/storage/media-store.js";
import { MediaLibrary } from "../domain/ports/media-library.js";

/**
 * Le délai de grâce : on ne ramasse rien de plus récent.
 *
 * Il protège l'image **déposée mais pas encore enregistrée**. Déposer crée une
 * inscription sans fiche — indiscernable d'un orphelin par sa seule forme — et
 * la personne qui compose une fiche produit peut très bien y revenir le
 * lendemain. Sept jours couvre largement une session de travail interrompue,
 * pour un coût de stockage nul à notre échelle.
 *
 * Le raccourcir n'accélérerait rien d'utile : l'objet ne coûte que son octet.
 */
const GRACE_DAYS = 7;

/**
 * Plafond par passage. Un premier ramassage sur un arriéré ne doit ni tourner
 * une heure ni saturer R2 d'appels ; ce qui dépasse attend le lendemain, et le
 * rapport le dit plutôt que de laisser croire que tout a été traité.
 */
const MAX_PER_RUN = 200;

/** Ce qu'un passage a fait — et ce qu'il a laissé. */
export interface OrphanSweepReport {
  /** Objets réellement supprimés du bucket. */
  readonly removed: number;
  /** Lignes oubliées en base (plusieurs peuvent partager une clé). */
  readonly forgotten: number;
  /** Candidats redevenus vivants entre le recensement et la suppression. */
  readonly spared: number;
  /** `true` si le plafond a été atteint : il reste du travail. */
  readonly capped: boolean;
}

export class SweepOrphanMediaCommand {}

/**
 * Ramasse les visuels que plus aucune fiche ne porte.
 *
 * ## Pourquoi il faut un ramassage
 *
 * Rien ne supprime jamais un objet au fil de l'eau, et c'est délibéré :
 * `replaceMedia` détache sans supprimer, parce que les mêmes octets tombent sur
 * la même clé et peuvent donc servir une fiche voisine. Seul un comptage global
 * sait qu'un objet n'a plus aucun lecteur — c'est ici.
 *
 * ## L'ordre est la sûreté
 *
 * **L'objet d'abord, les lignes ensuite.** L'inverse est tentant (la base est
 * plus rapide) et il est faux : supprimer les lignes en premier, puis échouer
 * sur R2, effacerait la seule trace de ce qu'il reste à supprimer — l'octet
 * resterait dans le bucket, et plus rien au monde ne pourrait le désigner. Une
 * fuite définitive, et silencieuse.
 *
 * À l'endroit, l'échec laisse des lignes qui pointent un objet disparu, sans
 * fiche pour les afficher. Personne ne le voit, et le passage suivant les
 * ramasse.
 *
 * ## La fenêtre qui reste
 *
 * Entre le recensement et la suppression, quelqu'un peut redéposer la même
 * image et l'attacher. `isStillOrphan` est donc rejoué juste avant chaque
 * suppression, ce qui ramène la fenêtre à quelques millisecondes sans la
 * fermer — seul un verrou la fermerait, pour un risque qui ne le mérite pas.
 * Le pire cas est un visuel cassé sur une fiche, réparable en redéposant le
 * même fichier : l'adressage par contenu rend le remède identique à la cause.
 */
@CommandHandler(SweepOrphanMediaCommand)
export class SweepOrphanMediaHandler implements ICommandHandler<
  SweepOrphanMediaCommand,
  OrphanSweepReport
> {
  private readonly logger = new Logger(SweepOrphanMediaHandler.name);

  constructor(
    private readonly library: MediaLibrary,
    private readonly store: MediaStore,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<OrphanSweepReport> {
    const before = this.graceCutoff();
    const candidates = await this.library.findOrphanKeys(before, MAX_PER_RUN);

    let removed = 0;
    let forgotten = 0;
    let spared = 0;

    for (const storageKey of candidates) {
      if (!(await this.library.isStillOrphan(storageKey, before))) {
        spared += 1;
        continue;
      }
      await this.store.remove(storageKey);
      forgotten += await this.library.forget(storageKey);
      removed += 1;
    }

    const report = { removed, forgotten, spared, capped: candidates.length === MAX_PER_RUN };
    this.report(report);
    return report;
  }

  private graceCutoff(): Date {
    const cutoff = new Date(this.clock.now());
    cutoff.setUTCDate(cutoff.getUTCDate() - GRACE_DAYS);
    return cutoff;
  }

  /**
   * Un passage qui ne trouve rien ne dit rien — c'est le cas nominal, et le
   * journaliser tous les jours noierait celui qui compte.
   *
   * Le plafond atteint, lui, se dit TOUJOURS : un ramassage qui tronque en
   * silence se lit comme un ramassage complet, et c'est ainsi qu'on croit un
   * bucket propre pendant des mois.
   */
  private report(report: OrphanSweepReport): void {
    if (report.capped) {
      this.logger.warn(
        `Ramassage plafonné à ${String(MAX_PER_RUN)} objets — il en reste, prochain passage demain.`,
      );
    }
    if (report.removed > 0 || report.spared > 0) {
      this.logger.log(
        `Visuels orphelins — ${String(report.removed)} objet(s) supprimé(s), ` +
          `${String(report.forgotten)} ligne(s) oubliée(s), ${String(report.spared)} épargné(s).`,
      );
    }
  }
}

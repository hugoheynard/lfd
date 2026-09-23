import { Logger } from "@nestjs/common";
import { CommandHandler, type ICommandHandler } from "@nestjs/cqrs";

import { Clock } from "../../platform/time/clock.js";
import { MediaStore } from "../../platform/storage/media-store.js";
import { MediaCarriers } from "../channels/carriers/media-carriers.js";
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
/**
 * `@sans-journal` — **un ramassage n'a pas d'auteur.**
 *
 * Le journal répond à « qui a changé ça, et quand ». Ici, personne : une passe
 * automatique, sans `Principal`, sur des objets que plus aucun porteur
 * n'affiche. Un fait sans acteur donnerait une ligne à laquelle la question ne
 * s'applique pas, et noierait celles auxquelles elle s'applique.
 *
 * Ce qui le remplace, et qui est le bon outil pour un automate : le rapport en
 * sortie. Il dit ce qui a été supprimé, ce qui a été épargné, et **toujours**
 * quand le plafond a mordu.
 *
 * ⚠️ La dérogation deviendrait fausse le jour où un humain déclencherait le
 * ramassage depuis un écran : il aurait un nom, et la question redeviendrait
 * la bonne.
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
    private readonly carriers: MediaCarriers,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<OrphanSweepReport> {
    const before = this.graceCutoff();
    const candidates = await this.library.findCandidates(before, MAX_PER_RUN);

    let removed = 0;
    let forgotten = 0;
    let spared = 0;

    // 🔴 **Qui affiche quoi, c'est aux PORTEURS de le dire.** La bibliothèque
    // ne lit pas leurs tables (`lint:prisma-model-ownership`), et depuis que la
    // clé étrangère est tombée, plus rien en base ne refuse la suppression d'une
    // image affichée. Ce comptage EST la règle de Hugo — « on ne supprime pas
    // une image qui a été mappée quelque part ».
    //
    // ⚠️ Un porteur qui ne répond pas fait ÉCHOUER le passage, et c'est
    // délibéré : le silence ne vaut pas « zéro emploi ». Sans cette
    // propagation, une panne de port deviendrait un effacement de masse — le
    // pire mode de défaillance imaginable pour ce handler.
    const uses = await this.carriers.usesOf(candidates.map((candidate) => candidate.url));

    for (const candidate of candidates) {
      if ((uses.get(candidate.url) ?? 0) > 0) {
        spared += 1;
        continue;
      }
      // Rejoué juste avant la suppression : entre le recensement et ce
      // moment-ci, quelqu'un peut avoir redéposé la même image.
      const url = await this.library.stillOld(candidate.storageKey, before);
      if (url === null || (await this.carriers.usesOf([url])).get(url) !== undefined) {
        spared += 1;
        continue;
      }
      await this.store.remove(candidate.storageKey);
      forgotten += await this.library.forget(candidate.storageKey);
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

import {
  BusinessError,
  DomainError,
  ResourceNotFoundError,
  TechnicalError,
} from "../../../../platform/shared/errors/app-error.js";

/**
 * Les refus du **lot de prélèvement figé** (plan
 * `documentation/comptabilite/prelevement/lot-de-prelevement-fige.md`).
 *
 * Lus par la comptabilité, sans le code sous les yeux : chacun nomme le cas
 * réel et le geste de sortie. Aucun ne porte d'IBAN — un message part au client
 * HTTP tel quel (`AppErrorFilter`).
 */

/** L'identifiant d'un lot n'est pas un ULID : il ne peut pas entrer dans `MsgId`. */
export class InvalidBatchIdError extends DomainError {
  constructor(readonly raw: string) {
    super(
      "accounting.collection.invalid_batch_id",
      `L'identifiant de lot « ${raw} » n'est pas un ULID : les références SEPA du fichier ne peuvent pas en dériver.`,
    );
  }
}

/** On a demandé un cycle qui n'est pas encore clos. */
export class CycleNotClosedError extends BusinessError {
  constructor(readonly closesAt: Date) {
    super(
      "accounting.collection.cycle_not_closed",
      `Le cycle ne clôture que le ${closesAt.toISOString()} : un lot ne se constitue qu'après la clôture. Télécharger l'aperçu en attendant.`,
    );
  }
}

/**
 * La première clôture enregistrée n'est pas une clôture du rythme de
 * facturation de l'entité (§6 bis ; au rythme depuis R4 du plan
 * `plan-rythme-de-facturation.md` — avant, « un 1er du mois »). Inatteignable
 * par la constitution, qui ne clôture qu'aux clôtures du rythme ; écrite pour
 * le jour où une clôture anticipée sera proposée. Le code garde sa valeur
 * d'origine : une valeur n'est pas un nom.
 */
export class FirstClosureOffRhythmError extends DomainError {
  constructor(readonly closesAt: Date) {
    super(
      "accounting.collection.first_closure_off_calendar",
      `La première clôture enregistrée doit être une clôture du calendrier de facturation de l'entité (celle d'au moins un de ses clients), à 00h00 (Paris) — reçu ${closesAt.toISOString()}. Le lot doit se clore à l'instant où se clôt une facture qu'il encaisse.`,
    );
  }
}

/** Une clôture qui ne suit pas la précédente : elle rendrait deux fois les mêmes jours. */
export class ClosureNotAfterPreviousError extends BusinessError {
  constructor(
    readonly closesAt: Date,
    readonly previous: Date,
  ) {
    super(
      "accounting.collection.closure_not_after_previous",
      `La clôture ${closesAt.toISOString()} ne suit pas la dernière enregistrée (${previous.toISOString()}). Annuler le lot de ce cycle avant de le reconstituer.`,
    );
  }
}

/**
 * Le cycle qu'on constituerait se clôt AVANT la mise en service du
 * prélèvement (le plancher) : aucune commande ne peut être à la fois après le
 * plancher et avant la clôture. Sans ce refus, la constitution répondait
 * « aucune commande à prélever », qui fait chercher une commande manquante.
 */
export class CollectionNotYetOpenError extends BusinessError {
  constructor(
    readonly floorAt: Date,
    readonly firstClosure: Date,
  ) {
    super(
      "accounting.collection.not_yet_open",
      `La première période prélevable se clôt le ${parisLongDay(firstClosure)} : les commandes passées avant le ${parisLongDay(floorAt)} (mise en service du prélèvement) n'entrent dans aucun lot.`,
    );
  }
}

const LONG_DAY = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Europe/Paris",
});

/** Le jour civil à Paris, en toutes lettres : « 1er novembre 2026 ». */
export function parisLongDay(date: Date): string {
  const parts = LONG_DAY.formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((entry) => entry.type === type)?.value ?? "";
  const dayOfMonth = part("day");
  return `${dayOfMonth === "1" ? "1er" : dayOfMonth} ${part("month")} ${part("year")}`;
}

/** Rien à constituer : aucun schéma n'a de ligne, ou chacun a déjà son lot. */
export class NothingToCollectError extends BusinessError {
  constructor(readonly excludedCount: number) {
    super(
      "accounting.collection.nothing_to_collect",
      excludedCount === 0
        ? "Aucune commande à prélever pour cette entité sur ce cycle, ou son lot existe déjà."
        : `Aucune ligne à prélever pour cette entité sur ce cycle ; ${String(excludedCount)} commande(s) écartée(s), leurs raisons sont à l'écran du cycle.`,
    );
  }
}

export class CollectionBatchNotFoundError extends ResourceNotFoundError {
  constructor(readonly batchId: string) {
    super("accounting.collection.batch_not_found", `Lot de prélèvement introuvable : ${batchId}.`);
  }
}

/** Un geste sur un lot qui n'est plus `constituted`. */
export class BatchNotConstitutedError extends BusinessError {
  constructor(
    readonly batchId: string,
    readonly status: string,
  ) {
    super(
      "accounting.collection.batch_not_constituted",
      `Le lot ${batchId} est « ${status} » : seul un lot constitué s'annule ou se marque déposé.`,
    );
  }
}

/**
 * « Annuler » sur un lot déposé. Le refus existait déjà (seul un lot
 * constitué s'annule) ; il nomme désormais ce qu'il évite et la sortie que
 * la procédure donne (doc `procedure-de-prelevement.md` § 2.8, § 7).
 */
export class DepositedBatchNotCancellableError extends BusinessError {
  constructor(readonly batchId: string) {
    super(
      "accounting.collection.deposited_batch_not_cancellable",
      `Ce lot (${batchId}) est déposé : l'annuler ferait prélever deux fois si la remise est signée, car ses commandes repasseraient dans le lot suivant. Si la banque a rejeté le fichier (accusé PSR1) après « J'ai déposé », l'outil n'a pas encore de geste pour le dé-déposer : ne rien redéposer et prévenir Hugo (procédure de prélèvement, § 2.8).`,
    );
  }
}

/**
 * « J'ai déposé le fichier dans CENET » sur un lot dont personne n'a
 * téléchargé le fichier : ce qui a été déposé n'est pas ce fichier-là.
 */
export class BatchNeverDownloadedError extends BusinessError {
  constructor(readonly batchId: string) {
    super(
      "accounting.collection.batch_never_downloaded",
      `Le fichier du lot ${batchId} n'a jamais été téléchargé : il ne peut pas avoir été déposé dans CENET. Télécharger le fichier de remise, le déposer, puis marquer le lot déposé.`,
    );
  }
}

/** Q2 : une société sans mandat rend le lot indéposable, et on la nomme. */
export class BatchHasUnmandatedCompaniesError extends BusinessError {
  constructor(readonly companies: readonly string[]) {
    super(
      "accounting.collection.unmandated_companies",
      `Ce lot ne peut pas être déposé : sans mandat prélevable — ${companies.join(", ")}. Faire signer le mandat (ou le régler autrement), puis annuler le lot et le reconstituer.`,
    );
  }
}

/** La relecture du dépôt : un mandat a changé, ou une commande a été annulée. */
export class DepositRecheckFailedError extends BusinessError {
  constructor(readonly problems: readonly string[]) {
    super(
      "accounting.collection.deposit_recheck_failed",
      `Dépôt refusé — ce fichier ne correspond plus à la réalité : ${problems.join(" ; ")}. Annuler le lot puis le reconstituer.`,
    );
  }
}

/** Le fichier stocké ne correspond plus à son empreinte : il ne sort pas. */
export class BatchFileTamperedError extends TechnicalError {
  constructor(readonly batchId: string) {
    super(
      "accounting.collection.file_tampered",
      `Le fichier du lot ${batchId} ne correspond plus à son empreinte SHA-256 : il a été modifié en base depuis sa constitution. Ne rien déposer ; prévenir la technique.`,
    );
  }
}

/** Le plancher n'est pas posé : la migration n'est pas passée, ou la ligne a disparu. */
export class CollectionFloorMissingError extends TechnicalError {
  constructor() {
    super(
      "accounting.collection.floor_missing",
      "Le plancher des lots de prélèvement (`collection_floor`) est absent : aucun lot ne se constitue sans lui. Vérifier que la migration « le_lot_de_prelevement_fige » est déployée.",
    );
  }
}

/**
 * La constitution veut verrouiller ses candidats sans verrou fourni : faute
 * de câblage, jamais un cas métier (doc `documentation/commandes/annulation/annulation-par-le-staff.md`, C5.3).
 */
export class CollectionRowsLockMissingError extends TechnicalError {
  constructor() {
    super(
      "accounting.collection.rows_lock_missing",
      "La constitution d'un lot exige le verrou des commandes candidates, et aucun n'a été fourni : rien n'a été constitué. Signalez-le à l'équipe technique.",
    );
  }
}

export class CollectionOrderNotFoundError extends ResourceNotFoundError {
  constructor(readonly orderId: string) {
    super(
      "accounting.collection.order_not_found",
      `Commande ${orderId} introuvable parmi les commandes prélevables (passée au compte après le plancher).`,
    );
  }
}

/** Une transition d'état d'encaissement interdite. */
export class OrderCollectionTransitionError extends BusinessError {
  constructor(
    readonly orderId: string,
    readonly from: string,
    readonly gesture: string,
  ) {
    super(
      "accounting.collection.order_transition",
      `La commande ${orderId} est « ${from} » : « ${gesture} » ne s'y applique pas.`,
    );
  }
}

/** « Réglée autrement » sans note : on ne saurait plus comment. */
export class SettlementNoteRequiredError extends DomainError {
  constructor() {
    super(
      "accounting.collection.settlement_note_required",
      "Dire comment la commande a été réglée (virement, chèque, lien de paiement…) : la note est obligatoire.",
    );
  }
}

/**
 * Un identifiant du `pain.008` dépasse `Max35Text`. Il n'est jamais coupé : une
 * RUM ou un `EndToEndId` tronqué désignerait une autre ligne pour la banque.
 */
export class SepaIdentifierTooLongError extends BusinessError {
  constructor(field: string, value: string, line: string, limit: number) {
    super(
      "accounting.collection.sepa_identifier_too_long",
      `${field} « ${value} » (${line}) fait ${String(value.length)} caractères, ${String(limit)} au plus : ` +
        "le fichier de prélèvement ne peut pas être produit. Corriger la référence à la source (mandat ou lot) avant de le régénérer.",
    );
  }
}

/** Une adresse de procédure qui ne désigne ni une entité ni une clôture lisibles. */
export class CollectionProcedureNotFoundError extends ResourceNotFoundError {
  constructor(readonly procedureId: string) {
    super(
      "accounting.collection.procedure_not_found",
      `Procédure de prélèvement introuvable : ${procedureId}. Repartez de la liste « Procédure de prélèvement ».`,
    );
  }
}

/**
 * Le lot n'était plus dans l'état chargé au moment de l'écrire : un autre
 * geste (dépôt, annulation, rejet) l'a fait changer entre-temps. L'écriture
 * conditionnelle du dépôt refuse plutôt que d'écraser — sans elle, un dépôt et
 * une annulation simultanés laissaient le dernier gagner, et les commandes
 * dans l'état de l'autre.
 */
export class CollectionBatchChangedConcurrentlyError extends BusinessError {
  constructor(
    readonly batchId: string,
    readonly expectedStatus: string,
  ) {
    super(
      "accounting.collection.batch_changed_concurrently",
      `Le lot ${batchId} a changé d'état pendant le geste (il n'est plus « ${expectedStatus} ») : rien n'a été enregistré. Relisez le lot, puis refaites le geste s'il a encore lieu d'être.`,
    );
  }
}

/**
 * Une échéance de prélèvement qui n'est pas un jour du calendrier. Levée à la
 * relecture d'un lot ou à sa constitution : l'échéance sort du calendrier
 * TARGET2, une forme fausse signale donc une donnée abîmée, pas une saisie.
 */
export class InvalidCollectionDayError extends DomainError {
  constructor(readonly raw: string) {
    super(
      "accounting.collection.invalid_day",
      `L'échéance de prélèvement « ${raw} » n'est pas un jour du calendrier (AAAA-MM-JJ). Prévenir la technique : le lot ne peut pas partir avec une date de prélèvement fausse.`,
    );
  }
}

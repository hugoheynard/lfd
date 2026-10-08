import {
  BusinessError,
  DomainError,
  ResourceNotFoundError,
  TechnicalError,
} from "../../../../platform/shared/errors/app-error.js";

/**
 * Les refus du **lot de prélèvement figé** (plan
 * `documentation/comptabilite/plan-lot-de-prelevement-fige.md`).
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
 * La première clôture enregistrée ne tombe pas sur un 1er du mois (§6 bis).
 * Inatteignable par la constitution d'aujourd'hui, qui ne clôture qu'au 1er ;
 * écrite pour le jour où une clôture anticipée sera proposée.
 */
export class FirstClosureNotOnFirstOfMonthError extends DomainError {
  constructor(readonly closesAt: Date) {
    super(
      "accounting.collection.first_closure_off_calendar",
      `La première clôture enregistrée doit tomber un 1er du mois à 00h00 (Paris) — reçu ${closesAt.toISOString()}. Le relevé de cycle a déjà montré des mois civils aux clients.`,
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
      `Le premier mois prélevable se clôt le ${parisLongDay(firstClosure)} : les commandes passées avant le ${parisLongDay(floorAt)} (mise en service du prélèvement) n'entrent dans aucun lot.`,
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
function parisLongDay(date: Date): string {
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

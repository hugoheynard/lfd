import { sanitiseSubject, type RenderedMail } from "@lfd/mailer";

import { DEFAULT_MAIL_LOCALE, fill, mailCopyOf } from "./copy/mail-copy.js";
import type { ProductionDossierUpdatedCopy } from "./copy/mail-copy.model.js";
import type { StaffShell } from "./production-dossier-mail.js";

/**
 * Une quantité déjà dite dans l'unité de l'article (« 12 », « 1,25 kg ») :
 * l'appelant la met en forme, le gabarit la place.
 */
export interface DossierUpdatedProductionLine {
  readonly productName: string;
  readonly before: string;
  readonly after: string;
  /** L'écart signé, « +15 », « −250 g ». */
  readonly delta: string;
}

/** Une ligne de commande dont la quantité a changé. */
export interface DossierUpdatedLineChange {
  readonly productName: string;
  readonly before: string;
  readonly after: string;
}

/** L'envoi concerné : sa référence (`null` pour une commande retirée inconnue) et son rang. */
export interface DossierUpdatedShipment {
  readonly reference: string | null;
  readonly rank: number;
}

/** Pourquoi un envoi est entré au plan, prêt à dire (les raisons de l'écran des versions). */
export type DossierUpdatedEntryReason =
  "arrested" | "retaken" | "retaken_off_plan" | "rearrested" | "rearrested_off_plan" | "unknown";

/** Un changement de commande, en une ligne. */
export type DossierUpdatedChange =
  | {
      readonly kind: "entered";
      readonly shipment: DossierUpdatedShipment;
      readonly reason: DossierUpdatedEntryReason;
      /** L'heure du geste, « 19 h 10 » : celle du retirage pour une entrée par retirage. */
      readonly atLabel: string;
    }
  | {
      readonly kind: "revised" | "modified_during_reopen" | "lines_changed";
      readonly shipment: DossierUpdatedShipment;
      readonly lines: readonly DossierUpdatedLineChange[];
    }
  | {
      readonly kind: "withdrawn" | "left_after_withdrawal";
      readonly shipment: DossierUpdatedShipment;
    };

/** Un réassort lancé, entré au plan ou sorti du plan. */
export interface DossierUpdatedResupply {
  readonly kind: "launched" | "entered" | "left";
  readonly siteLabel: string | null;
  readonly name: string | null;
}

/**
 * Les données du courriel **« Dossier de production mis à jour »** (doc
 * `documentation/fournil/les-versions-du-plan.md`) : le
 * dossier de la version courante, renvoyé à un destinataire dont la version
 * reçue est dépassée, avec ce qui a changé depuis SA version.
 *
 * Tout arrive en structure, les quantités déjà dites : la mise en mots est
 * ici, au dictionnaire des e-mails. Le gabarit ne sait rien du fournil.
 * Aucune date : la demande traverse la boîte d'envoi (`jsonb`).
 */
export interface ProductionDossierUpdatedMailData {
  /** Vide quand on ne le connaît pas : « Bonjour, » tout court. */
  readonly firstName: string;
  /** Le jour de service en toutes lettres, « mercredi 7 octobre 2026 ». */
  readonly dayLabel: string;
  /** La version courante, celle du papier joint. */
  readonly version: number;
  /** La version contre laquelle le résumé compare : la dernière reçue, ou la première. */
  readonly sinceVersion: number;
  /** `false` : le destinataire n'avait reçu aucune version, le résumé part de la première. */
  readonly received: boolean;
  readonly production: readonly DossierUpdatedProductionLine[];
  readonly changes: readonly DossierUpdatedChange[];
  /** Les changements tus : « et N autres ». */
  readonly otherChanges: number;
  readonly resupplies: readonly DossierUpdatedResupply[];
  /** Les sorties dont la raison est au commerce, toutes. */
  readonly toCheck: readonly DossierUpdatedShipment[];
  readonly pdfBase64: string;
  /** `dossier-du-jour-…-version-<n>.pdf`. */
  readonly fileName: string;
}

/** Les mots, dans la langue de repli : l'équipe lit le français. */
function copyOf(): ProductionDossierUpdatedCopy {
  return mailCopyOf(DEFAULT_MAIL_LOCALE)["staff.production-dossier-updated"];
}

/** « Dossier de production mis à jour — plan du mercredi 7 octobre 2026 ». */
export function productionDossierUpdatedSubject(data: ProductionDossierUpdatedMailData): string {
  return fill(copyOf().subject, { day: data.dayLabel });
}

function shipmentOf(shipment: DossierUpdatedShipment, copy: ProductionDossierUpdatedCopy): string {
  const reference = shipment.reference ?? copy.shipmentUnknown;
  return shipment.rank > 1
    ? fill(copy.shipmentRank, { reference, rank: String(shipment.rank) })
    : reference;
}

function linesOf(
  lines: readonly DossierUpdatedLineChange[],
  copy: ProductionDossierUpdatedCopy,
): string {
  return lines
    .map((line) =>
      fill(copy.lineChange, { product: line.productName, before: line.before, after: line.after }),
    )
    .join(", ");
}

const ENTRY_TEXTS = {
  arrested: "enteredArrested",
  retaken: "enteredRetaken",
  retaken_off_plan: "enteredRetakenOffPlan",
  rearrested: "enteredRearrested",
  rearrested_off_plan: "enteredRearrestedOffPlan",
  unknown: "enteredUnknown",
} as const satisfies Record<DossierUpdatedEntryReason, keyof ProductionDossierUpdatedCopy>;

const LINE_TEXTS = {
  revised: "revised",
  modified_during_reopen: "modifiedDuringReopen",
  lines_changed: "linesChanged",
} as const satisfies Record<string, keyof ProductionDossierUpdatedCopy>;

const EXIT_TEXTS = {
  withdrawn: "withdrawn",
  left_after_withdrawal: "leftAfterWithdrawal",
} as const satisfies Record<string, keyof ProductionDossierUpdatedCopy>;

/** Un changement en une ligne, comme l'écran des versions le dit. */
function changeOf(change: DossierUpdatedChange, copy: ProductionDossierUpdatedCopy): string {
  const shipment = shipmentOf(change.shipment, copy);
  switch (change.kind) {
    case "entered":
      return fill(copy[ENTRY_TEXTS[change.reason]], { shipment, at: change.atLabel });
    case "revised":
    case "modified_during_reopen":
    case "lines_changed":
      return fill(copy[LINE_TEXTS[change.kind]], { shipment, lines: linesOf(change.lines, copy) });
    case "withdrawn":
    case "left_after_withdrawal":
      return fill(copy[EXIT_TEXTS[change.kind]], { shipment });
  }
}

const RESUPPLY_TEXTS = {
  launched: "resupplyLaunched",
  entered: "resupplyEntered",
  left: "resupplyLeft",
} as const satisfies Record<DossierUpdatedResupply["kind"], keyof ProductionDossierUpdatedCopy>;

function resupplyOf(resupply: DossierUpdatedResupply, copy: ProductionDossierUpdatedCopy): string {
  const site = resupply.siteLabel ?? copy.resupplyWithoutSite;
  const named =
    resupply.name === null ? site : fill(copy.resupplyNamed, { site, name: resupply.name });
  return fill(copy[RESUPPLY_TEXTS[resupply.kind]], { site: named });
}

function bullets(lines: readonly string[]): string {
  return lines.map((line) => `– ${line}`).join("\n");
}

/** L'effet sur la production, puis les commandes, les réassorts, et ce qui est à vérifier. */
function summaryOf(
  data: ProductionDossierUpdatedMailData,
  copy: ProductionDossierUpdatedCopy,
): readonly string[] {
  const production =
    data.production.length === 0
      ? [copy.productionUnchanged]
      : [
          `${copy.productionHeading}\n${bullets(
            data.production.map((line) =>
              fill(copy.productionLine, {
                product: line.productName,
                before: line.before,
                after: line.after,
                delta: line.delta,
              }),
            ),
          )}`,
        ];
  const others =
    data.otherChanges === 0
      ? []
      : [
          fill(data.otherChanges > 1 ? copy.otherChanges : copy.otherChange, {
            count: String(data.otherChanges),
          }),
        ];
  const changes =
    data.changes.length === 0
      ? []
      : [
          `${copy.changesHeading}\n${bullets([
            ...data.changes.map((change) => changeOf(change, copy)),
            ...others,
          ])}`,
        ];
  const resupplies =
    data.resupplies.length === 0
      ? []
      : [bullets(data.resupplies.map((resupply) => resupplyOf(resupply, copy)))];
  const toCheck =
    data.toCheck.length === 0
      ? []
      : [
          `${copy.toCheckHeading}\n${bullets(
            data.toCheck.map((shipment) =>
              fill(copy.toCheckLine, { shipment: shipmentOf(shipment, copy) }),
            ),
          )}`,
        ];
  return [...production, ...changes, ...resupplies, ...toCheck];
}

/** Le corps, en texte : la coquille en fait le HTML, retours à la ligne compris. */
export function productionDossierUpdatedBody(data: ProductionDossierUpdatedMailData): string {
  const copy = copyOf();
  const values = {
    day: data.dayLabel,
    version: String(data.version),
    since: String(data.sinceVersion),
  };
  return [
    data.firstName === ""
      ? copy.greetingWithoutName
      : fill(copy.greeting, { firstName: data.firstName }),
    fill(data.received ? copy.intro : copy.introNothingReceived, values),
    ...summaryOf(data, copy),
    copy.signature,
  ].join("\n\n");
}

/** Le rendu : le dossier de la version courante joint. */
export function renderProductionDossierUpdatedMail(
  data: ProductionDossierUpdatedMailData,
  shell: StaffShell,
): RenderedMail {
  const copy = copyOf();
  return {
    subject: sanitiseSubject(productionDossierUpdatedSubject(data)),
    ...shell({
      kicker: copy.kicker,
      title: productionDossierUpdatedSubject(data),
      body: productionDossierUpdatedBody(data),
      footer: copy.footer,
    }),
    attachments: [
      { filename: data.fileName, contentBase64: data.pdfBase64, contentType: "application/pdf" },
    ],
  };
}

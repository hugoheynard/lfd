import { ORDER_ORIGIN_LABELS } from "@lfd/contracts";

import type { ProductionOrderSnapshot } from "../entities/production-day.js";

/**
 * **L'en-tête d'un bon du dossier, en phrases prêtes à poser** (E1b,
 * 2026-10-06) — qui, où, quand, et ce que le livreur doit savoir avant de
 * sonner. Les mêmes mentions, dans le même ordre, que la fiche de l'écran
 * (`lfd-backoffice-frontend/…/fiche-production/`, relue le 2026-10-06) : le
 * dossier envoyé est le même papier que l'impression.
 *
 * Fonction pure, sans mise en page : ce qui se dit est testé ici, ce qui se
 * dessine dans `day-dossier-pdf.ts`.
 *
 * 🔴 **Une commande figée avant le lot** (`sheetDetails: null`) garde le rendu
 * d'avant — l'étiquette, la destination en une ligne, l'échéance. Ce qu'elle
 * ne porte pas est OMIS, jamais écrit « undefined » ni deviné.
 */
export interface DossierSheetHead {
  /** L'enseigne, sinon la raison sociale (ou la personne). */
  readonly title: string;
  /** La raison sociale sous l'enseigne, quand les deux existent. */
  readonly subtitle: string | null;
  /** Le point nommé, puis l'adresse en lignes. */
  readonly where: readonly string[];
  /** L'heure convenue, ou « Sans heure convenue » — un blanc se lirait comme un oubli. */
  readonly when: string;
  /** Livraison seulement : qui appeler, ou « Aucun contact sur place ». */
  readonly contact: string | null;
  readonly signature: string | null;
  readonly origin: string | null;
  readonly note: string | null;
}

const NO_TIME = "Sans heure convenue";
const NO_CONTACT = "Aucun contact sur place";
const SIGNATURE = "Signature exigée à la remise";
const HOLDER = "détenteur du compte";

/** Compose l'en-tête d'un bon. */
export function dossierSheetHeadOf(order: ProductionOrderSnapshot): DossierSheetHead {
  const details = order.sheetDetails;
  if (details === null) {
    return {
      title: order.customerLabel,
      subtitle: null,
      where: order.destination === "" ? [] : [order.destination],
      when: order.dueAt === null ? NO_TIME : `Pour ${order.dueAt}`,
      contact: null,
      signature: null,
      origin: null,
      note: null,
    };
  }
  const delivery = order.fulfillmentMethod === "delivery";
  const address = details.address;
  const addressLines =
    address === null
      ? []
      : [address.line1, address.line2, `${address.postalCode} ${address.city}`.trim()];
  return {
    title: details.tradeName === "" ? details.legalName : details.tradeName,
    subtitle: details.tradeName === "" ? null : details.legalName,
    where: [details.pickupLabel ?? "", ...addressLines].filter((line) => line !== ""),
    when: details.window === null ? NO_TIME : windowLabel(details.window),
    contact: delivery ? contactLine(details.contact) : null,
    signature: delivery && details.signatureRequired ? SIGNATURE : null,
    origin: details.recurring ? ORDER_ORIGIN_LABELS.recurring : null,
    note: details.note === "" ? null : details.note,
  };
}

function contactLine(
  contact: NonNullable<ProductionOrderSnapshot["sheetDetails"]>["contact"],
): string {
  if (contact === null) {
    return NO_CONTACT;
  }
  const parts = [contact.name, contact.phone, contact.source === "holder" ? HOLDER : ""];
  return parts.filter((part) => part !== "").join(" · ");
}

/** « 8 h 00 – 10 h 00 », ou « avant 10 h 00 » sans début — l'écriture du back-office. */
function windowLabel(window: { readonly start: string | null; readonly end: string }): string {
  return window.start === null
    ? `avant ${timeLabel(window.end)}`
    : `${timeLabel(window.start)} – ${timeLabel(window.end)}`;
}

/** « 8 h 30 » à partir de « 08:30 » ; une valeur illisible est rendue telle quelle. */
function timeLabel(time: string): string {
  const match = /^(\d{1,2}):(\d{2})/u.exec(time);
  return match === null ? time : `${String(Number(match[1]))} h ${match[2] ?? "00"}`;
}

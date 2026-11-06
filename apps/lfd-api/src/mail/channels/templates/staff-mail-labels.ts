import type { AppointmentChannel, AppointmentPurpose } from "@lfd/contracts";

/**
 * Les libellés français du motif et du canal d'un échange, tels que les
 * courriels internes à l'équipe les écrivent.
 *
 * Ici, à côté des gabarits qui les affichent, parce que DEUX contextes les
 * emploient — la croissance (rendez-vous pris) et les comptes (demande de
 * rappel) — et qu'aucun des deux ne possède l'autre : un seul endroit, sans
 * arête entre eux. Le back-office a les siens (`@lfd/b2b-ui`,
 * `purpose-labels.ts`), dans une bibliothèque Angular que le backend ne peut
 * pas importer ; les libellés courts y sont les mêmes, et doivent le rester.
 */
const PURPOSE_LABELS: Readonly<Record<AppointmentPurpose, string>> = {
  discover: "Découverte",
  quote: "Devis",
  order: "Commande",
  recurring: "Récurrence",
  billing: "Facturation",
  account: "Compte",
  other: "Autre",
};

const CHANNEL_LABELS: Readonly<Record<AppointmentChannel, string>> = {
  phone: "Téléphone",
  visio: "Visio",
  onsite: "Sur place",
};

/** Le motif, en deux mots — l'objet d'un courriel interne. */
export function purposeLabel(purpose: AppointmentPurpose): string {
  return PURPOSE_LABELS[purpose];
}

/** Le canal d'un rendez-vous. */
export function appointmentChannelLabel(channel: AppointmentChannel): string {
  return CHANNEL_LABELS[channel];
}

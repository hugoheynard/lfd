import { sanitiseSubject, type LayoutInput, type LayoutRow, type RenderedMail } from "@lfd/mailer";

/** Ce que l'avis annonce — le gabarit choisit ses mots en fonction. */
export type CollectionNoticeMailKind = "notice" | "correction" | "cancellation";

/**
 * Les données de l'**avis de prélèvement** (pré-notification SEPA, plan
 * `documentation/comptabilite/prelevement/prelevement-automatique.md`, PA2).
 * Destinataire : le contact de facturation de la société payeuse, ou son
 * détenteur. Tout est déjà mis en forme : le gabarit ne calcule rien.
 */
export interface CollectionNoticeMailData {
  readonly kind: CollectionNoticeMailKind;
  readonly creditorName: string;
  /** L'ICS — il se déclare avec la RUM, et c'est lui que la banque affiche. */
  readonly creditorIdentifier: string;
  readonly debtorName: string;
  /** Le montant, en euros, déjà formaté (« 1 234,56 € »). */
  readonly amount: string;
  /** La date du prélèvement, en toutes lettres (« jeudi 15 octobre 2026 »). */
  readonly collectionDay: string;
  /** La RUM du mandat. */
  readonly mandateReference: string;
  /** La référence de l'arrêté de facturation ; vide pour une annulation et une ligne de factures. */
  readonly statementReference: string;
  /** Les factures que la ligne encaisse (E4) ; vide pour une ligne d'arrêté. */
  readonly invoiceNumbers: readonly string[];
  /** Pour un rectificatif : ce qu'annonçait l'avis précédent. */
  readonly previous: { readonly amount: string; readonly collectionDay: string } | null;
}

/** La coquille client, prêtée par le registre. */
export type NoticeShell = (input: Omit<LayoutInput, "brand" | "supportEmail">) => string;

const TITLES: Readonly<Record<CollectionNoticeMailKind, string>> = {
  notice: "Avis de prélèvement",
  correction: "Avis de prélèvement rectifié",
  cancellation: "Prélèvement annulé",
};

/**
 * Le rendu, à part de `mail-templates.ts` : le registre n'en garde qu'une
 * ligne. Sobre, en français : un montant, une date, les deux références que
 * le payeur rapprochera de son relevé (RUM, ICS), et celle de la pièce
 * réglée — ses factures (E4), ou l'arrêté d'un lot d'avant.
 */
export function renderCollectionNoticeMail(
  data: CollectionNoticeMailData,
  shell: NoticeShell,
): RenderedMail {
  return {
    subject: sanitiseSubject(`${TITLES[data.kind]} — ${data.creditorName} · ${data.collectionDay}`),
    html: shell({
      title: TITLES[data.kind],
      body: bodyOf(data),
      rows: rowsOf(data),
      footer:
        "Ce prélèvement SEPA est effectué au titre du mandat référencé ci-dessus. " +
        "Pour toute question, répondez à ce message avant la date du prélèvement.",
    }),
  };
}

function bodyOf(data: CollectionNoticeMailData): string {
  const head = `Bonjour,\n\n`;
  if (data.kind === "cancellation") {
    return (
      `${head}Le prélèvement de ${data.amount} que nous vous avions annoncé pour le ` +
      `${data.collectionDay} sur le compte de ${data.debtorName} n'aura pas lieu. ` +
      `Aucune somme ne sera débitée à cette date.`
    );
  }
  const intro = data.kind === "correction" ? `Cet avis remplace le précédent. ` : "";
  return (
    `${head}${intro}${data.creditorName} prélèvera ${data.amount} sur le compte de ` +
    `${data.debtorName} le ${data.collectionDay}, au titre ${settledPieces(data)}.`
  );
}

/** Ce que le prélèvement règle : des factures émises (E4), ou l'arrêté d'avant. */
function settledPieces(data: CollectionNoticeMailData): string {
  const numbers = data.invoiceNumbers;
  if (numbers.length === 0) {
    return `de l'arrêté de facturation ${data.statementReference}`;
  }
  return numbers.length === 1
    ? `de la facture ${numbers.join("")}`
    : `des factures ${numbers.join(", ")}`;
}

function pieceRow(data: CollectionNoticeMailData): LayoutRow {
  const numbers = data.invoiceNumbers;
  if (numbers.length === 0) {
    return { label: "Arrêté de facturation", value: data.statementReference };
  }
  return { label: numbers.length === 1 ? "Facture" : "Factures", value: numbers.join(", ") };
}

function rowsOf(data: CollectionNoticeMailData): readonly LayoutRow[] {
  const references: LayoutRow[] = [
    { label: "Créancier", value: data.creditorName },
    { label: "Identifiant créancier (ICS)", value: data.creditorIdentifier },
    { label: "Référence du mandat (RUM)", value: data.mandateReference },
  ];
  if (data.kind === "cancellation") {
    return [
      { label: "Montant annulé", value: data.amount },
      { label: "Date annoncée", value: data.collectionDay },
      ...references,
    ];
  }
  return [
    ...(data.previous === null
      ? []
      : [
          {
            label: "Annoncé précédemment",
            value: `${data.previous.amount} le ${data.previous.collectionDay}`,
          },
        ]),
    { label: "Date du prélèvement", value: data.collectionDay },
    ...references,
    pieceRow(data),
    { label: "Montant", value: data.amount, strong: true },
  ];
}

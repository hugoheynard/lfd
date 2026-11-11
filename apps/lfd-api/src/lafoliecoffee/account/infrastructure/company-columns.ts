import type { Company, CompanySoftState } from "../domain/entities/company.js";
import { DirectDebitBlock } from "../domain/value-objects/direct-debit-block.js";
import { KbisDeposit } from "../domain/value-objects/kbis-deposit.js";

/**
 * Les colonnes de `companies` que `save()` écrit depuis l'agrégat — hors
 * statut et hiérarchie, que l'agrégat ne livre que s'ils ont bougé.
 */
export function companyColumnsOf(state: ReturnType<Company["toPersistence"]>) {
  return {
    enseigne: state.enseigne,
    raisonSociale: state.raisonSociale,
    formeJuridique: state.formeJuridique,
    siret: state.siret,
    siren: state.siren,
    vatNumber: state.vatNumber,
    ...contactColumns(state.contact),
    grantedTerms: [...state.grantedTerms],
    requestedTerm: state.requestedTerm,
    activatedAt: state.activatedAt,
    activatedByStaffId: state.activatedBy?.staffUserId ?? null,
    activatedByName: state.activatedBy?.name ?? null,
    activatedByRole: state.activatedBy?.role ?? null,
    suspensionCause: state.suspensionCause,
    nafCode: state.nafCode,
    preferredFulfillmentMethod: state.fulfillmentPreference.method,
    preferredPickupAddressId: state.fulfillmentPreference.pickupAddressId,
    preferredDeliveryAddressId: state.fulfillmentPreference.deliveryAddressId,
    deliverySignatureRequired: state.fulfillmentPreference.signatureRequired,
    ...kbisColumns(state.kbis),
    ...directDebitBlockColumns(state.directDebitBlock),
  };
}

export type CompanyColumns = ReturnType<typeof companyColumnsOf>;

/**
 * Les seules colonnes qui ont changé entre le chargement et l'enregistrement.
 *
 * C'est ce qui empêche deux gestes concurrents sur une même société de
 * s'effacer : chacun n'écrit que ce qu'il a touché, et un blocage du
 * prélèvement ne remet pas à blanc la certification du KBIS posée entre-temps.
 * Deux gestes sur la MÊME colonne restent au dernier qui écrit.
 */
export function changedColumns(
  before: CompanyColumns,
  after: CompanyColumns,
): Partial<CompanyColumns> {
  const changed: Partial<CompanyColumns> = {};
  for (const key of Object.keys(after) as (keyof CompanyColumns)[]) {
    if (!sameColumn(before[key], after[key])) {
      Object.assign(changed, { [key]: after[key] });
    }
  }
  return changed;
}

/** Une valeur de colonne : scalaire, date, ou liste de scalaires. */
function sameColumn(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * Les cinq colonnes du détenteur, aplaties — **vides** quand il n'y en a pas.
 *
 * C'est ici, et nulle part ailleurs, qu'on choisit la chaîne vide : les colonnes
 * sont non nulles, le domaine dit `null`, et cette traduction est un détail de
 * schéma. La lecture fait le chemin inverse (adresse vide ⇒ pas de détenteur),
 * si bien que l'aller-retour est fidèle.
 */
export function contactColumns(contact: CompanySoftState["contact"]): {
  contactPrenom: string;
  contactNom: string;
  contactFonction: string;
  contactEmail: string;
  contactTelephone: string;
} {
  return {
    contactPrenom: contact?.firstName ?? "",
    contactNom: contact?.lastName ?? "",
    contactFonction: contact?.fonction ?? "",
    contactEmail: contact?.email ?? "",
    contactTelephone: contact?.phone ?? "",
  };
}

/** Une chaîne vide n'est pas une valeur : c'est une absence. */
function blankToNull(value: string | undefined): string | null {
  return value === undefined || value.trim() === "" ? null : value;
}

/** Les colonnes du KBIS d'une ligne `companies`, avant rehydratation. */
interface KbisRow {
  readonly kbisStorageKey: string | null;
  readonly kbisFileName: string | null;
  readonly kbisContentType: string | null;
  readonly kbisSize: number | null;
  readonly kbisUploadedAt: Date | null;
  readonly kbisCertifiedAt: Date | null;
  readonly kbisCertifiedByStaffId: string | null;
  readonly kbisCertifiedByName: string | null;
  readonly kbisCertifiedByRole: string | null;
}

/**
 * Ligne → dépôt, ou `null` quand aucun extrait n'est arrivé.
 *
 * Les quatre colonnes du fichier sont nullables **ensemble** : elles sont
 * écrites d'un seul geste. On exige quand même les quatre, plutôt que de se
 * fier à `kbisStorageKey` seul — une ligne à moitié écrite donnerait un dépôt
 * dont le domaine croirait le fichier complet.
 */
export function kbisOf(row: KbisRow): KbisDeposit | null {
  if (
    row.kbisStorageKey === null ||
    row.kbisFileName === null ||
    row.kbisContentType === null ||
    row.kbisSize === null
  ) {
    return null;
  }
  return KbisDeposit.reconstitute(
    {
      storageKey: row.kbisStorageKey,
      fileName: row.kbisFileName,
      contentType: row.kbisContentType,
      size: row.kbisSize,
      // Un extrait déposé avant que la colonne existe : sa date est inconnue,
      // pas « maintenant ». On prend l'époque plutôt que de mentir sur un fait.
      uploadedAt: row.kbisUploadedAt ?? new Date(0),
    },
    // La trace n'est pas séparable de l'instant : sans `at`, il n'y a pas de
    // certification, quel que soit ce que les trois autres colonnes portent.
    row.kbisCertifiedAt === null
      ? null
      : {
          at: row.kbisCertifiedAt,
          byStaffUserId: row.kbisCertifiedByStaffId ?? "",
          byName: row.kbisCertifiedByName ?? "",
          byRole: row.kbisCertifiedByRole ?? "",
        },
  );
}

/**
 * Dépôt → colonnes. Toutes écrites à chaque fois, y compris à `null` : c'est ce
 * qui fait qu'un remplacement d'extrait efface la certification précédente sans
 * qu'aucune ligne ici ne parle de remise à zéro — l'agrégat a rendu un dépôt
 * neuf, et un dépôt neuf n'a pas de certification.
 */
export function kbisColumns(kbis: KbisDeposit | null): {
  kbisStorageKey: string | null;
  kbisFileName: string | null;
  kbisContentType: string | null;
  kbisSize: number | null;
  kbisUploadedAt: Date | null;
  kbisCertifiedAt: Date | null;
  kbisCertifiedByStaffId: string | null;
  kbisCertifiedByName: string | null;
  kbisCertifiedByRole: string | null;
} {
  const certification = kbis?.certification ?? null;
  return {
    kbisStorageKey: kbis?.file.storageKey ?? null,
    kbisFileName: kbis?.file.fileName ?? null,
    kbisContentType: kbis?.file.contentType ?? null,
    kbisSize: kbis?.file.size ?? null,
    kbisUploadedAt: kbis?.file.uploadedAt ?? null,
    kbisCertifiedAt: certification?.at ?? null,
    kbisCertifiedByStaffId: certification?.byStaffUserId ?? null,
    // Chaîne vide ⇒ `null` en base : « aucun nom connu » est une absence, pas
    // un nom vide — et la lecture n'a ainsi qu'un seul cas à traiter.
    kbisCertifiedByName: blankToNull(certification?.byName),
    kbisCertifiedByRole: blankToNull(certification?.byRole),
  };
}

/** Les colonnes du blocage du prélèvement d'une ligne `companies`. */
interface DirectDebitBlockRow {
  readonly directDebitBlockedAt: Date | null;
  readonly directDebitBlockedBy: string | null;
  readonly directDebitBlockReason: string | null;
}

/**
 * Ligne → blocage, ou `null`. Les trois colonnes sont nulles ou posées ensemble
 * (contrainte `companies_direct_debit_block_complete`) ; on exige quand même
 * les trois plutôt que l'instant seul.
 */
export function directDebitBlockOf(row: DirectDebitBlockRow): DirectDebitBlock | null {
  if (
    row.directDebitBlockedAt === null ||
    row.directDebitBlockedBy === null ||
    row.directDebitBlockReason === null
  ) {
    return null;
  }
  return DirectDebitBlock.reconstitute(
    row.directDebitBlockedAt,
    row.directDebitBlockedBy,
    row.directDebitBlockReason,
  );
}

/** Blocage → colonnes, toujours les trois : débloquer les remet à `null` ensemble. */
export function directDebitBlockColumns(block: DirectDebitBlock | null): DirectDebitBlockRow {
  return {
    directDebitBlockedAt: block?.blockedAt ?? null,
    directDebitBlockedBy: block?.blockedBy ?? null,
    directDebitBlockReason: block?.reason ?? null,
  };
}

import { Injectable } from "@nestjs/common";

import { CompanyStatus, CustomerRole } from "../../../platform/database/client/client.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { ShelfChanges } from "../../shared/shelf-changes/domain/ports/shelf-changes.js";
import { companyShelves } from "../../shared/shelf-changes/domain/shelf-change-scope.js";
import { IdGenerator } from "../../../platform/id/id-generator.js";
import type { BusinessError } from "../../../platform/shared/errors/app-error.js";
import { referenceFrom } from "../../../platform/id/reference.js";
import { Company } from "../domain/entities/company.js";
import {
  CompanyChangedMeanwhileError,
  CompanyChangedSinceReadError,
  SiretAlreadyRegisteredError,
} from "../domain/errors/account-errors.js";
import { CompanyRepository, type KbisLocation } from "../domain/ports/company.repository.js";
import { ContactDetails } from "../domain/value-objects/contact-details.js";
import { HierarchyPlace } from "../domain/value-objects/hierarchy-place.js";
import {
  changedColumns,
  companyColumnsOf,
  contactColumns,
  directDebitBlockOf,
  kbisOf,
  type CompanyColumns,
} from "./company-columns.js";

/** Préfixe de la référence société — ce que le `P-` du produit est à un article. */
const COMPANY_PREFIX = "C";

/**
 * Dérive une référence `C-XXXXXX` d'un ULID — même dérivation que le `P-` d'un
 * produit et le `R-` d'une révision, elle vit dans `platform/id/reference.ts`.
 * Aucun `Math.random` (déterminisme + traçabilité via `IdGenerator`), et
 * l'unicité finale reste **garantie** par la colonne `@unique`.
 */
function deriveReference(ulid: string): string {
  return referenceFrom(COMPANY_PREFIX, ulid);
}

/** Nombre de re-tirages avant d'abandonner (une collision est déjà quasi impossible). */
const REFERENCE_MAX_ATTEMPTS = 5;

/**
 * Référence libre à la lecture — re-tire tant que la valeur est déjà prise, pour
 * éviter qu'une collision (extrêmement rare) ne fasse échouer la création avec un
 * P2002 trompeur. L'`@unique` reste la garantie finale sous course concurrente.
 * `draw` fournit une nouvelle référence à chaque appel (ULID monotone distinct).
 */
async function pickFreeCompanyReference(
  draw: () => string,
  isTaken: (reference: string) => Promise<boolean>,
): Promise<string> {
  for (let attempt = 0; attempt < REFERENCE_MAX_ATTEMPTS; attempt += 1) {
    const reference = draw();
    if (!(await isTaken(reference))) {
      return reference;
    }
  }
  // Extrêmement improbable : on rend quand même une valeur, l'index tranchera.
  return draw();
}

/** Adaptateur Prisma du port des sociétés. */
@Injectable()
export class PrismaCompanyRepository extends CompanyRepository {
  /** Chaque agrégat chargé, tel qu'il était : la base de l'écart que `save()` écrit. */
  private readonly loaded = new WeakMap<
    Company,
    { readonly columns: CompanyColumns; readonly status: CompanyStatus }
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdGenerator,
    private readonly shelves: ShelfChanges,
  ) {
    super();
  }

  /** Une référence société neuve, dérivée d'un ULID frais (déterministe en test). */
  private drawReference(): string {
    return deriveReference(this.ids.next());
  }

  async existsBySiret(siret: string): Promise<boolean> {
    const found = await this.prisma.company.findFirst({
      where: { siret },
      select: { id: true },
    });
    return found !== null;
  }

  /**
   * Société + rattachement du créateur dans **une transaction** : sans elle, un
   * échec entre les deux écritures laisserait une société sans aucun membre —
   * invisible depuis « Mes entreprises », donc impossible à récupérer ou à
   * supprimer par le client.
   */
  async declareOwnedBy(company: Company, ownerUserId: string): Promise<string> {
    const id = await this.prisma.$transaction(async (tx) => {
      const reference = await pickFreeCompanyReference(
        this.drawReference.bind(this),
        async (candidate) => {
          const clash = await tx.company.findUnique({
            where: { reference: candidate },
            select: { id: true },
          });
          return clash !== null;
        },
      );
      const created = await tx.company.create({
        data: {
          reference,
          raisonSociale: company.raisonSociale,
          enseigne: company.enseigne,
          formeJuridique: company.formeJuridique,
          siret: company.siretDigits,
          siren: company.sirenDigits,
          vatNumber: company.vatNumber,
          ...contactColumns(company.toPersistence().contact),
          // Fait de naissance : écrit ici, jamais par `save`.
          declaredVia: company.declaredVia,
          // Déclarée, pas cliente : l'activation est commerciale.
          status: CompanyStatus.pending,
        },
        select: { id: true },
      });

      await tx.membership.create({
        data: {
          userId: ownerUserId,
          companyId: created.id,
          // Le créateur EST le détenteur de sa société : le rôle se constate,
          // il ne s'attribue pas.
          role: CustomerRole.owner,
        },
      });

      return created.id;
    });
    // Après la transaction, par lisibilité : depuis le 2026-11-06 (lot M2), une
    // transaction directe a aussi sa file d'après validation (`transactional-prisma.ts`).
    this.shelves.changed(companyShelves(id));
    return id;
  }

  /**
   * Société créée **par le staff**, sans propriétaire : le contact principal est
   * saisi (pas dérivé d'un profil), aucun `membership` n'est posé. Jumeau assumé
   * de {@link declareOwnedBy} moins le rattachement — légitime car la société
   * reste **visible du staff** (lecture cross-tenant) et sera **réclamée** plus
   * tard par le client (invitation). Une seule écriture, donc pas de transaction.
   */
  async declareUnowned(company: Company): Promise<string> {
    const reference = await pickFreeCompanyReference(
      this.drawReference.bind(this),
      async (candidate) => {
        const clash = await this.prisma.company.findUnique({
          where: { reference: candidate },
          select: { id: true },
        });
        return clash !== null;
      },
    );
    // L'unicité du SIRET est tenue par un index PARTIEL en base ; la
    // vérification applicative en amont ne fait que donner un beau message. Deux
    // commerciaux qui ouvrent le même client à la même seconde la passent tous
    // les deux — c'est ici que le second est arrêté, et il doit l'être dans la
    // langue du métier, pas par un code Prisma.
    try {
      const created = await this.prisma.company.create({
        data: {
          reference,
          raisonSociale: company.raisonSociale,
          enseigne: company.enseigne,
          formeJuridique: company.formeJuridique,
          siret: company.siretDigits,
          siren: company.sirenDigits,
          vatNumber: company.vatNumber,
          ...contactColumns(company.toPersistence().contact),
          // Fait de naissance : écrit ici, jamais par `save`.
          declaredVia: company.declaredVia,
          // Un sous-compte naît rattaché (sous-comptes §4) ; le verrou de
          // la hiérarchie est pris par le handler.
          parentCompanyId: company.parentCompanyId,
          // Déclarée, pas cliente : l'activation reste commerciale.
          status: CompanyStatus.pending,
        },
        select: { id: true },
      });
      this.shelves.changed(companyShelves(created.id));
      return created.id;
    } catch (error) {
      throw translateSiretClash(error, company.siretDigits);
    }
  }

  async load(companyId: string): Promise<Company | null> {
    const row = await this.prisma.company.findUnique({
      where: { id: companyId },
      // Une EXISTENCE : la profondeur se juge sur « a-t-il des sous-comptes ».
      include: { subAccounts: { select: { id: true }, take: 1 } },
    });
    if (row === null) {
      return null;
    }
    const company = Company.reconstitute({
      id: row.id,
      raisonSociale: row.raisonSociale,
      enseigne: row.enseigne,
      formeJuridique: row.formeJuridique,
      siret: row.siret,
      siren: row.siren,
      vatNumber: row.vatNumber,
      // Adresse vide ⇒ **aucun détenteur**, et non un contact sans nom : la
      // société a été ouverte sur son enseigne seule, le rattachement viendra.
      // Passer ces colonnes vides à `ContactDetails.create` lèverait d'ailleurs
      // sur l'e-mail, et une fiche parfaitement légitime deviendrait illisible.
      contact:
        row.contactEmail.trim() === ""
          ? null
          : ContactDetails.create({
              firstName: row.contactPrenom,
              lastName: row.contactNom,
              fonction: row.contactFonction,
              email: row.contactEmail,
              phone: row.contactTelephone,
            }),
      grantedTerms: row.grantedTerms,
      requestedTerm: row.requestedTerm,
      status: row.status,
      activatedAt: row.activatedAt,
      // Trace absente ⇒ `null` entier, jamais un objet à champs vides : « on ne
      // sait pas qui » et « quelqu'un sans nom » ne disent pas la même chose.
      activatedBy:
        row.activatedByStaffId === null
          ? null
          : {
              staffUserId: row.activatedByStaffId,
              name: row.activatedByName ?? "",
              role: row.activatedByRole ?? "",
            },
      suspensionCause: row.suspensionCause,
      declaredVia: row.declaredVia,
      nafCode: row.nafCode,
      kbis: kbisOf(row),
      directDebitBlock: directDebitBlockOf(row),
      hierarchy: HierarchyPlace.reconstitute({
        parentCompanyId: row.parentCompanyId,
        hasSubAccounts: row.subAccounts.length > 0,
        groupWithoutDelivery: row.groupWithoutDelivery,
      }),
      revision: row.revision,
      fulfillmentPreference: {
        method: row.preferredFulfillmentMethod,
        pickupAddressId: row.preferredPickupAddressId,
        deliveryAddressId: row.preferredDeliveryAddressId,
        signatureRequired: row.deliverySignatureRequired,
      },
    });
    // Ce que l'agrégat écrirait tel quel : `save()` n'écrira que l'écart.
    this.loaded.set(company, {
      columns: companyColumnsOf(company.toPersistence()),
      status: row.status,
    });
    return company;
  }

  /**
   * N'écrit que les colonnes changées depuis {@link load} ({@link changedColumns}),
   * et monte la révision d'un cran. Deux conditions, chacune seulement quand
   * elle a lieu d'être :
   *
   * - le statut, quand il change, doit valoir encore en base ce qu'on avait
   *   lu : une réactivation partie d'une fiche « suspendue » ne rouvre pas un
   *   compte résilié entre-temps ;
   * - la révision, quand le geste a été décidé sur une fiche lue
   *   (`Company.readAt`), doit être encore celle-là : sinon deux écrans ouverts
   *   sur la même fiche s'écraseraient entre le chargement et l'écriture.
   *
   * Sans l'une ni l'autre, l'écriture est libre : deux gestes concurrents sur
   * des colonnes différentes gardent chacun ce qu'il a écrit.
   *
   * @throws {CompanyChangedMeanwhileError} le statut a changé depuis le chargement.
   * @throws {CompanyChangedSinceReadError} la fiche lue a été réécrite depuis.
   */
  async save(company: Company): Promise<void> {
    const id = company.id;
    if (id === null) {
      throw new Error("save() attend un agrégat déjà persisté (id manquant).");
    }
    const state = company.toPersistence();
    const columns = companyColumnsOf(state);
    const loaded = this.loaded.get(company);
    const data = {
      ...(loaded === undefined ? columns : changedColumns(loaded.columns, columns)),
      // La hiérarchie seulement si elle a bougé (cf. `hierarchyChange`) : une
      // écriture d'identité ne réécrit pas un rattachement fait entre-temps.
      ...(state.hierarchyChange ?? {}),
      // Le statut seulement s'il a bougé (cf. `statusChange`) : dans le
      // `SET`, il fait monter l'estampille du principal même à valeur égale.
      ...(state.statusChange ?? {}),
    };
    if (Object.keys(data).length > 0) {
      await this.write(id, data, {
        revision: company.readAt,
        status: state.statusChange === null ? null : (loaded?.status ?? null),
      });
    }
    this.loaded.set(company, { columns, status: state.status });
    // Statut, rattachement, conditions : le rayon de la société et de ses sites.
    this.shelves.changed(companyShelves(id));
  }

  /** L'écriture, conditionnée sur ce qui doit ne pas avoir bougé (cf. {@link save}). */
  private async write(
    id: string,
    data: Partial<CompanyColumns> & {
      readonly status?: CompanyStatus;
      readonly parentCompanyId?: string | null;
      readonly groupWithoutDelivery?: boolean;
    },
    expected: { readonly revision: number | null; readonly status: CompanyStatus | null },
  ): Promise<void> {
    const bumped = { ...data, revision: { increment: 1 } };
    if (expected.revision === null && expected.status === null) {
      await this.prisma.company.update({ where: { id }, data: bumped });
      return;
    }
    const { count } = await this.prisma.company.updateMany({
      where: {
        id,
        ...(expected.revision === null ? {} : { revision: expected.revision }),
        ...(expected.status === null ? {} : { status: expected.status }),
      },
      data: bumped,
    });
    if (count === 0) {
      throw await this.whatChanged(id, expected.status);
    }
  }

  /**
   * Laquelle des deux conditions a manqué : le statut a son propre refus, plus
   * précis, et il l'emporte.
   */
  private async whatChanged(
    id: string,
    loadedStatus: CompanyStatus | null,
  ): Promise<BusinessError> {
    const row = await this.prisma.company.findUnique({ where: { id }, select: { status: true } });
    if (loadedStatus !== null && row?.status !== loadedStatus) {
      return new CompanyChangedMeanwhileError(id);
    }
    return new CompanyChangedSinceReadError(id);
  }

  async kbisLocation(companyId: string): Promise<KbisLocation | null> {
    const row = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { kbisStorageKey: true, kbisFileName: true, kbisContentType: true },
    });
    if (
      row === null ||
      row.kbisStorageKey === null ||
      row.kbisFileName === null ||
      row.kbisContentType === null
    ) {
      return null;
    }
    return {
      storageKey: row.kbisStorageKey,
      fileName: row.kbisFileName,
      contentType: row.kbisContentType,
    };
  }
}

/**
 * Traduit la violation d'unicité du SIRET en refus **métier**.
 *
 * L'adaptateur est le seul endroit qui connaisse à la fois le nom de l'index et
 * le vocabulaire du domaine : laisser remonter un `P2002` obligerait la couche
 * au-dessus à savoir comment la base est indexée. Toute autre erreur repart
 * telle quelle — on ne déguise pas une panne en conflit.
 */
function translateSiretClash(error: unknown, siret: string): unknown {
  if (readField(error, "code") !== "P2002") {
    return error;
  }
  const target = readField(readField(error, "meta"), "target");
  return mentionsSiret(target) ? new SiretAlreadyRegisteredError(siret) : error;
}

/**
 * L'index violé est-il celui du SIRET ? Prisma nomme sa cible tantôt par une
 * chaîne (index posé en SQL), tantôt par une liste de champs.
 */
function mentionsSiret(target: unknown): boolean {
  if (typeof target === "string") {
    return target.includes("siret");
  }
  return Array.isArray(target) && target.some((field) => String(field).includes("siret"));
}

/** Une propriété d'un objet d'erreur — sans assertion, et sans supposer sa forme. */
function readField(source: unknown, key: string): unknown {
  return typeof source === "object" && source !== null ? Reflect.get(source, key) : undefined;
}

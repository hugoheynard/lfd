import { Injectable } from "@nestjs/common";

import { CompanyStatus, CustomerRole } from "../../../platform/database/client/client.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import { IdGenerator } from "../../../platform/id/id-generator.js";
import { Clock } from "../../../platform/time/clock.js";
import { Company, type CompanySoftState } from "../domain/entities/company.js";
import { SiretAlreadyRegisteredError } from "../domain/errors/account-errors.js";
import {
  CompanyRepository,
  type KbisCertification,
  type KbisLocation,
  type KbisMetadata,
} from "../domain/ports/company.repository.js";
import { ContactDetails } from "../domain/value-objects/contact-details.js";

/**
 * Alphabet de la référence humaine — **sans caractères ambigus** (ni `I`, `O`,
 * `0`, `1`) : elle se dicte au téléphone sans confusion. 32 symboles, comme
 * l'alphabet Crockford du ULID → mapping bijectif direct (cf. `deriveReference`).
 */
const REFERENCE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Alphabet Crockford base32 des ULID (exclut I, L, O, U). Même longueur que ci-dessus. */
const CROCKFORD_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/**
 * Dérive une référence `C-XXXXXX` d'un ULID. On prend ses 6 derniers caractères
 * (composante aléatoire du ULID) et on les **remappe** sur l'alphabet
 * non-ambigu : deux alphabets de 32 symboles → bijection index-à-index. Aucun
 * `Math.random` (déterminisme + traçabilité via `IdGenerator`), et l'unicité
 * finale reste **garantie** par la colonne `@unique`.
 */
function deriveReference(ulid: string): string {
  const tail = ulid.slice(-6);
  let code = "";
  for (const char of tail) {
    const index = CROCKFORD_ALPHABET.indexOf(char);
    code += index >= 0 ? REFERENCE_ALPHABET[index] : REFERENCE_ALPHABET[0];
  }
  return `C-${code}`;
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
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
    return this.prisma.$transaction(async (tx) => {
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
          tvaIntracom: company.tvaIntracom,
          ...contactColumns(company.toPersistence().contact),
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
          tvaIntracom: company.tvaIntracom,
          ...contactColumns(company.toPersistence().contact),
          // Déclarée, pas cliente : l'activation reste commerciale.
          status: CompanyStatus.pending,
        },
        select: { id: true },
      });
      return created.id;
    } catch (error) {
      throw translateSiretClash(error, company.siretDigits);
    }
  }

  async load(companyId: string): Promise<Company | null> {
    const row = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (row === null) {
      return null;
    }
    return Company.reconstitute({
      id: row.id,
      raisonSociale: row.raisonSociale,
      enseigne: row.enseigne,
      formeJuridique: row.formeJuridique,
      siret: row.siret,
      tvaIntracom: row.tvaIntracom,
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
        row.activatedBySub === null
          ? null
          : {
              sub: row.activatedBySub,
              name: row.activatedByName ?? "",
              role: row.activatedByRole ?? "",
            },
      suspensionCause: row.suspensionCause,
      nafCode: row.nafCode,
      fulfillmentPreference: {
        method: row.preferredFulfillmentMethod,
        pickupAddressId: row.preferredPickupAddressId,
        deliveryAddressId: row.preferredDeliveryAddressId,
      },
    });
  }

  async save(company: Company): Promise<void> {
    const id = company.id;
    if (id === null) {
      throw new Error("save() attend un agrégat déjà persisté (id manquant).");
    }
    // On écrit les champs **mutables** portés par l'agrégat (identité souple +
    // contact + termes + statut/activation) ; le mur est vérifié en amont.
    const state = company.toPersistence();
    await this.prisma.company.update({
      where: { id },
      data: {
        enseigne: state.enseigne,
        raisonSociale: state.raisonSociale,
        formeJuridique: state.formeJuridique,
        siret: state.siret,
        tvaIntracom: state.tvaIntracom,
        ...contactColumns(state.contact),
        grantedTerms: [...state.grantedTerms],
        requestedTerm: state.requestedTerm,
        status: state.status,
        activatedAt: state.activatedAt,
        activatedBySub: state.activatedBy?.sub ?? null,
        activatedByName: state.activatedBy?.name ?? null,
        activatedByRole: state.activatedBy?.role ?? null,
        suspensionCause: state.suspensionCause,
        nafCode: state.nafCode,
        preferredFulfillmentMethod: state.fulfillmentPreference.method,
        preferredPickupAddressId: state.fulfillmentPreference.pickupAddressId,
        preferredDeliveryAddressId: state.fulfillmentPreference.deliveryAddressId,
      },
    });
  }

  async saveKbisMetadata(companyId: string, meta: KbisMetadata): Promise<void> {
    await this.prisma.company.update({
      where: { id: companyId },
      data: {
        kbisStorageKey: meta.storageKey,
        kbisFileName: meta.fileName,
        kbisContentType: meta.contentType,
        kbisSize: meta.size,
        kbisUploadedAt: this.clock.now(),
        // Nouveau fichier ⇒ certification précédente invalidée, trace comprise :
        // laisser le nom d'un agent sur un extrait qu'il n'a jamais vu ferait
        // mentir la trace.
        kbisCertifiedAt: null,
        kbisCertifiedBySub: null,
        kbisCertifiedByName: null,
        kbisCertifiedByRole: null,
      },
    });
  }

  async saveKbisCertification(
    companyId: string,
    certification: KbisCertification | null,
  ): Promise<void> {
    await this.prisma.company.update({
      where: { id: companyId },
      data: {
        kbisCertifiedAt: certification?.at ?? null,
        kbisCertifiedBySub: certification?.bySub ?? null,
        // Chaîne vide ⇒ `null` en base : « aucun nom connu » est une absence,
        // pas un nom vide — et la lecture n'a ainsi qu'un seul cas à traiter.
        kbisCertifiedByName: blankToNull(certification?.byName),
        kbisCertifiedByRole: blankToNull(certification?.byRole),
      },
    });
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

/**
 * Les cinq colonnes du détenteur, aplaties — **vides** quand il n'y en a pas.
 *
 * C'est ici, et nulle part ailleurs, qu'on choisit la chaîne vide : les colonnes
 * sont non nulles, le domaine dit `null`, et cette traduction est un détail de
 * schéma. La lecture fait le chemin inverse (adresse vide ⇒ pas de détenteur),
 * si bien que l'aller-retour est fidèle.
 */
function contactColumns(contact: CompanySoftState["contact"]): {
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

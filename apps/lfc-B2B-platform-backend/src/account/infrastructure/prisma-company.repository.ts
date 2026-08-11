import { Injectable } from "@nestjs/common";

import { CompanyStatus, CustomerRole } from "../../infra/database/client/client.js";
import { PrismaService } from "../../infra/database/prisma.service.js";
import { IdGenerator } from "../../infra/id/id-generator.js";
import { Clock } from "../../infra/time/clock.js";
import { Company } from "../domain/entities/company.js";
import {
  CompanyRepository,
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
          contactPrenom: company.contact.firstName.value,
          contactNom: company.contact.lastName.value,
          contactFonction: company.contact.fonction,
          contactEmail: company.contact.email.value,
          contactTelephone: company.contact.phone.value,
          // Déclarée, pas cliente : l'activation est commerciale.
          status: CompanyStatus.pending,
        },
        select: { id: true },
      });

      await tx.membership.create({
        data: {
          userId: ownerUserId,
          companyId: created.id,
          // Le créateur est le gestionnaire de sa société.
          role: CustomerRole.company_admin,
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
    const created = await this.prisma.company.create({
      data: {
        reference,
        raisonSociale: company.raisonSociale,
        enseigne: company.enseigne,
        formeJuridique: company.formeJuridique,
        siret: company.siretDigits,
        tvaIntracom: company.tvaIntracom,
        contactPrenom: company.contact.firstName.value,
        contactNom: company.contact.lastName.value,
        contactFonction: company.contact.fonction,
        contactEmail: company.contact.email.value,
        contactTelephone: company.contact.phone.value,
        // Déclarée, pas cliente : l'activation reste commerciale.
        status: CompanyStatus.pending,
      },
      select: { id: true },
    });
    return created.id;
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
      contact: ContactDetails.create({
        firstName: row.contactPrenom,
        lastName: row.contactNom,
        fonction: row.contactFonction,
        email: row.contactEmail,
        phone: row.contactTelephone,
      }),
      paymentTerm: row.paymentTerm,
      requestedPaymentTerm: row.requestedPaymentTerm,
      status: row.status,
      activatedAt: row.activatedAt,
      nafCode: row.nafCode,
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
        contactPrenom: state.contact.firstName,
        contactNom: state.contact.lastName,
        contactFonction: state.contact.fonction,
        contactEmail: state.contact.email,
        contactTelephone: state.contact.phone,
        paymentTerm: state.paymentTerm,
        requestedPaymentTerm: state.requestedPaymentTerm,
        status: state.status,
        activatedAt: state.activatedAt,
        nafCode: state.nafCode,
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
        // Nouveau fichier ⇒ certification précédente invalidée.
        kbisCertifiedAt: null,
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

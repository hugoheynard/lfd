import { Injectable } from "@nestjs/common";

import { CompanyStatus, CustomerRole } from "../../infra/database/client/client.js";
import { PrismaService } from "../../infra/database/prisma.service.js";
import type { PaymentTerm } from "../domain/ports/account.reader.js";
import type { Company } from "../domain/entities/company.js";
import {
  CompanyRepository,
  type KbisLocation,
  type KbisMetadata,
} from "../domain/ports/company.repository.js";
import type { ContactDetails } from "../domain/value-objects/contact-details.js";

/**
 * Alphabet de la référence humaine — **sans caractères ambigus** (ni `I`, `O`,
 * `0`, `1`) : elle se dicte au téléphone sans confusion.
 */
const REFERENCE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/**
 * Tire une référence `C-XXXXXX`. L'unicité est **garantie** par la colonne
 * `@unique` ; ce tirage vise seulement à ne pas tomber dessus (32⁶ ≈ 1,07 Md de
 * combinaisons), l'index restant le juge de paix en cas de course.
 */
function drawCompanyReference(): string {
  let code = "";
  for (let i = 0; i < 6; i += 1) {
    code += REFERENCE_ALPHABET[Math.floor(Math.random() * REFERENCE_ALPHABET.length)];
  }
  return `C-${code}`;
}

/** Nombre de re-tirages avant d'abandonner (une collision est déjà quasi impossible). */
const REFERENCE_MAX_ATTEMPTS = 5;

/**
 * Référence libre à la lecture — re-tire tant que la valeur est déjà prise, pour
 * éviter qu'une collision (extrêmement rare) ne fasse échouer la création avec un
 * P2002 trompeur. L'`@unique` reste la garantie finale sous course concurrente.
 */
async function pickFreeCompanyReference(
  isTaken: (reference: string) => Promise<boolean>,
): Promise<string> {
  for (let attempt = 0; attempt < REFERENCE_MAX_ATTEMPTS; attempt += 1) {
    const reference = drawCompanyReference();
    if (!(await isTaken(reference))) {
      return reference;
    }
  }
  // Extrêmement improbable : on rend quand même une valeur, l'index tranchera.
  return drawCompanyReference();
}

/** Adaptateur Prisma du port des sociétés. */
@Injectable()
export class PrismaCompanyRepository extends CompanyRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
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
      const reference = await pickFreeCompanyReference(async (candidate) => {
        const clash = await tx.company.findUnique({
          where: { reference: candidate },
          select: { id: true },
        });
        return clash !== null;
      });
      const created = await tx.company.create({
        data: {
          reference,
          raisonSociale: company.raisonSociale,
          enseigne: company.enseigne,
          formeJuridique: company.formeJuridique,
          siret: company.siret.value,
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
    const reference = await pickFreeCompanyReference(async (candidate) => {
      const clash = await this.prisma.company.findUnique({
        where: { reference: candidate },
        select: { id: true },
      });
      return clash !== null;
    });
    const created = await this.prisma.company.create({
      data: {
        reference,
        raisonSociale: company.raisonSociale,
        enseigne: company.enseigne,
        formeJuridique: company.formeJuridique,
        siret: company.siret.value,
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

  async updatePrimaryContact(companyId: string, details: ContactDetails): Promise<void> {
    // Le mur (appartenance + rôle) est déjà vérifié en amont par le handler ; ici
    // on écrit le contact aplati sur la société.
    await this.prisma.company.update({
      where: { id: companyId },
      data: {
        contactPrenom: details.firstName.value,
        contactNom: details.lastName.value,
        contactFonction: details.fonction,
        contactEmail: details.email.value,
        contactTelephone: details.phone.value,
      },
    });
  }

  async updateIdentity(
    companyId: string,
    identity: { enseigne: string; tvaIntracom: string },
  ): Promise<void> {
    await this.prisma.company.update({
      where: { id: companyId },
      data: { enseigne: identity.enseigne, tvaIntracom: identity.tvaIntracom },
    });
  }

  async requestPaymentTerm(companyId: string, term: PaymentTerm | null): Promise<void> {
    // On écrit la DEMANDE, jamais le terme convenu (staff-only).
    await this.prisma.company.update({
      where: { id: companyId },
      data: { requestedPaymentTerm: term },
    });
  }

  async markActive(companyId: string): Promise<void> {
    await this.prisma.company.update({
      where: { id: companyId },
      data: { status: "active", activatedAt: new Date() },
    });
  }

  async setAgreedPaymentTerm(companyId: string, term: PaymentTerm): Promise<void> {
    // Le staff tranche : on écrit le terme convenu ET on solde la demande.
    await this.prisma.company.update({
      where: { id: companyId },
      data: { paymentTerm: term, requestedPaymentTerm: null },
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
        kbisUploadedAt: new Date(),
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

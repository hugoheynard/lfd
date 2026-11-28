import { Injectable } from "@nestjs/common";

import { CompanyStatus } from "../../../platform/database/client/client.js";
import { PrismaService } from "../../../platform/database/prisma.service.js";
import {
  CounterOpenedAccountsReader,
  type CounterOpenedAccountRecord,
} from "../domain/ports/counter-opened-accounts.reader.js";

/** La trace d'ouverture, réduite à ce que la page montre. */
interface AttestationRow {
  readonly companyId: string;
  readonly identitySeen: boolean;
  readonly attestedByStaffId: string;
  readonly attestedAt: Date;
}

/**
 * Adaptateur Prisma de la page : DEUX requêtes pour toutes les lignes — les
 * sociétés, puis leurs traces d'ouverture (`company_id IN (…)`). Un compte
 * supprimé (`archived_at`) n'y figure pas.
 */
@Injectable()
export class PrismaCounterOpenedAccountsReader extends CounterOpenedAccountsReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async listOpened(): Promise<readonly CounterOpenedAccountRecord[]> {
    const companies = await this.prisma.company.findMany({
      where: { status: CompanyStatus.counter_opened, archivedAt: null },
      select: {
        id: true,
        reference: true,
        enseigne: true,
        contactPrenom: true,
        contactNom: true,
        contactEmail: true,
        contactTelephone: true,
        createdAt: true,
        declaredByStaffId: true,
        declaredByName: true,
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    const attestations = await this.prisma.counterOpeningAttestation.findMany({
      where: { companyId: { in: companies.map((company) => company.id) } },
      select: { companyId: true, identitySeen: true, attestedByStaffId: true, attestedAt: true },
    });
    const byCompany = new Map<string, AttestationRow>(
      attestations.map((row) => [row.companyId, row]),
    );
    return companies.map((company) => {
      const attestation = byCompany.get(company.id);
      return {
        companyId: company.id,
        reference: company.reference,
        enseigne: company.enseigne,
        contact: {
          firstName: company.contactPrenom,
          lastName: company.contactNom,
          email: company.contactEmail,
          phone: company.contactTelephone,
        },
        openedAt: company.createdAt,
        openedByStaffId: company.declaredByStaffId,
        openedByName: company.declaredByName,
        identityCheck:
          attestation === undefined
            ? null
            : {
                seen: attestation.identitySeen,
                byStaffId: attestation.attestedByStaffId,
                at: attestation.attestedAt,
              },
      };
    });
  }
}

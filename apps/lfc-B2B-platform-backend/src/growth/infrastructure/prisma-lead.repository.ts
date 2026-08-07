import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../infra/database/prisma.service.js";
import { IdGenerator } from "../../infra/id/id-generator.js";
import { Lead } from "../domain/entities/lead.js";
import { LeadRepository } from "../domain/ports/lead.repository.js";
import { ACTIVE_LEAD_STATUSES, rowToLead } from "./lead-mapping.js";

/** Colonnes lues pour reconstituer l'agrégat. */
const LEAD_SELECT = {
  id: true,
  businessName: true,
  contactName: true,
  email: true,
  phone: true,
  siret: true,
  status: true,
  notes: true,
  linkedUserId: true,
  createdAt: true,
  lastContactedAt: true,
} as const;

/** Adaptateur Prisma de l'agrégat Lead (écriture). Id ULID préfixé `lead_`. */
@Injectable()
export class PrismaLeadRepository extends LeadRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ids: IdGenerator,
  ) {
    super();
  }

  async create(lead: Lead): Promise<string> {
    const id = `lead_${this.ids.next()}`;
    await this.prisma.lead.create({
      data: {
        id,
        businessName: lead.businessName,
        contactName: lead.contactName,
        email: lead.email,
        phone: lead.phone,
        siret: lead.siret,
        status: lead.status,
        notes: lead.notes,
        linkedUserId: lead.linkedUserId,
        lastContactedAt: lead.lastContactedAt,
      },
    });
    return id;
  }

  async load(leadId: string): Promise<Lead | null> {
    const row = await this.prisma.lead.findUnique({ where: { id: leadId }, select: LEAD_SELECT });
    return row === null ? null : rowToLead(row);
  }

  async save(lead: Lead): Promise<void> {
    const id = lead.id;
    if (id === null) {
      throw new Error("save() exige un lead persisté (id non nul).");
    }
    await this.prisma.lead.update({
      where: { id },
      data: {
        status: lead.status,
        notes: lead.notes,
        linkedUserId: lead.linkedUserId,
        lastContactedAt: lead.lastContactedAt,
      },
    });
  }

  async findOpenByEmail(email: string): Promise<Lead | null> {
    const normalized = email.trim().toLowerCase();
    if (normalized === "") {
      return null;
    }
    const row = await this.prisma.lead.findFirst({
      where: { email: normalized, status: { in: [...ACTIVE_LEAD_STATUSES] } },
      orderBy: { createdAt: "asc" },
      select: LEAD_SELECT,
    });
    return row === null ? null : rowToLead(row);
  }
}

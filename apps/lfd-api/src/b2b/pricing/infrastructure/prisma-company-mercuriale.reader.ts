import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../../platform/database/prisma.service.js";
import { CompanyMercurialeReader } from "../domain/ports/company-mercuriale.reader.js";
import type { CompanyMercuriale } from "../domain/entities/company-mercuriale.js";
import { unarchivedAt } from "./archived-at.js";
import { mercurialeFromRow } from "./mercuriale-rows.js";

/**
 * **La mercuriale vivante d'un client**, lue en une requête.
 *
 * La clause dit exactement les trois choses que la contrainte d'exclusion
 * garantit : cette société, non close, et dont la fenêtre couvre l'instant. Les
 * bornes suivent la convention du contexte — basse **incluse**, haute
 * **exclue** — donc une mercuriale qui se ferme à l'instant lu est déjà finie.
 *
 * ⚠️ Une mercuriale **suspendue** est rendue quand même. `applies` lit
 * `suspendedFrom` et décide de ne pas l'appliquer ; filtrer ici dupliquerait
 * cette décision dans une clause SQL, et les deux divergeraient au premier
 * changement.
 */
@Injectable()
export class PrismaCompanyMercurialeReader extends CompanyMercurialeReader {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async liveFor(companyId: string | null, at: Date): Promise<CompanyMercuriale | null> {
    if (companyId === null) {
      // Un visiteur sans société n'a pas de tarif négocié : pas de requête.
      return null;
    }
    const row = await this.prisma.companyMercuriale.findFirst({
      where: {
        companyId,
        archivedAt: null,
        validFrom: { lte: at },
        OR: [{ validTo: null }, { validTo: { gt: at } }],
      },
    });
    return row === null ? null : mercurialeFromRow(row);
  }

  /**
   * La relecture datée : les closes APRÈS `at` sont rendues elles aussi.
   *
   * ⚠️ Deux détails que la forme de `liveFor` ne pardonnerait pas ici.
   *
   * Le `AND` explicite, d'abord : `unarchivedAt` rend un objet `{ OR: [...] }`,
   * et cette clause en porte déjà un pour la borne haute. Les fondre par
   * étalement écraserait l'un des deux — et selon l'ordre, on perdrait soit le
   * filtre d'archivage, soit **le filtre de fenêtre**, sans que TypeScript ne
   * bronche.
   *
   * L'`orderBy`, ensuite, et il n'est pas décoratif : au présent, la contrainte
   * d'exclusion **partielle** garantit qu'une seule mercuriale non close couvre
   * un instant. Au passé, non — une close et une posée rétroactivement peuvent
   * couvrir la même date. Sans ordre, Postgres en rendrait une, et laquelle
   * n'est pas défini. La règle écrite ici : **une mercuriale encore ouverte
   * l'emporte sur une close**, puis la plus récemment posée.
   */
  async liveAsOf(companyId: string | null, at: Date): Promise<CompanyMercuriale | null> {
    if (companyId === null) {
      return null;
    }
    const row = await this.prisma.companyMercuriale.findFirst({
      where: {
        AND: [
          unarchivedAt(at),
          {
            companyId,
            validFrom: { lte: at },
            OR: [{ validTo: null }, { validTo: { gt: at } }],
          },
        ],
      },
      orderBy: [{ archivedAt: { sort: "desc", nulls: "first" } }, { validFrom: "desc" }],
    });
    return row === null ? null : mercurialeFromRow(row);
  }

  async listFor(companyId: string): Promise<readonly CompanyMercuriale[]> {
    const rows = await this.prisma.companyMercuriale.findMany({
      // Closes exclues : ranger sert précisément à ne plus les voir. Ce qu'elles
      // ont facturé reste, lui, figé sur les commandes.
      where: { companyId, archivedAt: null },
      orderBy: { validFrom: "desc" },
    });
    return rows.map((row) => mercurialeFromRow(row));
  }

  async liveEverywhere(at: Date): Promise<readonly CompanyMercuriale[]> {
    const rows = await this.prisma.companyMercuriale.findMany({
      where: {
        archivedAt: null,
        // En pause : écartée. On mesure ce qui se FACTURE, pas ce qui a été
        // décidé — cf. le port.
        pausedAt: null,
        validFrom: { lte: at },
        OR: [{ validTo: null }, { validTo: { gt: at } }],
      },
    });
    return rows.map((row) => mercurialeFromRow(row));
  }
}

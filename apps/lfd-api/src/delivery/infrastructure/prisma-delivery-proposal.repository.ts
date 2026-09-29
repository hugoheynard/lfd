import { Injectable } from "@nestjs/common";

import { PrismaService } from "../../platform/database/prisma.service.js";
import type { DeliveryRound } from "../domain/entities/delivery-round.js";
import {
  DeliveryRoundDepartedError,
  LoadedStopMoveError,
} from "../domain/errors/delivery-loading-errors.js";
import { DeliveryRoundStaleError } from "../domain/errors/delivery-round-errors.js";
import { ProposalOutdatedError } from "../domain/errors/delivery-routing-errors.js";
import {
  DeliveryProposalRepository,
  type MovedStop,
  type ProposalWrite,
} from "../domain/ports/delivery-proposal.repository.js";
import { type Tx, writeRound, writeStops } from "./delivery-round.writes.js";

/**
 * **Adaptateur Prisma d'une proposition appliquée** (lot 7, L7-C11).
 *
 * L'ordre des verrous est celui de `saveMove`, étendu à N tournées : les
 * tournées d'abord, par identifiant ; puis les lignes de chargement des arrêts
 * déplacés, par identifiant. Deux applications concurrentes — ou une
 * application et un déplacement à la main — prennent leurs verrous dans le
 * même ordre et ne s'interbloquent pas.
 *
 * Sous verrou, il revérifie ce que le handler a lu sans verrou : la version,
 * la tournée au dépôt, l'arrêt déplacé sans sac chargé. Puis il écrit : les
 * tournées ouvertes (une collision sur `(jour, véhicule, passage)` devient
 * « reproposez »), les tournées existantes sous leur version, et les arrêts.
 * Tout dans la transaction de l'appelant — un seul refus annule tout.
 */
@Injectable()
export class PrismaDeliveryProposalRepository extends DeliveryProposalRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async applyProposal(write: ProposalWrite): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const existing = write.rounds
        .filter((round) => round.loadedVersion !== null)
        .sort((a, b) => compare(a.id, b.id));
      await lockRounds(tx, existing);
      await ensureNotLoaded(tx, write.movedStops);
      const opened = write.rounds.filter((round) => round.loadedVersion === null);
      for (const round of [...opened, ...existing]) {
        await writeRound(tx, round, passageTaken);
      }
      // Les sources d'abord : leurs positions se resserrent avant que les
      // arrêts ne rejoignent leur destination.
      for (const round of [...existing, ...opened]) {
        await writeStops(tx, round);
      }
    });
  }
}

/**
 * `SELECT … FOR UPDATE` sur toutes les tournées existantes, dans l'ordre des
 * identifiants ; puis la version et le départ relus SOUS le verrou.
 * @throws {DeliveryRoundStaleError} @throws {DeliveryRoundDepartedError}
 */
async function lockRounds(tx: Tx, rounds: readonly DeliveryRound[]): Promise<void> {
  if (rounds.length === 0) {
    return;
  }
  const ids = rounds.map((round) => round.id);
  const locked = await tx.$queryRaw<{ id: string; version: number; departed_at: Date | null }[]>`
    SELECT "id", "version", "departed_at" FROM "production"."delivery_round"
     WHERE "id" = ANY(${ids})
     ORDER BY "id"
       FOR UPDATE`;
  const byId = new Map(locked.map((row) => [row.id, row]));
  for (const round of rounds) {
    const row = byId.get(round.id);
    if (row?.departed_at !== null && row?.departed_at !== undefined) {
      throw new DeliveryRoundDepartedError(round.vehicleName, round.serviceDay);
    }
    if (row?.version !== round.loadedVersion) {
      throw new DeliveryRoundStaleError(round.vehicleName);
    }
  }
}

/**
 * Verrouille les chargements des arrêts déplacés, dans l'ordre de leur
 * identifiant, et refuse si l'un d'eux porte un sac chargé (L4-C5).
 * @throws {LoadedStopMoveError}
 */
async function ensureNotLoaded(tx: Tx, moved: readonly MovedStop[]): Promise<void> {
  if (moved.length === 0) {
    return;
  }
  const movedStopIds = moved.map((stop) => stop.stopId);
  const loads = await tx.$queryRaw<{ stop_id: string; loaded: boolean }[]>`
    SELECT "stop_id", "loaded_at" IS NOT NULL AS "loaded"
      FROM "production"."delivery_bag_load"
     WHERE "stop_id" = ANY(${movedStopIds})
     ORDER BY "id"
       FOR UPDATE`;
  const loaded = loads.find((load) => load.loaded);
  if (loaded === undefined) {
    return;
  }
  const from = moved.find((stop) => stop.stopId === loaded.stop_id);
  throw new LoadedStopMoveError(from?.fromVehicleName ?? "");
}

function passageTaken(round: DeliveryRound): ProposalOutdatedError {
  return new ProposalOutdatedError(
    `une autre tournée « ${round.vehicleName} » vient d'être ouverte ce jour-là`,
  );
}

function compare(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  return a < b ? -1 : 1;
}

import { Controller, Get, UseGuards } from "@nestjs/common";

import { Public } from "../../../../platform/auth/public.decorator.js";
import { RecomputeGuard } from "../../../../platform/auth/recompute.guard.js";
import {
  ChannelParityReader,
  type ChannelParityReport,
} from "../infrastructure/channel-parity.reader.js";

/**
 * **La colonne héritée et les tables disent-elles la même chose ?**
 *
 * Pendant la bascule C0-d, la matrice de canaux s'écrit à deux endroits. Cette
 * sonde répond à la seule question qui rende la tranche d-3 dangereuse : reste-
 * t-il un écart ? Supprimer les colonnes sur un écart figerait la mauvaise
 * vérité, et personne ne saurait plus laquelle était la bonne.
 *
 * **Derrière le jeton d'exploitation**, comme l'inventaire des canaux et le
 * contrôle du courrier : elle nomme des identifiants d'objets du catalogue, ce
 * qui n'a rien à faire sur une route publique. Aucun nom, aucun prix, aucune
 * donnée client n'en sort — seulement des clés `lieu contexte`.
 *
 * ⚠️ **TEMPORAIRE.** Elle meurt avec les colonnes, à la tranche d-3.
 */
@Controller("admin/channel-parity")
@Public()
@UseGuards(RecomputeGuard)
export class OpsChannelParityController {
  constructor(private readonly reader: ChannelParityReader) {}

  @Get()
  parity(): Promise<ChannelParityReport> {
    return this.reader.report();
  }
}

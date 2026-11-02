import type { ResupplyCatalogue } from "../domain/resupply-catalogue.js";
import type { ResupplyCutoff } from "../domain/resupply-cutoff.js";
import { ResupplySiteUnknownError } from "../domain/resupply-receipt-errors.js";
import type { ResupplySites } from "../domain/resupply-sites.js";
import {
  type ResupplyTarget,
  serviceDayFor,
  SiteResupply,
  type SiteResupplyTrace,
} from "../domain/site-resupply.js";
import type { SiteResupplyLine } from "../domain/site-resupply-line.js";
import type { SiteResupplyRepository } from "../domain/site-resupply.repository.js";
import type { RequestedResupplyLine } from "./send-bakehouse-resupply.command.js";
import type { ResupplyPlanGate } from "./resupply-plan-gate.js";
import { catalogueLine } from "./site-resupply-draft.js";

/**
 * **Le chemin de l'envoi du fournil** (lot R1d), partagé par « Envoyer un
 * réassort » et « Envoyer un brouillon » (plan
 * `documentation/reassort-boutiques/commander.md`) : ce
 * qui part d'un brouillon part par les mêmes règles, sans copie.
 *
 * En deux temps : {@link prepareBakehouseResupply} lit — le point, les
 * libellés au catalogue publié — HORS de la transaction ;
 * {@link writeBakehouseResupply} s'appelle DANS l'unité de travail de
 * l'appelant, prend le verrou de la journée, PUIS lit l'heure du réassort et
 * écrit. L'heure se lisait à la préparation (M1, audit du 2026-11-02) : un
 * réglage changé entre-temps laissait partir un « pour demain » sur l'heure
 * d'avant. Lue sous le verrou, elle est celle que l'arrêt du plan voit.
 */
export interface BakehouseSendingPorts {
  readonly resupplies: SiteResupplyRepository;
  readonly catalogue: ResupplyCatalogue;
  readonly sites: ResupplySites;
  readonly cutoff: ResupplyCutoff;
  readonly gate: ResupplyPlanGate;
}

/** Ce que l'écran envoie. */
export interface BakehouseSendingRequest {
  readonly siteId: string;
  readonly target: ResupplyTarget;
  readonly name: string | null;
  readonly lines: readonly RequestedResupplyLine[];
}

/** L'envoi prêt à écrire : tout ce qui se lit est lu. */
export interface PreparedBakehouseResupply {
  readonly request: BakehouseSendingRequest;
  readonly lines: readonly SiteResupplyLine[];
  readonly trace: SiteResupplyTrace;
  readonly serviceDay: string;
}

/** @throws {ResupplySiteUnknownError} le point n'existe pas ou est archivé. */
export async function prepareBakehouseResupply(
  ports: BakehouseSendingPorts,
  request: BakehouseSendingRequest,
  trace: SiteResupplyTrace,
): Promise<PreparedBakehouseResupply> {
  if (!(await ports.sites.exists(request.siteId))) {
    throw new ResupplySiteUnknownError(request.siteId);
  }
  const lines: SiteResupplyLine[] = [];
  for (const requested of request.lines) {
    lines.push(await catalogueLine(ports.catalogue, requested));
  }
  return { request, lines, trace, serviceDay: serviceDayFor(request.target, trace.at) };
}

/**
 * Crée et envoie le réassort sous l'identifiant `id` ; à appeler DANS une
 * unité de travail. Le verrou de la journée d'abord, puis l'heure du
 * réassort : les deux sont lues sous lui.
 */
export async function writeBakehouseResupply(
  ports: BakehouseSendingPorts,
  prepared: PreparedBakehouseResupply,
  id: string,
): Promise<void> {
  const { request, trace } = prepared;
  const planStopped = await ports.gate.hold(request.target, prepared.serviceDay);
  const deadline = await ports.cutoff.deadlineFor(prepared.serviceDay);
  const resupply = SiteResupply.sentByBakehouse({
    id,
    siteId: request.siteId,
    target: request.target,
    name: request.name,
    lines: prepared.lines,
    trace,
    deadline,
    planStopped,
  });
  await ports.resupplies.save(resupply);
}

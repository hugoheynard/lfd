import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import {
  FixedClosedPlans,
  RecordingAdmissionDesk,
} from "../../../orders/application/commands/__tests__/plan-doubles.js";
import { CancelSiteResupplyHandler } from "../cancel-site-resupply.handler.js";
import { ListResuppliesToProduceHandler } from "../list-resupplies-to-produce.handler.js";
import { ListSiteResuppliesHandler } from "../list-site-resupplies.handler.js";
import { ResupplyPlanGate } from "../resupply-plan-gate.js";
import { SendBakehouseResupplyHandler } from "../send-bakehouse-resupply.handler.js";
import { Catalogue, Directory, Sites } from "./resupply-doubles.js";
import {
  FixedResupplyCutoff,
  InMemorySiteResupplies,
  KnownReceptions,
  InMemorySiteResupplyReader,
  SiteLabels,
  InMemoryResupplyUsedNames,
  FixedLaunches,
  InMemorySiteResupplyPlanKeys,
} from "./site-resupply-doubles.js";
import { CROISSANT, PAIN_AU_CHOCOLAT } from "./resupply-articles.js";

/**
 * Le banc des réassorts envoyés — l'envoi du fournil, l'annulation, « à
 * produire » —, partagé par leurs specs (découpées par geste le 2026-11-03).
 */

/** 17 h à Paris le 2 janvier ; l'heure limite double est posée relativement à lui. */
export const NOW = new Date("2026-01-02T16:00:00Z");
export const HOUR_MS = 60 * 60 * 1000;
export const TODAY = "2026-01-02";
export const TOMORROW = "2026-01-03";
export const VILLAGE = "site_village";
export const LABO = "site_labo";
export const CATALOGUE = new Catalogue([CROISSANT, PAIN_AU_CHOCOLAT]);

/**
 * `stopped` : les journées dont le plan est arrêté (R3a) — le guichet
 * doublé les dit closes, et note chaque journée qu'on lui fait tenir.
 */
export function setup(
  deadline: Date | null = null,
  stopped: readonly string[] = [],
  onAdmit: () => void = () => undefined,
) {
  const store = new InMemorySiteResupplies();
  const reader = new InMemorySiteResupplyReader(store);
  const cutoff = new FixedResupplyCutoff(deadline);
  const clock = new FixedClock(NOW);
  const staff = new Directory({ name: "Lou Martin", role: "counter" });
  const receptions = new KnownReceptions();
  const desk = new RecordingAdmissionDesk(stopped, onAdmit);
  const launches = new FixedLaunches();
  const gate = new ResupplyPlanGate(desk, launches);
  const uow = new DirectUnitOfWork();
  return {
    store,
    receptions,
    cutoff,
    clock,
    desk,
    place: new SendBakehouseResupplyHandler(
      store,
      CATALOGUE,
      new Sites([VILLAGE, LABO]),
      cutoff,
      staff,
      clock,
      gate,
      uow,
    ),
    cancel: new CancelSiteResupplyHandler(
      store,
      new InMemorySiteResupplyPlanKeys(store),
      receptions,
      staff,
      clock,
      gate,
      uow,
    ),
    list: new ListSiteResuppliesHandler(
      reader,
      cutoff,
      clock,
      new InMemoryResupplyUsedNames(store),
    ),
    toProduce: new ListResuppliesToProduceHandler(
      reader,
      new SiteLabels(new Map([[VILLAGE, "Val Village"]])),
      clock,
      new FixedClosedPlans(stopped),
    ),
  };
}

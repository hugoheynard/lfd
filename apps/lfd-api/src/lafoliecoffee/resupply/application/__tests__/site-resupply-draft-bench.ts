import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { inMemoryIntents } from "../../../../platform/intent/__tests__/in-memory-gesture-intent.ledger.js";
import { FixedIdGenerator } from "../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { AddSiteResupplyLineHandler } from "../add-site-resupply-line.handler.js";
import { CorrectSiteResupplyLineHandler } from "../correct-site-resupply-line.handler.js";
import { ListSiteResuppliesHandler } from "../list-site-resupplies.handler.js";
import { ResupplyPlanGate } from "../resupply-plan-gate.js";
import { SendBakehouseResupplyHandler } from "../send-bakehouse-resupply.handler.js";
import { SendSiteResupplyHandler } from "../send-site-resupply.handler.js";
import { WithdrawSiteResupplyLineHandler } from "../withdraw-site-resupply-line.handler.js";
import { RecordingAdmissionDesk } from "../../../orders/application/commands/__tests__/plan-doubles.js";
import { Catalogue, Directory, Sites } from "./resupply-doubles.js";
import {
  FixedResupplyCutoff,
  InMemorySiteResupplies,
  InMemorySiteResupplyPlanKeys,
  InMemorySiteResupplyReader,
  InMemoryResupplyUsedNames,
  FixedLaunches,
} from "./site-resupply-doubles.js";
import { CROISSANT, PAIN_AU_CHOCOLAT, SALMON } from "./resupply-articles.js";

/**
 * Le banc de la demande en cours du comptoir, partagé par ses specs
 * (découpées par geste le 2026-11-03 : composer, envoyer, au poids).
 */

/** 17 h à Paris le 2 janvier : les journées ne sont comparées qu'à cette horloge figée. */
export const NOW = new Date("2026-01-02T16:00:00Z");
export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;
export const TODAY = "2026-01-02";
export const TOMORROW = "2026-01-03";
export const VILLAGE = "site_village";
export const LABO = "site_labo";

/** `stopped` : les journées dont le plan du fournil est arrêté (R3a). */
export function setup(deadline: Date | null = null, stopped: readonly string[] = []) {
  const store = new InMemorySiteResupplies();
  const cutoff = new FixedResupplyCutoff(deadline);
  const clock = new FixedClock(NOW);
  const staff = new Directory({ name: "Lou Martin", role: "counter" });
  const catalogue = new Catalogue([CROISSANT, PAIN_AU_CHOCOLAT, SALMON]);
  const sites = new Sites([VILLAGE, LABO]);
  const ids = new FixedIdGenerator("resupply");
  const desk = new RecordingAdmissionDesk(stopped);
  const launches = new FixedLaunches();
  const gate = new ResupplyPlanGate(desk, launches);
  const uow = new DirectUnitOfWork();
  return {
    store,
    clock,
    desk,
    add: new AddSiteResupplyLineHandler(
      store,
      catalogue,
      sites,
      clock,
      ids,
      new DirectUnitOfWork(),
      inMemoryIntents(),
    ),
    correct: new CorrectSiteResupplyLineHandler(store),
    withdraw: new WithdrawSiteResupplyLineHandler(store),
    send: new SendSiteResupplyHandler(
      store,
      new InMemorySiteResupplyPlanKeys(store),
      cutoff,
      staff,
      clock,
      gate,
      uow,
    ),
    bakehouse: new SendBakehouseResupplyHandler(
      store,
      catalogue,
      sites,
      cutoff,
      staff,
      clock,
      gate,
      uow,
    ),
    list: new ListSiteResuppliesHandler(
      new InMemorySiteResupplyReader(store),
      cutoff,
      clock,
      new InMemoryResupplyUsedNames(store),
    ),
  };
}

export function versionOf(store: InMemorySiteResupplies, id: string): number {
  return store.all().find((row) => row.id === id)?.version ?? -1;
}

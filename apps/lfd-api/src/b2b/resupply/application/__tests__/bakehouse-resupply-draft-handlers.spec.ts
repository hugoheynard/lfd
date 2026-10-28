import { FixedIdGenerator } from "../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { RecordingAdmissionDesk } from "../../../orders/application/commands/__tests__/plan-doubles.js";
import {
  BakehouseResupplyDraftChangedMeanwhileError,
  BakehouseResupplyDraftClosedError,
  BakehouseResupplyDraftNotFoundError,
} from "../../domain/bakehouse-resupply-draft-errors.js";
import {
  ResupplyArticleUnknownError,
  ResupplySiteUnknownError,
} from "../../domain/resupply-receipt-errors.js";
import { serviceDayFor } from "../../domain/site-resupply.js";
import { BakehouseResupplyAfterStopError } from "../../domain/site-resupply-errors.js";
import { CreateBakehouseResupplyDraftCommand } from "../create-bakehouse-resupply-draft.command.js";
import { CreateBakehouseResupplyDraftHandler } from "../create-bakehouse-resupply-draft.handler.js";
import { DiscardBakehouseResupplyDraftCommand } from "../discard-bakehouse-resupply-draft.command.js";
import { DiscardBakehouseResupplyDraftHandler } from "../discard-bakehouse-resupply-draft.handler.js";
import { ListBakehouseResupplyDraftsHandler } from "../list-bakehouse-resupply-drafts.handler.js";
import { ResupplyPlanGate } from "../resupply-plan-gate.js";
import { SaveBakehouseResupplyDraftCommand } from "../save-bakehouse-resupply-draft.command.js";
import { SaveBakehouseResupplyDraftHandler } from "../save-bakehouse-resupply-draft.handler.js";
import { SendBakehouseResupplyDraftCommand } from "../send-bakehouse-resupply-draft.command.js";
import { SendBakehouseResupplyDraftHandler } from "../send-bakehouse-resupply-draft.handler.js";
import {
  InMemoryBakehouseDraftReader,
  InMemoryBakehouseDrafts,
  LoggedSiteResupplies,
  LoggedUnitOfWork,
  WriteLog,
} from "./bakehouse-draft-doubles.js";
import { Catalogue, Directory, Sites } from "./resupply-doubles.js";
import { FixedLaunches, FixedResupplyCutoff } from "./site-resupply-doubles.js";

const SITE = "site_village";
const ARTICLES = [
  { sku: "CRO", name: "Croissant", categoryId: "fam", categoryName: "Viennoiseries" },
  { sku: "PAC", name: "Pain au chocolat", categoryId: "fam", categoryName: "Viennoiseries" },
];
const CONTENT = {
  siteId: SITE,
  target: "tomorrow" as const,
  name: "Vitrine du matin",
  lines: [{ sku: "CRO", quantity: 4 }],
};

function world(options: { readonly now?: Date; readonly stoppedDays?: readonly string[] } = {}) {
  const log = new WriteLog();
  const clock = new FixedClock(options.now ?? new Date());
  const drafts = new InMemoryBakehouseDrafts(log);
  const resupplies = new LoggedSiteResupplies(log);
  const staff = new Directory({ name: "Lou Martin", role: "bakehouse" });
  const sites = new Sites([SITE]);
  const ids = new FixedIdGenerator("id");
  const uow = new LoggedUnitOfWork(log);
  const gate = new ResupplyPlanGate(
    new RecordingAdmissionDesk(options.stoppedDays ?? []),
    new FixedLaunches(),
  );
  return {
    log,
    clock,
    drafts,
    resupplies,
    uow,
    create: new CreateBakehouseResupplyDraftHandler(drafts, sites, staff, clock, ids),
    save: new SaveBakehouseResupplyDraftHandler(drafts, sites, staff, clock),
    discard: new DiscardBakehouseResupplyDraftHandler(drafts, staff, clock),
    send: new SendBakehouseResupplyDraftHandler(
      drafts,
      resupplies,
      new Catalogue(ARTICLES),
      sites,
      new FixedResupplyCutoff(null),
      staff,
      clock,
      ids,
      gate,
      uow,
    ),
    list: new ListBakehouseResupplyDraftsHandler(new InMemoryBakehouseDraftReader(drafts)),
  };
}

describe("les brouillons du réassort du fournil", () => {
  it("se créent en version 1, sous un point qui existe, et se listent", async () => {
    const w = world();
    const saved = await w.create.execute(new CreateBakehouseResupplyDraftCommand(CONTENT, "s"));
    expect(saved).toEqual({ id: "id_000001", version: 1 });
    const listed = await w.list.execute();
    expect(listed).toEqual([
      expect.objectContaining({
        id: "id_000001",
        version: 1,
        siteId: SITE,
        name: "Vitrine du matin",
        lines: [{ sku: "CRO", quantity: 4 }],
        savedByName: "Lou Martin",
      }),
    ]);
    await expect(
      w.create.execute(new CreateBakehouseResupplyDraftCommand({ ...CONTENT, siteId: "x" }, "s")),
    ).rejects.toThrow(ResupplySiteUnknownError);
  });

  it("se réécrivent sous la version lue ; une version périmée est refusée", async () => {
    const w = world();
    const { id } = await w.create.execute(new CreateBakehouseResupplyDraftCommand(CONTENT, "s"));
    const rewritten = { ...CONTENT, lines: [{ sku: "PAC", quantity: 2 }] };
    expect(
      await w.save.execute(new SaveBakehouseResupplyDraftCommand(id, rewritten, 1, "s")),
    ).toEqual({ id, version: 2 });
    expect(w.drafts.row(id)?.content.lines).toEqual([{ sku: "PAC", quantity: 2 }]);
    await expect(
      w.save.execute(new SaveBakehouseResupplyDraftCommand(id, CONTENT, 1, "s")),
    ).rejects.toThrow(BakehouseResupplyDraftChangedMeanwhileError);
    await expect(
      w.save.execute(new SaveBakehouseResupplyDraftCommand("nope", CONTENT, 1, "s")),
    ).rejects.toThrow(BakehouseResupplyDraftNotFoundError);
  });

  it("supprimé, il sort de la liste et ne s'écrit plus", async () => {
    const w = world();
    const { id } = await w.create.execute(new CreateBakehouseResupplyDraftCommand(CONTENT, "s"));
    await w.discard.execute(new DiscardBakehouseResupplyDraftCommand(id, 1, "s"));
    expect(w.drafts.row(id)?.status).toBe("discarded");
    expect(await w.list.execute()).toEqual([]);
    await expect(
      w.save.execute(new SaveBakehouseResupplyDraftCommand(id, CONTENT, 2, "s")),
    ).rejects.toThrow(BakehouseResupplyDraftClosedError);
  });

  it("envoyé : le réassort du fournil est créé PUIS le brouillon passe `sent`, dans une seule unité", async () => {
    const w = world();
    const { id } = await w.create.execute(new CreateBakehouseResupplyDraftCommand(CONTENT, "s"));
    const screen = { ...CONTENT, lines: [{ sku: "PAC", quantity: 7 }] };

    const resupplyId = await w.send.execute(
      new SendBakehouseResupplyDraftCommand(id, screen, 1, "s"),
    );

    expect(w.uow.runs).toBe(1);
    expect(w.log.entries.slice(-2)).toEqual([
      `resupply:${resupplyId}:uow=1`,
      `draft:${id}:sent:uow=1`,
    ]);
    const [resupply] = w.resupplies.all();
    expect(resupply).toMatchObject({ id: resupplyId, origin: "bakehouse", siteId: SITE });
    // Ce qui part est ce que l'écran montrait, pas ce qui était enregistré.
    expect(resupply?.lines).toEqual([{ sku: "PAC", label: "Pain au chocolat", quantity: 7 }]);
    expect(w.drafts.row(id)).toMatchObject({ status: "sent", sentResupplyId: resupplyId });
    expect(await w.list.execute()).toEqual([]);
  });

  it("un envoi refusé (article retiré, plan arrêté, version périmée) laisse le brouillon ouvert et intact", async () => {
    const now = new Date();
    const w = world({ now, stoppedDays: [serviceDayFor("tomorrow", now)] });
    const { id } = await w.create.execute(new CreateBakehouseResupplyDraftCommand(CONTENT, "s"));
    const before = w.drafts.row(id);

    await expect(
      w.send.execute(
        new SendBakehouseResupplyDraftCommand(
          id,
          { ...CONTENT, lines: [{ sku: "OLD", quantity: 1 }] },
          1,
          "s",
        ),
      ),
    ).rejects.toThrow(ResupplyArticleUnknownError);
    await expect(
      w.send.execute(new SendBakehouseResupplyDraftCommand(id, CONTENT, 1, "s")),
    ).rejects.toThrow(BakehouseResupplyAfterStopError);
    await expect(
      w.send.execute(
        new SendBakehouseResupplyDraftCommand(id, { ...CONTENT, target: "asap" }, 3, "s"),
      ),
    ).rejects.toThrow(BakehouseResupplyDraftChangedMeanwhileError);

    expect(w.drafts.row(id)).toEqual(before);
    expect(w.resupplies.all()).toEqual([]);
  });
});

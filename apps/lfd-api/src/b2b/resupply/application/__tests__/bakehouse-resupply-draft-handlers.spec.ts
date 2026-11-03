import { FixedIdGenerator } from "../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { RecordingAdmissionDesk } from "../../../orders/application/commands/__tests__/plan-doubles.js";
import {
  BakehouseResupplyDraftChangedMeanwhileError,
  BakehouseResupplyDraftClosedError,
  BakehouseResupplyDraftNotFoundError,
} from "../../domain/bakehouse-resupply-draft-errors.js";
import { ResupplyArticleUnknownError } from "../../domain/resupply-receipt-errors.js";
import { ResupplySiteUnknownError } from "../../domain/resupply-site-errors.js";
import { BakehouseResupplyDraftKeyTakenError } from "../../domain/bakehouse-resupply-draft-errors.js";
import { serviceDayFor } from "../../domain/site-resupply.js";
import { BakehouseResupplyAfterStopError } from "../../domain/site-resupply-gate-errors.js";
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
import { FixedLaunches, FixedResupplyCutoff, freshSendingKey } from "./site-resupply-doubles.js";
import { CROISSANT, PAIN_AU_CHOCOLAT } from "./resupply-articles.js";

const SITE = "site_village";
const ARTICLES = [CROISSANT, PAIN_AU_CHOCOLAT];
/**
 * L'instant du banc, figé : toutes les journées s'en déduisent par
 * `serviceDayFor`, et l'heure limite est absente — rien ne le compare au
 * calendrier réel. Il était l'horloge murale jusqu'au 2026-11-03.
 */
const NOW = new Date("2026-03-10T09:00:00Z");
const CONTENT = {
  siteId: SITE,
  target: "tomorrow" as const,
  name: "Vitrine du matin",
  lines: [{ sku: "CRO", quantity: 4, saleUnit: "piece" as const }],
};

function world(
  options: {
    readonly stoppedDays?: readonly string[];
    readonly sites?: readonly string[];
  } = {},
) {
  const log = new WriteLog();
  const clock = new FixedClock(NOW);
  const drafts = new InMemoryBakehouseDrafts(log);
  const resupplies = new LoggedSiteResupplies(log);
  const staff = new Directory({ name: "Lou Martin", role: "bakehouse" });
  const sites = new Sites(options.sites ?? [SITE]);
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
    create: new CreateBakehouseResupplyDraftHandler(drafts, sites, staff, clock),
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
    const key = freshSendingKey();
    const saved = await w.create.execute(
      new CreateBakehouseResupplyDraftCommand(CONTENT, "s", key),
    );
    expect(saved).toEqual({ id: key, version: 1 });
    const listed = await w.list.execute();
    expect(listed).toEqual([
      expect.objectContaining({
        id: key,
        version: 1,
        siteId: SITE,
        name: "Vitrine du matin",
        lines: [{ sku: "CRO", quantity: 4, saleUnit: "piece" as const }],
        savedByName: "Lou Martin",
      }),
    ]);
    await expect(
      w.create.execute(
        new CreateBakehouseResupplyDraftCommand(
          { ...CONTENT, siteId: "x" },
          "s",
          freshSendingKey(),
        ),
      ),
    ).rejects.toThrow(ResupplySiteUnknownError);
  });

  /**
   * Régression C-C (audit du 2026-11-02) : la création n'avait pas de clé
   * d'idempotence — deux clics sur « Enregistrer » faisaient deux brouillons.
   */
  it("deux créations de la même clé ne font qu'un brouillon, rendu tel qu'il est écrit", async () => {
    const w = world();
    const key = freshSendingKey();

    const first = await w.create.execute(
      new CreateBakehouseResupplyDraftCommand(CONTENT, "s", key),
    );
    const second = await w.create.execute(
      new CreateBakehouseResupplyDraftCommand(CONTENT, "s", key),
    );

    expect(second).toEqual(first);
    expect(w.drafts.all()).toHaveLength(1);
  });

  it("refuse nommément une clé déjà prise par le brouillon d'un autre point", async () => {
    const w = world({ sites: [SITE, "site_labo"] });
    const key = freshSendingKey();
    await w.create.execute(new CreateBakehouseResupplyDraftCommand(CONTENT, "s", key));

    await expect(
      w.create.execute(
        new CreateBakehouseResupplyDraftCommand({ ...CONTENT, siteId: "site_labo" }, "s", key),
      ),
    ).rejects.toThrow(BakehouseResupplyDraftKeyTakenError);
    expect(w.drafts.all().map((row) => row.content.siteId)).toEqual([SITE]);
  });

  it("se réécrivent sous la version lue ; une version périmée est refusée", async () => {
    const w = world();
    const { id } = await w.create.execute(
      new CreateBakehouseResupplyDraftCommand(CONTENT, "s", freshSendingKey()),
    );
    const rewritten = {
      ...CONTENT,
      lines: [{ sku: "PAC", quantity: 2, saleUnit: "piece" as const }],
    };
    expect(
      await w.save.execute(new SaveBakehouseResupplyDraftCommand(id, rewritten, 1, "s")),
    ).toEqual({ id, version: 2 });
    expect(w.drafts.row(id)?.content.lines).toEqual([
      { sku: "PAC", quantity: 2, saleUnit: "piece" as const },
    ]);
    await expect(
      w.save.execute(new SaveBakehouseResupplyDraftCommand(id, CONTENT, 1, "s")),
    ).rejects.toThrow(BakehouseResupplyDraftChangedMeanwhileError);
    await expect(
      w.save.execute(new SaveBakehouseResupplyDraftCommand("nope", CONTENT, 1, "s")),
    ).rejects.toThrow(BakehouseResupplyDraftNotFoundError);
  });

  it("supprimé, il sort de la liste et ne s'écrit plus", async () => {
    const w = world();
    const { id } = await w.create.execute(
      new CreateBakehouseResupplyDraftCommand(CONTENT, "s", freshSendingKey()),
    );
    await w.discard.execute(new DiscardBakehouseResupplyDraftCommand(id, 1, "s"));
    expect(w.drafts.row(id)?.status).toBe("discarded");
    expect(await w.list.execute()).toEqual([]);
    await expect(
      w.save.execute(new SaveBakehouseResupplyDraftCommand(id, CONTENT, 2, "s")),
    ).rejects.toThrow(BakehouseResupplyDraftClosedError);
  });

  it("envoyé : le réassort du fournil est créé PUIS le brouillon passe `sent`, dans une seule unité", async () => {
    const w = world();
    const { id } = await w.create.execute(
      new CreateBakehouseResupplyDraftCommand(CONTENT, "s", freshSendingKey()),
    );
    const screen = { ...CONTENT, lines: [{ sku: "PAC", quantity: 7, saleUnit: "piece" as const }] };

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
    expect(resupply?.lines).toEqual([
      { sku: "PAC", label: "Pain au chocolat", quantity: 7, saleUnit: "piece" as const },
    ]);
    expect(w.drafts.row(id)).toMatchObject({ status: "sent", sentResupplyId: resupplyId });
    expect(await w.list.execute()).toEqual([]);
  });

  /**
   * Décision E2 (audit final, 2026-11-03) : un second « Envoyer » sur la
   * version déjà envoyée était refusé (brouillon clos, 409) — un double clic
   * affichait une erreur pour un réassort bien parti.
   */
  it("un second « Envoyer » sur la même version rend le réassort déjà créé, sans rien écrire", async () => {
    const w = world();
    const { id } = await w.create.execute(
      new CreateBakehouseResupplyDraftCommand(CONTENT, "s", freshSendingKey()),
    );
    const first = await w.send.execute(new SendBakehouseResupplyDraftCommand(id, CONTENT, 1, "s"));
    const writes = w.log.entries.length;

    const second = await w.send.execute(new SendBakehouseResupplyDraftCommand(id, CONTENT, 1, "s"));

    expect(second).toBe(first);
    expect(w.log.entries).toHaveLength(writes);
    await expect(
      w.send.execute(new SendBakehouseResupplyDraftCommand(id, CONTENT, 0, "s")),
    ).rejects.toThrow(BakehouseResupplyDraftClosedError);
  });

  it("deux « Envoyer » qui se croisent : le second rend le réassort du premier", async () => {
    const w = world();
    const { id } = await w.create.execute(
      new CreateBakehouseResupplyDraftCommand(CONTENT, "s", freshSendingKey()),
    );
    let winner = "";
    w.resupplies.beforeNextSave = async () => {
      winner = await w.send.execute(new SendBakehouseResupplyDraftCommand(id, CONTENT, 1, "s"));
    };

    const loser = await w.send.execute(new SendBakehouseResupplyDraftCommand(id, CONTENT, 1, "s"));

    expect(loser).toBe(winner);
    expect(w.drafts.row(id)).toMatchObject({ status: "sent", sentResupplyId: winner });
  });

  it("un envoi refusé (article retiré, plan arrêté, version périmée) laisse le brouillon ouvert et intact", async () => {
    const w = world({ stoppedDays: [serviceDayFor("tomorrow", NOW)] });
    const { id } = await w.create.execute(
      new CreateBakehouseResupplyDraftCommand(CONTENT, "s", freshSendingKey()),
    );
    const before = w.drafts.row(id);

    await expect(
      w.send.execute(
        new SendBakehouseResupplyDraftCommand(
          id,
          { ...CONTENT, lines: [{ sku: "OLD", quantity: 1, saleUnit: "piece" as const }] },
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

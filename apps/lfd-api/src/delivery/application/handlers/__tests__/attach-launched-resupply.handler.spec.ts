import { HeldAfterCommit } from "../../../../platform/database/__tests__/held-after-commit.js";
import { BackgroundWork } from "../../../../platform/events/background-work.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import {
  ResupplyLaunchedEvent,
  ResupplyLaunchedPayloadError,
} from "../../../../production/channels/delivery/index.js";
import { AsapTransferDispatch } from "../../asap-transfer-dispatch.js";
import { AsapTransferUnplacedBell } from "../../asap-transfer-unplaced-bell.js";
import { RecordingStaffNotifier } from "../../commands/__tests__/decision-doubles.js";
import { TransferPlacer } from "../../transfer-placer.js";
import { frozenResupply } from "../../__tests__/resupply-transfer-doubles.js";
import {
  attachmentOver,
  InMemoryInternalTransfers,
  InternalTransfersReaderOver,
} from "../../__tests__/transfer-doubles.js";
import { AttachLaunchedResupply } from "../attach-launched-resupply.handler.js";
import { InMemoryDayReadiness, firsts } from "./day-readiness-doubles.js";

/*
 * Le réassort « au plus tôt » lancé, vu de la livraison (R4c) : attaché au
 * transfert non parti de son point par le mécanisme du soir, placé en fond,
 * la cloche du répartiteur s'il reste sans tournée ; et l'arrêt d'une journée
 * que ce lancement a ouverte. Des instants comparés entre eux seulement.
 */
const DAY = "2030-10-07";
const LAUNCHED = new Date(1_000);
const NOW = new Date(3_000);

/** Le placement du soir, doublé : avec un véhicule, il place tout ce qui reste ; sans, rien. */
class FleetPlacer extends TransferPlacer {
  readonly days: string[] = [];

  constructor(
    private readonly transfers: InMemoryInternalTransfers,
    private readonly placed: Set<string>,
    private readonly vehicle: boolean,
  ) {
    super();
  }

  placeDay(day: string): Promise<number> {
    this.days.push(day);
    if (this.vehicle) {
      for (const transfer of this.transfers.all()) {
        this.placed.add(transfer.id);
      }
    }
    return Promise.resolve(0);
  }

  placeDaySoon(day: string): void {
    this.days.push(`soon:${day}`);
  }
}

const VILLAGE = frozenResupply("res_vv", DAY, { name: "Vitrine midi", launchedAt: LAUNCHED });
const LABO = frozenResupply("res_labo", DAY, {
  siteId: "site_labo",
  siteLabel: "Le Labo",
  servedByTransfer: false,
  launchedAt: LAUNCHED,
});

const VILLAGE_LATE = frozenResupply("res_vv2", DAY, { launchedAt: LAUNCHED });

function setup(options: { readonly vehicle?: boolean } = {}) {
  const transfers = new InMemoryInternalTransfers();
  const placed = new Set<string>();
  const placer = new FleetPlacer(transfers, placed, options.vehicle ?? true);
  const notifier = new RecordingStaffNotifier();
  const afterCommit = new HeldAfterCommit();
  const work = new BackgroundWork();
  const clock = new FixedClock(NOW);
  const dispatch = new AsapTransferDispatch(
    placer,
    transfers,
    new InternalTransfersReaderOver(transfers, placed),
    new AsapTransferUnplacedBell(notifier),
    clock,
    afterCommit,
    work,
  );
  const days = new InMemoryDayReadiness();
  const handler = new AttachLaunchedResupply(
    days,
    clock,
    attachmentOver([], transfers, undefined, [VILLAGE, VILLAGE_LATE, LABO]),
    dispatch,
  );
  const handle = (resupply: typeof VILLAGE, openedPlan = false): Promise<void> => {
    const { lines, siteId, siteLabel, name, servedByTransfer, resupplyId } = resupply;
    const event = new ResupplyLaunchedEvent(
      DAY,
      LAUNCHED,
      "staff_paul",
      "Paul",
      { resupplyId, siteId, siteLabel, name, servedByTransfer, lines },
      null,
      openedPlan,
    );
    const { type, payload } = event.durableFact();
    return handler.handle({ eventId: "e", type, payload });
  };
  const launch = async (resupply: typeof VILLAGE, openedPlan = false): Promise<void> => {
    await handle(resupply, openedPlan);
    await afterCommit.commit();
    await work.whenIdle();
  };
  return { transfers, placer, notifier, days, handle, launch, afterCommit, handler };
}

describe("AttachLaunchedResupply (R4c)", () => {
  it("le Village : attaché à un transfert neuf, puis placé après la validation — rien ne sonne", async () => {
    const { transfers, placer, notifier, launch } = setup();

    await launch(VILLAGE);

    expect(transfers.all().map((t) => [t.siteLabel, t.resupplyIds])).toEqual([
      ["Val Village", ["res_vv"]],
    ]);
    expect(placer.days).toEqual([DAY]);
    expect(notifier.notified).toEqual([]);
  });

  it("rejoint le premier transfert NON PARTI de son point ; un parti n'en reçoit plus", async () => {
    const { transfers, launch } = setup();
    await launch(VILLAGE);
    const [departed] = transfers.all();
    departed?.depart(NOW, () => []);
    if (departed !== undefined) {
      await transfers.save(departed);
    }

    await launch(VILLAGE_LATE);

    expect(transfers.all().map((t) => [t.status, t.resupplyIds])).toEqual([
      ["departed", ["res_vv"]],
      ["planned", ["res_vv2"]],
    ]);
  });

  it("un transfert prévu du point le reçoit, sans en ouvrir un autre", async () => {
    const { transfers, launch } = setup();
    await launch(VILLAGE);

    await launch(VILLAGE_LATE);

    expect(transfers.all().map((t) => t.resupplyIds)).toEqual([["res_vv", "res_vv2"]]);
  });

  it("le Labo, servi sur place : aucun transfert, aucun placement", async () => {
    const { transfers, placer, launch } = setup();

    await launch(LABO);

    expect(transfers.all()).toEqual([]);
    expect(placer.days).toEqual([]);
  });

  it("aucun véhicule libre : la cloche du répartiteur sonne, une clé par réassort", async () => {
    const { notifier, launch } = setup({ vehicle: false });

    await launch(VILLAGE);
    await launch(VILLAGE);

    expect(notifier.notified).toEqual([
      expect.objectContaining({
        kind: "delivery.asap_transfer_unplaced",
        subject: "Réassort au plus tôt sans tournée — Val Village",
        body: expect.stringContaining("« Vitrine midi » (Val Village, au plus tôt)") as string,
        link: `/livraison/tournees?jour=${DAY}`,
        idempotencyKey: "notification:delivery.asap_transfer_unplaced:res_vv",
        occurredAt: NOW,
        audience: "delivery_rounds:write",
      }),
      expect.objectContaining({
        idempotencyKey: "notification:delivery.asap_transfer_unplaced:res_vv",
      }),
    ]);
  });

  it("rejoué, il ne range rien deux fois", async () => {
    const { transfers, launch } = setup();

    await launch(VILLAGE);
    await launch(VILLAGE);

    expect(transfers.all().flatMap((t) => t.resupplyIds)).toEqual(["res_vv"]);
  });

  it("rien ne se place avant la validation de l'abonné", async () => {
    const { placer, afterCommit, handle } = setup();

    await handle(VILLAGE);
    afterCommit.discard();

    expect(placer.days).toEqual([]);
  });
});

describe("AttachLaunchedResupply — la journée ouverte par le lancement (R4c, Q5)", () => {
  it("apprend l'arrêt à l'instant du lancement, sans livraison, même pour le Labo", async () => {
    const { days, launch } = setup();

    await launch(LABO, true);

    expect(days.rows.get(DAY)).toMatchObject({ closedAt: LAUNCHED, shipments: firsts() });
  });

  it("une journée déjà arrêtée : le lancement ne touche pas à son arrêt", async () => {
    const { days, launch } = setup();

    await launch(VILLAGE, false);

    expect(days.rows.get(DAY)).toBeUndefined();
  });

  it("refuse un fait illisible", async () => {
    const { handler } = setup();

    await expect(
      handler.handle({ eventId: "e", type: "production.resupply_launched", payload: {} }),
    ).rejects.toThrow(ResupplyLaunchedPayloadError);
  });
});

import type { PickupAddressView, PublicPickupSchedulePayload } from "@lfd/contracts";

import { DirectUnitOfWork } from "../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../platform/events/__tests__/recording-publisher.js";
import { PickupSchedule } from "../../domain/pickup-schedule.js";
import { PickupScheduleRepository } from "../../domain/pickup-schedule.repository.js";
import {
  PickupAddressRepository,
  type PickupAddressWrite,
} from "../../domain/pickup-address.repository.js";
import {
  PickupAddressNotFoundError,
  PublicPickupSlotRangeError,
  PublicPickupSlotRulesOverlapError,
} from "../../domain/pickup-errors.js";
import { SavePublicPickupScheduleCommand } from "../save-public-pickup-schedule.command.js";
import { SavePublicPickupScheduleHandler } from "../save-public-pickup-schedule.handler.js";

const POINT_ID = "pickup_1";

const POINT: PickupAddressView = {
  id: POINT_ID,
  label: "Labo Paris",
  ligne1: "18 rue des Archives",
  ligne2: "",
  codePostal: "75004",
  ville: "Paris",
  pays: "France",
  isDefault: true,
  discount: null,
  discountAudiences: { b2b: true, b2c: true },
  opening: { publicOpening: null, proPickup: null },
};

/** Le point en base — seul `resolve` est appelé par ce handler. */
class StoredPoints extends PickupAddressRepository {
  constructor(private readonly stored: PickupAddressView | null) {
    super();
  }
  list(): Promise<readonly PickupAddressView[]> {
    return Promise.resolve(this.stored === null ? [] : [this.stored]);
  }
  resolve(): Promise<PickupAddressView | null> {
    return Promise.resolve(this.stored);
  }
  create(_point: PickupAddressWrite): Promise<string> {
    return Promise.reject(new Error("non utilisé"));
  }
  update(): Promise<void> {
    return Promise.reject(new Error("non utilisé"));
  }
  remove(): Promise<void> {
    return Promise.reject(new Error("non utilisé"));
  }
  setDefault(): Promise<void> {
    return Promise.reject(new Error("non utilisé"));
  }
}

/** L'horaire en base, et ce qu'on y écrit. */
class StoredSchedules extends PickupScheduleRepository {
  written: PickupSchedule | null = null;

  load(pickupAddressId: string): Promise<PickupSchedule> {
    return Promise.resolve(PickupSchedule.empty(pickupAddressId));
  }
  save(schedule: PickupSchedule): Promise<void> {
    this.written = schedule;
    return Promise.resolve();
  }
}

const MORNING = {
  weekday: "mon",
  startTime: "07:00",
  endTime: "09:00",
  slotMinutes: 15,
  badge: "Sortie du four",
  serviceCapacity: 10,
} as const;

function payload(
  overrides: Partial<PublicPickupSchedulePayload> = {},
): PublicPickupSchedulePayload {
  return { rules: [MORNING], closures: [], ...overrides };
}

function save(
  points: StoredPoints,
  schedules: StoredSchedules,
  body: PublicPickupSchedulePayload,
  events = new RecordingPublisher(),
): Promise<void> {
  return new SavePublicPickupScheduleHandler(
    points,
    schedules,
    events,
    new DirectUnitOfWork(),
  ).execute(new SavePublicPickupScheduleCommand(POINT_ID, body));
}

describe("SavePublicPickupScheduleHandler", () => {
  it("écrit l'horaire et journalise ce qui a été posé", async () => {
    const schedules = new StoredSchedules();
    const events = new RecordingPublisher();

    await save(new StoredPoints(POINT), schedules, payload(), events);

    expect(schedules.written?.ruleCount).toBe(1);
    expect(events.factTypes()).toEqual(["public_pickup_schedule.updated"]);
    expect(events.traced[0]?.journalFact().payload).toMatchObject({
      subjectLabel: "Labo Paris",
      label: "Labo Paris",
      ruleCount: 1,
      closureCount: 0,
      configured: true,
    });
  });

  /** Un point réglé qu'on vide redevient un point ordinaire (D6). */
  it("vider l'horaire est un enregistrement comme un autre, et il se journalise", async () => {
    const schedules = new StoredSchedules();
    const events = new RecordingPublisher();

    await save(new StoredPoints(POINT), schedules, { rules: [], closures: [] }, events);

    expect(schedules.written?.isConfigured).toBe(false);
    expect(events.traced[0]?.journalFact().payload).toMatchObject({ configured: false });
  });

  it("un point introuvable est un 404, et rien n'est écrit ni journalisé", async () => {
    const schedules = new StoredSchedules();
    const events = new RecordingPublisher();

    await expect(save(new StoredPoints(null), schedules, payload(), events)).rejects.toBeInstanceOf(
      PickupAddressNotFoundError,
    );
    expect(schedules.written).toBeNull();
    expect(events.traced).toHaveLength(0);
  });

  it("refuse deux plages qui se chevauchent, sans rien écrire", async () => {
    const schedules = new StoredSchedules();
    const events = new RecordingPublisher();

    await expect(
      save(
        new StoredPoints(POINT),
        schedules,
        payload({ rules: [MORNING, { ...MORNING, startTime: "08:00", endTime: "10:00" }] }),
        events,
      ),
    ).rejects.toBeInstanceOf(PublicPickupSlotRulesOverlapError);
    expect(schedules.written).toBeNull();
    expect(events.traced).toHaveLength(0);
  });

  /**
   * Les value objects sont construits AVANT la transaction : une charge
   * malformée n'ouvre rien, et le refus est le même quel que soit le chemin
   * d'entrée.
   */
  it("refuse une plage à l'envers avant même de chercher le point", async () => {
    const points = new StoredPoints(null);
    const schedules = new StoredSchedules();

    await expect(
      save(
        points,
        schedules,
        payload({ rules: [{ ...MORNING, startTime: "09:00", endTime: "07:00" }] }),
      ),
    ).rejects.toBeInstanceOf(PublicPickupSlotRangeError);
    expect(schedules.written).toBeNull();
  });
});

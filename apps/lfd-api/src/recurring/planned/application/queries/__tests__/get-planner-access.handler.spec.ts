import { PlannerAccess, type PlannerCaller } from "../../../../channels/commerce/planner-access.js";
import { FixedStanding } from "../../../../occurrence/application/__tests__/recurring-doubles.js";
import { GetPlannerAccessHandler } from "../get-planner-access.handler.js";
import { GetPlannerAccessQuery } from "../get-planner-access.query.js";

/** La clé `orderPlanner` doublée : ouverte pour les seules sociétés données. */
class OpenForCompanies extends PlannerAccess {
  readonly asked: PlannerCaller[] = [];

  constructor(private readonly open: ReadonlySet<string>) {
    super();
  }

  isOpenFor(caller: PlannerCaller): Promise<boolean> {
    this.asked.push(caller);
    return Promise.resolve(this.open.has(caller.companyId));
  }
}

function scene() {
  const access = new OpenForCompanies(new Set(["chalet"]));
  const handler = new GetPlannerAccessHandler(
    new FixedStanding(new Set(["user_1/chalet", "user_1/bistrot", "user_2/site_chalet"])),
    access,
  );
  return { access, handler };
}

describe("GetPlannerAccessHandler — « le planificateur est-il ouvert ici ? »", () => {
  it("ouvert dans l'espace de la société exemptée", async () => {
    const { handler, access } = scene();

    await expect(handler.execute(new GetPlannerAccessQuery("user_1", "chalet"))).resolves.toEqual({
      open: true,
    });
    expect(access.asked).toEqual([{ companyId: "chalet" }]);
  });

  it("fermé dans l'espace d'une autre société de la même personne", async () => {
    const { handler } = scene();

    await expect(handler.execute(new GetPlannerAccessQuery("user_1", "bistrot"))).resolves.toEqual({
      open: false,
    });
  });

  /** Égalité exacte : exempter un principal n'ouvre pas ses sites. */
  it("fermé dans l'espace d'un site, même si son principal est exempté", async () => {
    const { handler } = scene();

    await expect(
      handler.execute(new GetPlannerAccessQuery("user_2", "site_chalet")),
    ).resolves.toEqual({ open: false });
  });

  it("fermé en perso, sans refus ni lecture de la clé", async () => {
    const { handler, access } = scene();

    await expect(handler.execute(new GetPlannerAccessQuery("user_1", null))).resolves.toEqual({
      open: false,
    });
    expect(access.asked).toEqual([]);
  });

  it("fermé pour qui n'est plus membre, sans lire la clé", async () => {
    const { handler, access } = scene();

    await expect(handler.execute(new GetPlannerAccessQuery("user_9", "chalet"))).resolves.toEqual({
      open: false,
    });
    expect(access.asked).toEqual([]);
  });
});

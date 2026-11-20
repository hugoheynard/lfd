import { DirectUnitOfWork } from "../../../../../platform/database/__tests__/direct-unit-of-work.js";
import { RecordingPublisher } from "../../../../../platform/events/__tests__/recording-publisher.js";
import { FixedIdGenerator } from "../../../../../platform/id/fixed-id-generator.js";
import { InMemoryGestureIntentLedger } from "../../../../../platform/intent/__tests__/in-memory-gesture-intent.ledger.js";
import { OncePerIntent } from "../../../../../platform/intent/once-per-intent.js";
import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import type { CompanyStanding } from "../../../../shared/company-standing/domain/company-standing.js";
import type { StandingRole } from "../../../../shared/company-standing/domain/standing-role.js";
import { Company } from "../../../domain/entities/company.js";
import { SubAccountMenu } from "../../../domain/entities/sub-account-menu.js";
import { CompanyNotFoundError } from "../../../domain/errors/account-errors.js";
import { NotASubAccountError } from "../../../domain/errors/hierarchy-errors.js";
import {
  NoOwnMenuToResumeError,
  NotAPrincipalError,
  SitesMenuWriterRequiredError,
  SubAccountMenuWriterRequiredError,
} from "../../../domain/errors/sub-account-menu-errors.js";
import { CompanyRepository, type KbisLocation } from "../../../domain/ports/company.repository.js";
import { SubAccountMenuAccessReader } from "../../../domain/ports/sub-account-menu-access.reader.js";
import type { RequestedMenu } from "../../../domain/services/whole-menu.js";
import { HierarchyPlace } from "../../../domain/value-objects/hierarchy-place.js";
import { SubAccountMenuWriting } from "../../services/sub-account-menu-writing.js";
import { SetPrincipalSitesMenuByStaffCommand } from "../set-principal-sites-menu-by-staff.command.js";
import { SetPrincipalSitesMenuByStaffHandler } from "../set-principal-sites-menu-by-staff.handler.js";
import { SetPrincipalSitesMenuCommand } from "../set-principal-sites-menu.command.js";
import { SetPrincipalSitesMenuHandler } from "../set-principal-sites-menu.handler.js";
import { SetSubAccountMenuStateByStaffCommand } from "../set-sub-account-menu-state-by-staff.command.js";
import { SetSubAccountMenuStateByStaffHandler } from "../set-sub-account-menu-state-by-staff.handler.js";
import { SetSubAccountMenuStateCommand } from "../set-sub-account-menu-state.command.js";
import { SetSubAccountMenuStateHandler } from "../set-sub-account-menu-state.handler.js";
import { InMemoryMenus, InMemorySitesMenus } from "./menu-doubles.js";
import { recordedGestures } from "./site-gesture-doubles.js";

const PRINCIPAL = "co_principal";
const SITE = "co_site";
const INTENT = "1b4e28ba-2fa1-41d2-883f-0016d3cca427";
const OTHER_INTENT = "6ec0bd7f-11c0-43da-975e-2a8ad9ebae0b";
const NOW = new Date(Date.UTC(2030, 0, 1));

function company(id: string, parentCompanyId: string | null): Company {
  return Company.reconstitute({
    id,
    raisonSociale: "Club SAS",
    enseigne: id === PRINCIPAL ? "Club" : "Chalet",
    formeJuridique: "sas",
    siret: "81245678900021",
    vatNumber: "",
    contact: null,
    grantedTerms: [],
    requestedTerm: null,
    status: "active",
    activatedAt: null,
    activatedBy: null,
    suspensionCause: null,
    nafCode: "",
    hierarchy: HierarchyPlace.reconstitute({
      parentCompanyId,
      hasSubAccounts: parentCompanyId === null,
      groupWithoutDelivery: false,
    }),
  });
}

class OneCompany extends CompanyRepository {
  constructor(private readonly company: Company | null) {
    super();
  }
  existsBySiret(): Promise<boolean> {
    return Promise.resolve(false);
  }
  load(): Promise<Company | null> {
    return Promise.resolve(this.company);
  }
  save(): Promise<void> {
    return Promise.reject(new TypeError("la société ne se réécrit pas pour sa carte"));
  }
  declareOwnedBy(): Promise<string> {
    return Promise.resolve("c");
  }
  declareUnowned(): Promise<string> {
    return Promise.resolve("c");
  }
  kbisLocation(): Promise<KbisLocation | null> {
    return Promise.resolve(null);
  }
}

class FixedStanding extends SubAccountMenuAccessReader {
  constructor(private readonly standing: CompanyStanding | null) {
    super();
  }
  standingOf(): Promise<CompanyStanding | null> {
    return Promise.resolve(this.standing);
  }
}

function own(role: StandingRole, over: Partial<CompanyStanding> = {}): CompanyStanding {
  return { companyStatus: "active", own: role, ownAccepted: true, via: null, ...over };
}

function heir(role: StandingRole): CompanyStanding {
  return {
    companyStatus: "active",
    own: null,
    ownAccepted: false,
    via: { companyId: PRINCIPAL, name: "Club", role },
  };
}

const NO_PASTRY: RequestedMenu = {
  mode: "except",
  offMenu: "visible_locked",
  entries: [{ level: "family", ref: "fam_patisserie", effect: "exclude" }],
};

function siteMenu(state: "own" | "follows_common"): SubAccountMenu {
  return SubAccountMenu.reconstitute({
    companyId: SITE,
    mode: "only",
    offMenu: "hidden",
    entries: [],
    stamp: { author: { kind: "staff", staffId: "stf_0" }, at: NOW },
    state,
  });
}

function scene(
  target: Company | null,
  place: CompanyStanding | null = null,
  stored: SubAccountMenu | null = null,
) {
  const menus = new InMemoryMenus(stored);
  const sitesMenus = new InMemorySitesMenus();
  const events = new RecordingPublisher();
  const clock = new FixedClock(NOW);
  const writing = new SubAccountMenuWriting(
    new OneCompany(target),
    menus,
    sitesMenus,
    new FixedIdGenerator("ent"),
    clock,
  );
  const uow = new DirectUnitOfWork();
  const gestures = recordedGestures(new Map([[SITE, PRINCIPAL]]));
  const intents = new OncePerIntent(new InMemoryGestureIntentLedger(), clock);
  const access = new FixedStanding(place);
  return {
    menus,
    sitesMenus,
    events,
    durable: gestures.durable,
    principal: new SetPrincipalSitesMenuHandler(
      access,
      writing,
      sitesMenus,
      events,
      gestures.publisher,
      uow,
    ),
    staff: new SetPrincipalSitesMenuByStaffHandler(
      writing,
      sitesMenus,
      events,
      gestures.publisher,
      uow,
      intents,
    ),
    switchState: new SetSubAccountMenuStateHandler(
      access,
      writing,
      menus,
      events,
      gestures.publisher,
      uow,
    ),
    staffSwitch: new SetSubAccountMenuStateByStaffHandler(
      writing,
      menus,
      events,
      gestures.publisher,
      uow,
      intents,
    ),
  };
}

describe("SetPrincipalSitesMenuHandler — le principal pose la carte commune", () => {
  it.each(["owner", "admin"] as const)("le %s accepté du principal la pose", async (role) => {
    const { principal, sitesMenus, events, durable } = scene(company(PRINCIPAL, null), own(role));

    await principal.execute(new SetPrincipalSitesMenuCommand("usr_1", PRINCIPAL, NO_PASTRY));

    expect(sitesMenus.saved).toHaveLength(1);
    expect(events.traced.map((event) => event.journalFact())).toEqual([
      {
        type: "company.principal_sites_menu_set",
        subjectType: "company",
        subjectId: PRINCIPAL,
        payload: {
          subjectLabel: "Club",
          mode: "except",
          offMenu: "visible_locked",
          included: 0,
          excluded: 1,
        },
      },
    ]);
    expect(durable.facts.map((fact) => fact.payload)).toEqual([
      expect.objectContaining({ principalCompanyId: PRINCIPAL, byTeam: false }),
    ]);
  });

  it.each([
    ["un invité qui n'est pas entré", own("owner", { ownAccepted: false })],
    ["un principal suspendu", own("owner", { companyStatus: "suspended" })],
    ["un membre `orders`", own("orders")],
    ["l'admin hérité d'un autre principal", heir("admin")],
  ])("refuse %s, sans rien écrire", async (_label, place) => {
    const { principal, sitesMenus } = scene(company(PRINCIPAL, null), place);
    await expect(
      principal.execute(new SetPrincipalSitesMenuCommand("usr_1", PRINCIPAL, NO_PASTRY)),
    ).rejects.toThrow(SitesMenuWriterRequiredError);
    expect(sitesMenus.saved).toHaveLength(0);
  });

  it("le propriétaire d'un SITE ne pose pas de carte commune sur son site : il n'a pas de sites", async () => {
    const { principal, sitesMenus } = scene(company(SITE, PRINCIPAL), own("owner"));
    await expect(
      principal.execute(new SetPrincipalSitesMenuCommand("usr_1", SITE, NO_PASTRY)),
    ).rejects.toThrow(NotAPrincipalError);
    expect(sitesMenus.saved).toHaveLength(0);
  });

  it("qui n'atteint pas la société reçoit le refus d'une société inconnue", async () => {
    const { principal } = scene(company(PRINCIPAL, null), null);
    await expect(
      principal.execute(new SetPrincipalSitesMenuCommand("usr_1", PRINCIPAL, NO_PASTRY)),
    ).rejects.toThrow(CompanyNotFoundError);
  });

  it("rejouée à l'identique, n'écrit rien de plus", async () => {
    const { principal, sitesMenus } = scene(company(PRINCIPAL, null), own("owner"));
    await principal.execute(new SetPrincipalSitesMenuCommand("usr_1", PRINCIPAL, NO_PASTRY));
    await principal.execute(new SetPrincipalSitesMenuCommand("usr_1", PRINCIPAL, NO_PASTRY));
    expect(sitesMenus.saved).toHaveLength(1);
  });
});

describe("SetPrincipalSitesMenuByStaffHandler — le staff pose la carte commune", () => {
  it("écrit le fait par l'équipe, principal = la société du geste : l'avis s'y abonne", async () => {
    const { staff, durable } = scene(company(PRINCIPAL, null));

    await staff.execute(
      new SetPrincipalSitesMenuByStaffCommand(PRINCIPAL, "stf_1", NO_PASTRY, INTENT),
    );

    expect(durable.facts.map((fact) => [fact.type, fact.payload])).toEqual([
      [
        "company.principal_sites_menu_set",
        expect.objectContaining({
          siteCompanyId: PRINCIPAL,
          siteName: "Club",
          principalCompanyId: PRINCIPAL,
          authorUserId: null,
          byTeam: true,
        }),
      ],
    ]);
  });

  it("une fois par intention, et pas de second fait sous une autre intention si rien ne change", async () => {
    const { staff, sitesMenus, durable } = scene(company(PRINCIPAL, null));
    const command = new SetPrincipalSitesMenuByStaffCommand(PRINCIPAL, "stf_1", NO_PASTRY, INTENT);
    await staff.execute(command);
    await staff.execute(command);
    await staff.execute(
      new SetPrincipalSitesMenuByStaffCommand(PRINCIPAL, "stf_1", NO_PASTRY, OTHER_INTENT),
    );
    expect(sitesMenus.saved).toHaveLength(1);
    expect(durable.facts).toHaveLength(1);
  });

  it("refuse une carte commune sur un site", async () => {
    const { staff } = scene(company(SITE, PRINCIPAL));
    await expect(
      staff.execute(new SetPrincipalSitesMenuByStaffCommand(SITE, "stf_1", NO_PASTRY, INTENT)),
    ).rejects.toThrow(NotAPrincipalError);
  });
});

describe("La bascule d'un site — suivre la carte commune, reprendre la sienne", () => {
  it("le principal fait suivre la carte commune ; rejouée, rien de plus", async () => {
    const { switchState, menus, events, durable } = scene(
      company(SITE, PRINCIPAL),
      heir("admin"),
      siteMenu("own"),
    );
    const command = new SetSubAccountMenuStateCommand("usr_1", SITE, "follows_common");

    await switchState.execute(command);
    await switchState.execute(command);

    expect(menus.saved.map((menu) => menu.state)).toEqual(["follows_common"]);
    expect(menus.saved[0]?.entries).toEqual([]);
    expect(events.traced.map((event) => event.journalFact().type)).toEqual([
      "company.sub_account_menu_state_set",
    ]);
    expect(durable.facts.map((fact) => fact.type)).toEqual(["company.sub_account_menu_set"]);
  });

  it("🔴 le propriétaire du site lui-même ne bascule pas sa carte", async () => {
    const { switchState, menus } = scene(company(SITE, PRINCIPAL), own("owner"), siteMenu("own"));
    await expect(
      switchState.execute(new SetSubAccountMenuStateCommand("usr_1", SITE, "follows_common")),
    ).rejects.toThrow(SubAccountMenuWriterRequiredError);
    expect(menus.saved).toHaveLength(0);
  });

  it("un site sans carte propre suit déjà la commune ; il ne reprend pas ce qu'il n'a pas", async () => {
    const { switchState, menus } = scene(company(SITE, PRINCIPAL), heir("owner"));
    await switchState.execute(new SetSubAccountMenuStateCommand("usr_1", SITE, "follows_common"));
    expect(menus.saved).toHaveLength(0);
    await expect(
      switchState.execute(new SetSubAccountMenuStateCommand("usr_1", SITE, "own")),
    ).rejects.toThrow(NoOwnMenuToResumeError);
  });

  it("le staff rend sa carte propre au site, par l'équipe, une fois par intention", async () => {
    const { staffSwitch, menus, durable } = scene(
      company(SITE, PRINCIPAL),
      null,
      siteMenu("follows_common"),
    );
    const command = new SetSubAccountMenuStateByStaffCommand(SITE, "stf_1", "own", INTENT);
    await staffSwitch.execute(command);
    await staffSwitch.execute(command);
    expect(menus.saved.map((menu) => menu.state)).toEqual(["own"]);
    expect(menus.saved[0]?.stamp.author).toEqual({ kind: "staff", staffId: "stf_1" });
    expect(durable.facts.map((fact) => fact.payload)).toEqual([
      expect.objectContaining({ siteCompanyId: SITE, principalCompanyId: PRINCIPAL, byTeam: true }),
    ]);
  });

  it("refuse la bascule d'une société sans principal", async () => {
    const { staffSwitch } = scene(company(PRINCIPAL, null), null, null);
    await expect(
      staffSwitch.execute(
        new SetSubAccountMenuStateByStaffCommand(PRINCIPAL, "stf_1", "follows_common", INTENT),
      ),
    ).rejects.toThrow(NotASubAccountError);
  });
});

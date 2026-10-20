import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import {
  NotAPrincipalError,
  NoticePrincipalNotFoundError,
} from "../../../domain/errors/sub-account-notice-errors.js";
import { alpesAndChalet, InMemoryNoticeRules } from "../../__tests__/notice-doubles.js";
import { GetSubAccountNoticeRulesHandler } from "../../queries/get-sub-account-notice-rules.handler.js";
import { GetSubAccountNoticeRulesQuery } from "../../queries/get-sub-account-notice-rules.query.js";
import { ResetSubAccountNoticeRulesCommand } from "../reset-sub-account-notice-rules.command.js";
import { ResetSubAccountNoticeRulesHandler } from "../reset-sub-account-notice-rules.handler.js";
import { SetSubAccountNoticeRuleCommand } from "../set-sub-account-notice-rule.command.js";
import { SetSubAccountNoticeRuleHandler } from "../set-sub-account-notice-rule.handler.js";

const NOW = new Date(Date.UTC(2030, 0, 1, 9));

function build() {
  const parents = alpesAndChalet();
  const rules = new InMemoryNoticeRules();
  return {
    rules,
    set: new SetSubAccountNoticeRuleHandler(parents, rules.writer, new FixedClock(NOW)),
    reset: new ResetSubAccountNoticeRulesHandler(parents, rules.writer),
    get: new GetSubAccountNoticeRulesHandler(parents, rules),
  };
}

describe("SetSubAccountNoticeRuleHandler", () => {
  it("pose une dérogation qui s'écarte du défaut, avec son auteur et l'heure du Clock", async () => {
    const { rules, set } = build();

    await set.execute(
      new SetSubAccountNoticeRuleCommand("alpes", "order_placed", "orders", false, "staff_1"),
    );

    expect([...rules.rows.values()]).toEqual([
      { kind: "order_placed", role: "orders", enabled: false, staffId: "staff_1", at: NOW },
    ]);
  });

  it("EFFACE la dérogation quand la cellule revient à sa valeur par défaut", async () => {
    const { rules, set } = build();
    await set.execute(
      new SetSubAccountNoticeRuleCommand("alpes", "order_placed", "orders", false, "s"),
    );

    await set.execute(
      new SetSubAccountNoticeRuleCommand("alpes", "order_placed", "orders", true, "s"),
    );

    expect(rules.rows.size).toBe(0);
  });

  it("refuse un sous-compte, en nommant son principal, sans rien écrire", async () => {
    const { rules, set } = build();

    const refusal = set.execute(
      new SetSubAccountNoticeRuleCommand("chalet", "order_placed", "owner", false, "s"),
    );

    await expect(refusal).rejects.toBeInstanceOf(NotAPrincipalError);
    await expect(refusal).rejects.toThrow(/alpes/u);
    expect(rules.rows.size).toBe(0);
  });

  it("refuse une société inconnue", async () => {
    const { set } = build();

    await expect(
      set.execute(new SetSubAccountNoticeRuleCommand("ghost", "order_placed", "owner", false, "s")),
    ).rejects.toBeInstanceOf(NoticePrincipalNotFoundError);
  });
});

describe("GetSubAccountNoticeRulesHandler", () => {
  it("rend le défaut fusionné avec les dérogations, cellule par cellule", async () => {
    const { set, get } = build();
    await set.execute(
      new SetSubAccountNoticeRuleCommand("alpes", "payment_failed", "admin", true, "s"),
    );

    const grid = await get.execute(new GetSubAccountNoticeRulesQuery("alpes"));

    expect(grid).toHaveLength(32);
    expect(grid.filter((cell) => !cell.atDefault)).toEqual([
      { kind: "payment_failed", role: "admin", enabled: true, atDefault: false },
    ]);
  });

  it("refuse de lire le tableau d'un sous-compte", async () => {
    const { get } = build();

    await expect(get.execute(new GetSubAccountNoticeRulesQuery("chalet"))).rejects.toBeInstanceOf(
      NotAPrincipalError,
    );
  });
});

describe("ResetSubAccountNoticeRulesHandler", () => {
  it("efface toutes les dérogations du principal", async () => {
    const { rules, set, reset } = build();
    await set.execute(
      new SetSubAccountNoticeRuleCommand("alpes", "order_placed", "owner", false, "s"),
    );
    await set.execute(
      new SetSubAccountNoticeRuleCommand("alpes", "contact_changed", "orders", true, "s"),
    );

    await reset.execute(new ResetSubAccountNoticeRulesCommand("alpes"));

    expect(rules.rows.size).toBe(0);
  });

  it("refuse un sous-compte", async () => {
    const { reset } = build();

    await expect(
      reset.execute(new ResetSubAccountNoticeRulesCommand("chalet")),
    ).rejects.toBeInstanceOf(NotAPrincipalError);
  });
});

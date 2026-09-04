import { InvalidOrderTimeLimitScopeError } from "../../errors/order-time-limit-errors.js";
import { LimitScope } from "../limit-scope.js";

describe("LimitScope", () => {
  it("accepte une portée globale sans cible", () => {
    expect(LimitScope.of({ type: "global", id: null }).key).toBe("global:");
  });

  it("accepte une portée précise qui nomme sa cible", () => {
    expect(LimitScope.of({ type: "category", id: "patisserie" }).key).toBe("category:patisserie");
  });

  /**
   * Les deux sens du « si et seulement si », et il faut les deux : une portée
   * globale qui nomme une famille dit deux choses contradictoires, et une portée
   * « famille » sans famille ne vise rien. N'en tenir qu'un laisserait passer
   * l'autre — et c'est celui qu'on ne teste pas qui arrive.
   */
  it("refuse une portée globale qui nomme une cible", () => {
    expect(() => LimitScope.of({ type: "global", id: "patisserie" })).toThrow(
      InvalidOrderTimeLimitScopeError,
    );
  });

  it("refuse une portée précise sans cible", () => {
    expect(() => LimitScope.of({ type: "product", id: null })).toThrow(
      InvalidOrderTimeLimitScopeError,
    );
  });

  /**
   * La clé écrit `''` pour l'absence de cible — exactement ce que fait
   * `coalesce(scope_id, '')` dans l'index unique. La même écriture des deux
   * côtés évite qu'un jour l'un accepte ce que l'autre refuse.
   */
  it("écrit la clé comme l'index unique de la base", () => {
    expect(LimitScope.of({ type: "global", id: null }).key).toBe("global:");
  });
});

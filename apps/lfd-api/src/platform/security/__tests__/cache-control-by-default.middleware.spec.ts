import {
  ANONYMOUS_CACHE_CONTROL,
  cacheControlByDefault,
  PERSONAL_CACHE_CONTROL,
} from "../cache-control-by-default.middleware.js";

function run(headers: Record<string, string>): { header: string | null; nextCalls: number } {
  let header: string | null = null;
  let nextCalls = 0;
  cacheControlByDefault(
    { headers },
    {
      setHeader: (_name, value) => {
        header = value;
      },
    },
    () => {
      nextCalls += 1;
    },
  );
  return { header, nextCalls };
}

describe("cacheControlByDefault", () => {
  it("ne laisse rien garder d'une réponse à une personne identifiée", () => {
    expect(run({ authorization: "Bearer x" })).toEqual({
      header: PERSONAL_CACHE_CONTROL,
      nextCalls: 1,
    });
  });

  it("laisse le navigateur d'un visiteur revalider, sans cache partagé", () => {
    expect(run({})).toEqual({ header: ANONYMOUS_CACHE_CONTROL, nextCalls: 1 });
  });

  it("un en-tête Authorization vide compte comme une personne", () => {
    expect(run({ authorization: "" }).header).toBe(PERSONAL_CACHE_CONTROL);
  });
});

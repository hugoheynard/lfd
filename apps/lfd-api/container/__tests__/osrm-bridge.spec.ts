import { bridgeToOsrm, type OsrmService } from "../osrm-bridge";

const TABLE = "http://osrm.internal/table/v1/driving/6.97,45.44;6.77,45.57";

/** Un binding qui répond — et garde la requête qu'on lui a passée. */
class AnsweringOsrm implements OsrmService {
  received: Request | null = null;
  constructor(private readonly response: Response) {}
  fetch(request: Request): Promise<Response> {
    this.received = request;
    return Promise.resolve(this.response);
  }
}

class BrokenOsrm implements OsrmService {
  fetch(): Promise<Response> {
    return Promise.reject(new Error("Network connection lost"));
  }
}

describe("bridgeToOsrm — le pont vers `lfd-osrm`", () => {
  it("passe la requête au binding et rend sa réponse telle quelle", async () => {
    const osrm = new AnsweringOsrm(Response.json({ code: "Ok" }, { status: 200 }));
    const request = new Request(TABLE);

    const response = await bridgeToOsrm(request, osrm);

    expect(osrm.received).toBe(request);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ code: "Ok" });
  });

  it("transmet un refus d'OSRM sans le maquiller", async () => {
    const osrm = new AnsweringOsrm(Response.json({ code: "TooBig" }, { status: 400 }));

    expect((await bridgeToOsrm(new Request(TABLE), osrm)).status).toBe(400);
  });

  it("rend un 503 net quand le binding manque", async () => {
    const response = await bridgeToOsrm(new Request(TABLE), undefined);

    expect(response.status).toBe(503);
    expect(await response.text()).toMatch(/vol d'oiseau/);
  });

  it("rend un 503 net quand le binding lève", async () => {
    const response = await bridgeToOsrm(new Request(TABLE), new BrokenOsrm());

    expect(response.status).toBe(503);
    expect(await response.text()).toMatch(/Network connection lost/);
  });
});

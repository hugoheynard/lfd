import { FixedIdGenerator } from "../../../../platform/id/fixed-id-generator.js";
import { FixedClock } from "../../../../platform/time/fixed-clock.js";
import { SYSTEM_PAY_LINK_AUTHOR } from "../../../channels/requests/pay-links.js";
import { RegisteredLinkableSubjects } from "../../../channels/subjects/linkable-subjects.js";
import {
  InvalidPayLinkError,
  PayLinkOriginWithoutRootError,
  SubjectNotLinkableError,
  UnknownPayLinkOriginError,
} from "../../domain/errors/pay-link-errors.js";
import { PayLink } from "../../domain/entities/pay-link.js";
import { BlockPayLinks } from "../block-pay-links.js";
import {
  FixedOrigins,
  InMemoryPayLinks,
  LFC_ORIGIN,
  ScriptedLinkable,
  SequentialTokens,
  TransparentVault,
} from "./pay-link-doubles.js";

const SUBJECT = { type: "free_charge", id: "fc_1" };
const REQUEST = {
  origin: "lafoliecoffee",
  payerLabel: "Café des Arts",
  by: SYSTEM_PAY_LINK_AUTHOR,
  byLabel: null,
};

function scene(origins = new FixedOrigins([LFC_ORIGIN])) {
  const links = new InMemoryPayLinks();
  const port = new BlockPayLinks(
    links,
    origins,
    new RegisteredLinkableSubjects([new ScriptedLinkable("free_charge")]),
    new SequentialTokens(),
    new TransparentVault(),
    new FixedIdGenerator("pl"),
    new FixedClock(new Date(0)),
  );
  return { links, port };
}

describe("BlockPayLinks", () => {
  it("ouvre un lien sous la racine de son origine, jeton jamais rangé en clair", async () => {
    const { links, port } = scene();
    const opened = await port.open(SUBJECT, REQUEST);
    expect(opened).toEqual({ linkId: "pl_000001", url: "https://app.lfc.test/payer/tok_1" });
    const row = links.rows.get("pl_000001")?.toPersistence();
    expect(row).toMatchObject({ tokenHash: "hash:tok_1", tokenSealed: "sealed:tok_1" });
  });

  it("rend le lien vivant d'un sujet qui en a déjà un, avec le même jeton", async () => {
    const { links, port } = scene();
    const first = await port.open(SUBJECT, REQUEST);
    const second = await port.open(SUBJECT, { ...REQUEST, by: "staff_2" });
    expect(second).toEqual(first);
    expect(links.rows.size).toBe(1);
  });

  it("refuse une origine hors du registre", async () => {
    const { port } = scene();
    await expect(port.open(SUBJECT, { ...REQUEST, origin: "ailleurs" })).rejects.toBeInstanceOf(
      UnknownPayLinkOriginError,
    );
  });

  it("refuse sans racine configurée, sans rien écrire", async () => {
    const { links, port } = scene(new FixedOrigins([{ ...LFC_ORIGIN, publicRoot: null }]));
    await expect(port.open(SUBJECT, REQUEST)).rejects.toBeInstanceOf(PayLinkOriginWithoutRootError);
    expect(links.rows.size).toBe(0);
  });

  it("refuse un sujet qu'aucun bloc ne rend payable par lien", async () => {
    const { port } = scene();
    await expect(port.open({ type: "order", id: "o_1" }, REQUEST)).rejects.toBeInstanceOf(
      SubjectNotLinkableError,
    );
  });

  it("révoque le lien vivant, puis en ouvre un neuf sur un autre jeton", async () => {
    const { port } = scene();
    await port.open(SUBJECT, REQUEST);
    expect(await port.revoke(SUBJECT, "réglé ailleurs")).toBe(true);
    expect(await port.urlOf(SUBJECT)).toBeNull();
    const reopened = await port.open(SUBJECT, REQUEST);
    expect(reopened.url).toBe("https://app.lfc.test/payer/tok_2");
  });

  it("ne révoque rien sur un sujet sans lien vivant", async () => {
    const { port } = scene();
    expect(await port.revoke(SUBJECT, "réglé")).toBe(false);
  });

  it("refuse une révocation sans motif", async () => {
    const { port } = scene();
    await port.open(SUBJECT, REQUEST);
    await expect(port.revoke(SUBJECT, " ")).rejects.toBeInstanceOf(InvalidPayLinkError);
  });

  it("recopie l'adresse du lien vivant", async () => {
    const { port } = scene();
    const opened = await port.open(SUBJECT, REQUEST);
    expect(await port.urlOf(SUBJECT)).toBe(opened.url);
  });
});

describe("BlockPayLinks.urlsOf — la page de liste", () => {
  it("rend l'adresse des seuls liens vivants, en une lecture", async () => {
    const { port } = scene();
    await port.open(SUBJECT, REQUEST);
    const revoked = { type: "free_charge", id: "fc_2" };
    await port.open(revoked, REQUEST);
    await port.revoke(revoked, "cancelled");
    const urls = await port.urlsOf([SUBJECT, revoked, { type: "free_charge", id: "fc_x" }]);
    expect(urls).toEqual([{ subject: SUBJECT, url: "https://app.lfc.test/payer/tok_1" }]);
  });

  it("une adresse qui ne se compose pas laisse sa ligne de côté, sans faire tomber les autres", async () => {
    const { links, port } = scene(
      new FixedOrigins([LFC_ORIGIN, { ...LFC_ORIGIN, name: "sans_racine", publicRoot: null }]),
    );
    await port.open(SUBJECT, REQUEST);
    await links.addIfAbsent(
      PayLink.open({
        id: "pl_orphan",
        subjectType: "free_charge",
        subjectId: "fc_9",
        origin: "sans_racine",
        payerLabel: "X",
        tokenHash: "hash:tok_9",
        tokenSealed: "sealed:tok_9",
        at: new Date(0),
        by: SYSTEM_PAY_LINK_AUTHOR,
        byLabel: null,
      }),
    );
    const urls = await port.urlsOf([SUBJECT, { type: "free_charge", id: "fc_9" }]);
    expect(urls.map((entry) => entry.subject.id)).toEqual(["fc_1"]);
  });

  it("une liste vide ne lit rien", async () => {
    const { port } = scene();
    expect(await port.urlsOf([])).toEqual([]);
  });
});

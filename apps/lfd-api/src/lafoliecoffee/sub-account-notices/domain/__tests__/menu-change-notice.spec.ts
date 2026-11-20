import type { SiteGestureStamp } from "../../../account/domain/events/site-gesture.fact.js";
import { MENU_CHANGE_NOTIFIED_ROLES, menuChangeNoticeTarget } from "../menu-change-notice.js";

const STAMP: SiteGestureStamp = {
  siteCompanyId: "chalet",
  siteName: "Chalet",
  principalCompanyId: "alpes",
  authorUserId: null,
  byTeam: true,
};

describe("menuChangeNoticeTarget — qui prévenir d'une carte posée (Q3)", () => {
  it("le principal figé, quand l'équipe l'a posée", () => {
    expect(menuChangeNoticeTarget(STAMP)).toBe("alpes");
  });

  it("personne quand le principal l'a posée lui-même", () => {
    expect(menuChangeNoticeTarget({ ...STAMP, byTeam: false, authorUserId: "u1" })).toBeNull();
  });

  it("personne quand le site n'avait pas de principal", () => {
    expect(menuChangeNoticeTarget({ ...STAMP, principalCompanyId: null })).toBeNull();
  });

  it("ceux qui peuvent régler la carte : propriétaire et administrateur", () => {
    expect(MENU_CHANGE_NOTIFIED_ROLES).toEqual(["owner", "admin"]);
  });
});

# Les droits de la livraison

> Sous-dossier de [`livraisons/`](../README.md), rangé le 2026-10-07 (Hugo).
> Les états ci-dessous sont ceux que chaque document déclare en tête.

Les droits par geste, la feuille de réglage des rôles, et le droit des procédures de livraison.

| Doc                                                          | État et sujet                                                                                                                                                                            |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`plan-droits-par-geste.md`](plan-droits-par-geste.md)       | ✅ DG0–DG7 bâtis — Des droits par geste, et des rôles réglés à l'écran (`/admin/roles`) ; l'arrêt du plan sous `production_count_stop` ; les écarts écran ↔ API relevés le 2026-10-07.   |
| [`tableau-droits-livraison.md`](tableau-droits-livraison.md) | 🔁 feuille de réglage — Les droits de la livraison et du colisage, rôles × ressources, à appliquer à l'écran ; le coliseur lit les formats de bac par `production_packing` (2026-10-07). |

## Ce qui fait foi

- **Qui peut quoi, aujourd'hui** : `tableau-droits-livraison.md`, la feuille
  de réglage à appliquer à l'écran (`/admin/roles`) ; une migration n'accorde
  jamais un droit à un rôle.
- **Un livreur tient deux droits** : conduire sa tournée et les gestes à la
  porte. L'affectation et le départ les exigent tous les deux (2026-10-07).
- **La base de dev** se remet sur la graine des rôles par
  `pnpm --filter lfd-api db:seed:roles`, à la main.
- `plan-droits-par-geste.md` garde l'histoire de la bascule ; le plan du
  seul droit des procédures, qu'il remplaçait, est supprimé le 2026-10-07
  (dans l'historique git).

Les autres thèmes du dossier, et les documents qui touchent la livraison sans
en être le sujet, sont listés dans l'[index du dossier](../README.md).

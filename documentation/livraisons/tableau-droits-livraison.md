# Les droits de la livraison et du colisage — tableau de refonte

> 🔁 **Devenu une feuille de réglage** (2026-10-01) : le plan
> [`plan-droits-par-geste.md`](plan-droits-par-geste.md) est bâti ; ce tableau
> est à **appliquer à l'écran** (`/admin/roles`, servi par la route d'API
> `admin/staff-roles`), pas par migration.
> Ligne ajoutée depuis : `delivery_doorstep` (les gestes à la porte) —
> livreur et admin en **écriture**, **à accorder à l'écran aux deux**. La
> graine du contrat (`staff-access.ts`) la donne bien à l'admin, mais elle
> n'est pas lue au runtime et ne sème que la base des e2e : l'admin d'une
> base EXISTANTE — production, dev — n'a `delivery_doorstep` que si on la
> lui accorde à l'écran, comme `delivery_driving`. C'est vrai de **toute
> ressource neuve** tant que l'admin n'est pas calculé
> (`plan-droits-par-geste.md` § 5.4) : seule la fiche racine résout tout
> d'office.
>
> 2026-10-02 : la décision réglée d'avance à la porte, réglage **global**
> (`admin/livraison/a-la-porte`), passe de `delivery_settings` à
> `delivery_procedures` — une condition de livraison, réglée par le
> commercial (`a-la-porte.md`, B3 bis).
>
> 2026-10-02 : **`delivery_decisions`** (« Décider à la porte ») — « À
> décider » (liste et photo du signalement en lecture, autoriser / rapporter
> en écriture) et l'audience de la notification « arrêt à décider »
> (`delivery_decisions:write`) quittent `b2b_companies:write`. Le réglage
> global de la porte reste sous `delivery_procedures`. Admin et commercial en
> **écriture** — voir « Au déploiement ».
>
> 2026-10-02 : **`delivery_proofs`** (« Preuves de livraison ») — les trois
> routes `GET admin/orders/:id/preuve-livraison(/photo|/signature)` et la
> carte de la fiche commande quittent `b2b_orders:read`. Admin et commercial
> en **lecture** ; l'écriture n'ouvre rien aujourd'hui.
>
> 2026-10-07 : **relu contre le code** (audit du dossier `livraisons/`) — le
> colisage garde les formats de bac sans droit de livraison (§ 1), le retrait
> est sous `handover_counter` (§ 3), la bascule est décrite telle que sa
> migration l'écrit (§ 4), et la graine ne sème que les e2e.

> 📐 **Proposition** (2026-10-01) — _voir le bandeau ci-dessus_. Point de départ du plan de
> refonte des droits, à faire contredire par `vitruve` avant de bâtir.
>
> Hugo : « comptoir ne gère plus les livraisons vu qu'on a delivery » ; « le
> livreur charge sa tournée » ; « il nous faut un droit packing_order séparé » ;
> procédures : « c'est commercial qui fait les write, seulement commercial ».
>
> Droits actuels relevés dans `ROLE_GRANTS`
> (`packages/contracts/src/staff-access.ts`) le 2026-10-01. Rappel : en
> production, c'est `staff_role_definitions` qui fait foi.

## Lecture

- **écrit** emporte la lecture.
- `actuel → proposé` quand le droit change ; une seule valeur quand il ne
  change pas.
- **neuf** : la ressource n'existe pas encore.

## 1. La livraison et le colisage

| Rôle             | Feuille de route<br/>`delivery_run_sheet` | Réglages livraison<br/>`delivery_settings` | Composer les tournées<br/>`delivery_rounds` | Charger (dépôt)<br/>`delivery_loading` | Conduire sa tournée<br/>`delivery_driving` | Coliser (**neuf**)<br/>`production_packing` | Procédures (**neuf**)<br/>`delivery_procedures` |
| ---------------- | ----------------------------------------- | ------------------------------------------ | ------------------------------------------- | -------------------------------------- | ------------------------------------------ | ------------------------------------------- | ----------------------------------------------- |
| **admin**        | écrit                                     | écrit                                      | écrit                                       | écrit                                  | écrit                                      | **écrit**                                   | **écrit**                                       |
| **commercial**   | lit                                       | —                                          | —                                           | —                                      | —                                          | —                                           | **écrit** _(avant : par `b2b_companies`)_       |
| **comptoir**     | lit → **—**                               | lit → **—**                                | écrit → **—**                               | écrit → **—**                          | —                                          | **écrit**                                   | —                                               |
| **livreur**      | —                                         | —                                          | —                                           | —                                      | écrit, **+ charger SA tournée**            | —                                           | — _(ses arrêts, par sa route)_                  |
| **support**      | lit _(procédure **masquée**)_             | —                                          | —                                           | —                                      | —                                          | —                                           | lit → **—** _(perdu avec `b2b_companies`)_      |
| **comptabilité** | —                                         | —                                          | —                                           | —                                      | —                                          | —                                           | lit → **—** _(perdu avec `b2b_companies`)_      |
| communication    | —                                         | —                                          | —                                           | —                                      | —                                          | —                                           | —                                               |
| dev              | —                                         | —                                          | —                                           | —                                      | —                                          | —                                           | —                                               |

Le comptoir sans `delivery_settings` ni `delivery_rounds` garde « + Nouveau
bac » au colisage : le poste charge les formats de bac par
`GET admin/livraison/bacs` (`packing-container-board.ts:382`), qui accepte
`production_packing:write` depuis le 2026-10-07, en plus des deux droits de
livraison (audit du dossier, B4). L'écriture et pas la lecture : le poste ne
lit les formats que pour déclarer un bac neuf, et ce bouton n'existe qu'avec
`production_packing:write` — la porte du panneau « Bacs »
(`plan-droits-par-geste.md` § 5.3), qui laisse dehors le support, lecteur du
colisage. Avant, cette ligne cassait le poste : 403 sur les formats, donc plus
de bac neuf. Elle tient désormais telle quelle.

**Cette feuille fait foi** pour la colonne Procédures.
`plan-droit-procedures.md` (DP-D2) y donnait la lecture au comptoir ; ce plan
est remplacé (voir son bandeau) par `plan-droits-par-geste.md`, dont la
feuille de réglage vise « procédures à l'admin et au commercial » (DG-D7) : le
comptoir n'y a rien.

## 2. Le commerce, pour mémoire (inchangé)

| Rôle               | Commandes<br/>`b2b_orders` | Comptoir<br/>`b2b_counter` | Comptes clients<br/>`b2b_companies` |
| ------------------ | -------------------------- | -------------------------- | ----------------------------------- |
| **admin**          | écrit                      | écrit                      | écrit                               |
| **commercial**     | écrit                      | lit                        | écrit                               |
| **comptoir**       | écrit                      | lit                        | —                                   |
| **comptabilité**   | écrit                      | lit                        | lit                                 |
| **support**        | lit                        | —                          | lit                                 |
| communication, dev | —                          | —                          | —                                   |

## 3. Ce que le tableau suppose

| #   | Choix                                                                                                                                                         | Conséquence à valider                                                                  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 1   | Le livreur **charge sa tournée** par son propre droit (`delivery_driving`), cloisonné comme « Ma tournée »                                                    | `delivery_loading` (le dépôt de **toutes** les tournées) reste à l'**admin seul**      |
| 2   | **Composer les tournées et affecter les livreurs** : l'admin seul                                                                                             | plus personne d'autre ne compose                                                       |
| 3   | Le **poste de colisage** s'ouvre avec `production_packing` au lieu de `b2b_orders:write` ; le panneau « Bacs » aussi, **en plus** de `delivery_loading:write` | le **commercial** et la **comptabilité**, qui ont `b2b_orders:write`, ne colisent plus |
| 4   | Le **comptoir garde `b2b_orders:write`** ; le retrait au comptoir est sous `handover_counter` (DG3), reçu à la bascule avec `production_packing`              | il colise, il ne touche plus à la livraison — « + Nouveau bac » compris (§ 1)          |
| 5   | La **feuille de route** n'est plus lue que par l'admin, le commercial et le support                                                                           | la procédure y est **masquée** pour qui n'a pas `delivery_procedures` (le support)     |
| 6   | **Procédures** : écrites par l'admin et le commercial, lues par personne d'autre côté staff                                                                   | le livreur voit celles de ses arrêts, par sa route murée                               |

_Corrigé le 2026-10-07._ Ligne 3 : la garde du panneau est un **ou**
(`delivery-bins.controller.ts:70`) — une porte élargie, aucun droit déplacé.
Ligne 4 : le retrait au comptoir passait par `b2b_orders:write` jusqu'à DG3 ;
il est sous `handover_counter` depuis (`handover.controller.ts:64`).

## 4. Ce qui accompagne la migration

_Réécrit le 2026-10-07 d'après la bascule telle que sa migration l'écrit
(`20261001130200_la_bascule_des_droits_par_geste/migration.sql`) : la
proposition du 2026-10-01 disait autre chose sur les trois premiers points._

- **Les dérogations se recopient une pour une**, `allow` comme `deny`, de la
  ressource reprise vers celles qui la reprennent : `b2b_companies` →
  `delivery_procedures`, et `b2b_orders` → les cinq gestes qui en sortent
  (plan, fiche, colisage, retrait, passation — pour la passation, un `allow`
  seulement s'il porte sur l'écriture, un `deny` quelle que soit son action).
  Une interdiction ne cesse pas de jouer parce qu'un droit change de nom.
  **`delivery_loading` n'est la source de rien** (commentaire l. 24-26 de la
  migration ; e2e `gesture-rights-switchover.e2e-spec.ts:264`) : le panneau
  « Bacs » s'ouvre à l'un **ou** l'autre droit par sa garde de route.
- **Les rôles créés à l'écran sont couverts** : la bascule se calcule depuis
  l'état de la base, rôles archivés compris (l. 28-30 ; le SQL ne filtre pas
  `archived_at`). Un rôle qui tenait `b2b_orders` en reçoit le plan, la fiche,
  le colisage et le retrait au même niveau — et la passation s'il
  l'écrivait. Éprouvé pour un rôle créé à l'écran et pour les deux effets de
  dérogation (même e2e, l. 138, 211, 242) ; aucun e2e ne sème de rôle
  archivé.
- **Neuf valeurs d'enum**, ajoutées par des migrations qui ne font que ça
  (Postgres ne les retire plus jamais) : six dans
  `20261001130100_les_droits_par_geste` (`b2b_place_order`,
  `production_plan`, `production_worksheet`, `production_packing`,
  `handover_counter`, `delivery_procedures`), puis `delivery_doorstep`
  (`20261001140000`), `delivery_decisions` (`20261002090000`) et
  `delivery_proofs` (`20261002090100`).
- **Cache des droits** : 30 s, en mémoire, **par processus**
  (`prisma-staff-access.resolver.ts:22`). Un processus qui démarre part à
  vide ; un rôle ou une dérogation changés à l'écran vident le cache du seul
  processus qui a servi la modification — les autres peuvent servir l'ancien
  droit jusqu'à 30 s. Côté écran, un onglet ouvert garde ses droits jusqu'au
  rechargement de la page (`permissions.store.ts` lit `/admin/me` une fois).
  Ce n'est pas une panne.

## 5. Ajouté le 2026-10-01 — passer une commande pour un client pro

| Rôle                                 | Passer pour un client (**neuf**)<br/>`b2b_place_order` |
| ------------------------------------ | ------------------------------------------------------ |
| **admin**                            | écrit                                                  |
| **commercial**                       | **écrit**                                              |
| **comptoir**                         | **écrit**                                              |
| comptabilité                         | — _(la reçoit à la bascule, à retirer à l'écran)_      |
| support, communication, dev, livreur | —                                                      |

> Ce tableau est désormais une **feuille de réglage** à appliquer à l'écran
> (`/admin/roles`) après la bascule de
> [`plan-droits-par-geste.md`](plan-droits-par-geste.md) — plus un contenu de
> migration.

## Au déploiement — `delivery_decisions` et `delivery_proofs` (2026-10-02)

Les deux migrations (`20261002090000`, `20261002090100`) n'ajoutent que les
valeurs d'enum : **aucun rôle ne les reçoit en base**
(`lint:no-role-grants-in-migrations`). `ROLE_GRANTS` ne les donne qu'à la
base des e2e : il ne sème pas le dev (relevé le 2026-10-07 ; semer le dev ou
non reste à trancher, audit du dossier, Q4). En dev comme en production,
seul l'écran les accorde.

**AVANT que quiconque en ait besoin**, accorder à l'écran (`/admin/roles`) :

| Rôle           | `delivery_decisions` | `delivery_proofs` |
| -------------- | -------------------- | ----------------- |
| **admin**      | écrit                | lit               |
| **commercial** | écrit                | lit               |

Sans ce geste, au déploiement, **le commercial perd « À décider »** (liste,
réponses et notification) et la carte « Preuve de livraison » disparaît de
la fiche commande pour lui. L'admin d'une base existante est dans le même
cas tant que son rôle ne porte pas les deux valeurs.

⚠️ Ordre : la valeur d'enum n'existe qu'après la migration — l'écran ne la
propose qu'une fois le déploiement fait. Le geste se fait donc **juste après**
la mise en ligne, dans la même fenêtre ; pendant cet intervalle, une
décision à la porte attend sans être notifiée à personne.

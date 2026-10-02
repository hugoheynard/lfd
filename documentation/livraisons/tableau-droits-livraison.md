# Les droits de la livraison et du colisage — tableau de refonte

> 🔁 **Devenu une feuille de réglage** (2026-10-01) : le plan
> [`plan-droits-par-geste.md`](plan-droits-par-geste.md) est bâti ; ce tableau
> est à **appliquer à l'écran** (`/admin/staff-roles`), pas par migration.
> Ligne ajoutée depuis : `delivery_doorstep` (les gestes à la porte) —
> livreur et admin en **écriture** ; l'admin l'a dans la graine du contrat
> (`staff-access.ts`), celle du livreur se règle à l'écran, comme
> `delivery_driving`.
>
> 2026-10-02 : la décision réglée d'avance à la porte, réglage **global**
> (`admin/livraison/a-la-porte`), passe de `delivery_settings` à
> `delivery_procedures` — une condition de livraison, réglée par le
> commercial (`plan-a-la-porte.md`, B3 bis).
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

| #   | Choix                                                                                                                                                     | Conséquence à valider                                                                  |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 1   | Le livreur **charge sa tournée** par son propre droit (`delivery_driving`), cloisonné comme « Ma tournée »                                                | `delivery_loading` (le dépôt de **toutes** les tournées) reste à l'**admin seul**      |
| 2   | **Composer les tournées et affecter les livreurs** : l'admin seul                                                                                         | plus personne d'autre ne compose                                                       |
| 3   | Le **poste de colisage** s'ouvre avec `production_packing` au lieu de `b2b_orders:write` ; le panneau « Bacs » aussi, au lieu de `delivery_loading:write` | le **commercial** et la **comptabilité**, qui ont `b2b_orders:write`, ne colisent plus |
| 4   | Le **comptoir garde `b2b_orders:write`** (le retrait au comptoir) et reçoit `production_packing`                                                          | il colise, il ne touche plus à la livraison                                            |
| 5   | La **feuille de route** n'est plus lue que par l'admin, le commercial et le support                                                                       | la procédure y est **masquée** pour qui n'a pas `delivery_procedures` (le support)     |
| 6   | **Procédures** : écrites par l'admin et le commercial, lues par personne d'autre côté staff                                                               | le livreur voit celles de ses arrêts, par sa route murée                               |

## 4. Ce qui accompagne la migration

- **Les dérogations qui retirent** aujourd'hui `b2b_companies` ou
  `delivery_loading` à quelqu'un sont **recopiées** sur le droit qui le
  remplace (`delivery_procedures`, `production_packing`) : une interdiction ne
  doit pas cesser de jouer parce qu'un droit change de nom.
- **Les rôles créés à l'écran** et les **dérogations qui accordent** ne
  reçoivent rien automatiquement : relevé en production avant la mise en
  ligne, décision au cas par cas.
- **Deux valeurs d'enum** (`production_packing`, `delivery_procedures`) dans
  leur migration seule : Postgres ne les retire plus jamais.
- **Cache des droits** : jusqu'à 30 s après la mise en ligne, un refus peut
  encore tomber sur l'ancien droit. Ce n'est pas une panne.

## 5. Ajouté le 2026-10-01 — passer une commande pour un client pro

| Rôle                                 | Passer pour un client (**neuf**)<br/>`b2b_place_order` |
| ------------------------------------ | ------------------------------------------------------ |
| **admin**                            | écrit                                                  |
| **commercial**                       | **écrit**                                              |
| **comptoir**                         | **écrit**                                              |
| comptabilité                         | — _(la reçoit à la bascule, à retirer à l'écran)_      |
| support, communication, dev, livreur | —                                                      |

> Ce tableau est désormais une **feuille de réglage** à appliquer à l'écran
> (`/admin/staff-roles`) après la bascule de
> [`plan-droits-par-geste.md`](plan-droits-par-geste.md) — plus un contenu de
> migration.

## Au déploiement — `delivery_decisions` et `delivery_proofs` (2026-10-02)

Les deux migrations (`20261002090000`, `20261002090100`) n'ajoutent que les
valeurs d'enum : **aucun rôle ne les reçoit en base**
(`lint:no-role-grants-in-migrations`). `ROLE_GRANTS` ne les donne qu'à une
base vierge, au dev et aux e2e.

**AVANT que quiconque en ait besoin**, accorder à l'écran
(`/admin/staff-roles`) :

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

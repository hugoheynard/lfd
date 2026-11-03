# Une société suspendue commande au prix pro, réglée par carte

> 📝 Plan du 2026-11-03, doc-first : rien n'est bâti. Hugo : « on va rester
> simple et passer les sociétés suspendues au prix pro » ; « première option
> [son tarif à elle : mercuriale, paliers, promotions pros] mais règlement
> carte pour suspendue ». Revient sur la décision du lot P0
> ([`plan-pros-en-cours-d-inscription.md`](plan-pros-en-cours-d-inscription.md) § 4, Q9 :
> « suspendue → public, le moins coûteux à se tromper »). Touche l'argent et
> l'audience : contredit par `vitruve` avant Hugo.

## 1. La règle

**La suspension ne joue plus sur le prix, seulement sur le crédit.**

| Statut       | Prix                                                   | Règlement                                                                                                                             |
| ------------ | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `active`     | pro (son tarif : mercuriale, paliers, promotions pros) | au compte si accordé, sinon immédiat                                                                                                  |
| `pending`    | pro (inchangé)                                         | inchangé                                                                                                                              |
| `suspended`  | **pro, son tarif à elle** (était : public)             | **immédiat seulement** : carte dans son espace ; lien dans la saisie de l'équipe hors comptoir ; refusé au comptoir (pas de lien, E4) |
| `terminated` | fermée (inchangé)                                      | —                                                                                                                                     |

## 2. Où ça se décide (vérifié le 2026-11-03)

- **Le prix** : une seule règle pure, `companyServiceOf`
  (`apps/lfd-api/src/b2b/catalog/domain/company-service.ts`) — « LA décision
  pro ou pas », prise une fois sur le statut relu en base. `suspended` passe
  de `public` à `pro`. Lecteurs : `catalog-viewers.service.ts`,
  `promotions/domain/promotion-targeting.ts`,
  `promotions/domain/pickup-discount-announcement.ts`. À vérifier au bâti (et
  par `vitruve`) : qu'AUCUN autre chemin ne déduit l'audience du statut à sa
  façon (`CustomerAudiences` des commandes, `promotion-meeting.ts`,
  `order-settlement.ts`) — sinon c'est une seconde règle à aligner ou à
  supprimer.
- **Le règlement** : déjà tenu. Dans son espace, carte seule (P0) ; dans la
  saisie, L1c refuse le compte (`staff-settlement-refusal.ts`) ; au comptoir,
  la cause « compte suspendu » (L1c, et le correctif du lien).

## 3. Ce qui change avec

- **Les messages de L1c** disent « il ne peut commander qu'au prix public » :
  ils deviennent faux. Nouveau texte, vrai : « Le compte de ce client est
  suspendu : il commande à son tarif, mais réglé immédiatement — pas au
  compte. »
- **Les textes de la boutique** qui annoncent le prix public à une société
  suspendue (`shop-copy`, à chercher) : réécrits, puis `pnpm copy:digest`.
- **La limite d'É13** (une ligne ajoutée en révision se tarife au statut du
  jour) disparaît pour la suspension : le prix ne dépend plus d'elle.
- **Le golden master** (`plan-un-seul-assemblage.md` §3) : seules les entrées
  d'une société suspendue changent (prix pro au lieu de public), chacune
  justifiée par cette décision.
- **`test/served-company-status.e2e-spec.ts`** (lot P0) : le cas « société
  suspendue — public, carte seule » devient « pro, carte seule », avec un
  commentaire daté qui cite cette décision.

## 4. Le lot

**S1** — la règle (`companyServiceOf`) et tout lecteur parallèle trouvé au §2 ;
les messages et textes du §3 ; les tests (P0, golden master) ; la doc P0
annotée (la décision Q9 est révisée, datée). Après T2/T3 du plan du total vu,
ou avant sur décision de Hugo.

## 5. Après `vitruve`, décisions de Hugo (2026-11-03)

`vitruve` : une SECONDE règle « qui est pro » existe, `audienceOf`
(`packages/contracts/src/customer-audience.ts`, `active` → `b2b`, le reste →
`b2c`), qui décide de la clientèle — remise de retrait, frais, CGV, annonce de
la boutique (`pickupAnnouncementOf`, `servedAsPro`). Ne changer que
`companyServiceOf` donnerait le prix pro avec les CGV et la remise des
particuliers, et une boutique qui annonce le prix boutique.

**Tranché : une société suspendue est traitée exactement comme une société
active, pour TOUT, sauf le crédit.** Les deux règles (`companyServiceOf` et
`audienceOf`) disent pro ; les cibles de promotions qui admettent l'actif
admettent la suspendue ; seul le règlement change (immédiat seulement).
Changement de `@lfd/contracts` : `pnpm test` à la racine.

Et :

1. **P1 est abandonné pour la suspension** : plus de choix du tarif au geste
   de suspension, la colonne `suspended_pricing` ne sera pas créée. Une
   suspension ne touche plus au prix (fraude, abus de tarif compris).
2. **Le refus du règlement au compte lit le statut du PAYEUR**, plus seulement
   celui de la société qui commande : un site actif dont le principal payeur
   est suspendu ne règle plus au compte (défaut antérieur, corrigé dans S1).
3. **Les commandes passées pendant la suspension gardent leur prix figé** ;
   en révision, les lignes gardées restent au prix figé, les lignes ajoutées
   suivent le tarif du jour (pro). Accepté.

À noter : les abonnements ne génèrent pas encore de commande ; le jour où ils
le feront, ils suivront la même règle.

# Retirer l'ancien champ `slots` des consignes de livraison

> 📐 **Plan v2, validé par Hugo le 2026-10-07, en construction** (2026-10-07, demandé par Hugo : « fais les slots »).
> Migration de données : contredit par `vitruve` le 2026-10-07 — trois
> bloquants (une adresse non convertie illisible, des lecteurs qui perdent la
> note et le GPS en silence, un contrat d'écriture qui refuserait l'ancien
> front) et quatre sérieux, tous corrigés dans cette v2 (§ 5).

## 1. L'état (vérifié le 2026-10-07)

- Les créneaux d'une adresse vivent dans `addresses.delivery_specs` (`jsonb`,
  `account.prisma:534`), sous deux clés :
  - `slots` — l'ancienne forme, **un** créneau : `{ mode: "everyday", slot }`
    ou `{ mode: "perDay", byDay: { mon: slot | null, … } }`, `slot` étant
    `{ start, end } | null` ;
  - `slotList` — la forme de CA3b, **une liste** : `{ mode: "everyday", slots: [] }`
    ou `{ mode: "perDay", byDay: { mon: [] | null, … } }`. Facultative et
    nullable dans le contrat (`packages/contracts/src/address.ts:260`).
- `slots` est **obligatoire** dans le contrat (`address.ts:219`).
- Depuis CA3b, le serveur **dérive** `slots` de `slotList` à chaque écriture
  qui porte une liste (`withSlotList`,
  `b2b/account/domain/services/delivery-slot-list.ts`). Une écriture sans
  `slotList` (ancien front) garde la liste rangée.
- **Les lecteurs** passent par `slotsFor` (`packages/contracts/src/preferred-slots.ts`) :
  `slotList` si elle existe, sinon `slots` lu comme une liste d'un élément.
  Deux lecteurs refont ce repli à la main : la boutique
  (`apps/lfc-ecommerce-frontend/src/app/client/shop/delivery-window.ts:50`,
  `bookSlotsOfDay`) et le modèle « legacy » du profil
  (`apps/lfc-ecommerce-frontend/src/app/legacy/data/profil.model.ts:104-220`).
  Le formulaire du back-office lit le `mode` de `slotList ?? slots`
  (`packages/b2b-ui/src/company/delivery-draft.model.ts:187`,
  `delivery-format.ts:91`).
- **Base locale** : 44 adresses avec consignes, **44 sans `slotList`**
  (toutes semées avant CA3b, `src/dev/seeding/*` écrit encore `slots`), aucune
  en `perDay`. La production n'a pas été comptée.
- Aucune autre colonne ne copie `slots` : `orders.delivery_address_snapshot`
  n'en porte aucun en base locale (0 ligne).

**Conséquence** : on ne peut pas retirer `slots` du code tant qu'une adresse
n'a que lui. Le retrait commence donc par **donner une liste à chaque
adresse**.

## 2. Le plan — un déploiement, pré-release

Hugo a levé le 2026-10-04 l'obligation « étendre, basculer, resserrer » pour
le code et les contrats (CLAUDE.md § 0) ; **pas** pour les données : la clé
`slots` reste en base (« une colonne morte reste en base »).

### S1 — La migration : une liste pour chaque adresse qui n'en a pas

```sql
-- Dérive slotList de slots, à l'identique de ce que slotsFor lit aujourd'hui.
UPDATE addresses
SET delivery_specs = jsonb_set(
  delivery_specs,
  '{slotList}',
  CASE delivery_specs->'slots'->>'mode'
    WHEN 'everyday' THEN jsonb_build_object(
      'mode', 'everyday',
      'slots', CASE WHEN jsonb_typeof(delivery_specs->'slots'->'slot') = 'object'
                    THEN jsonb_build_array(delivery_specs->'slots'->'slot')
                    ELSE '[]'::jsonb END)
    WHEN 'perDay' THEN jsonb_build_object(
      'mode', 'perDay',
      'byDay', (SELECT jsonb_object_agg(d.key,
                  CASE WHEN jsonb_typeof(d.value) = 'object'
                       THEN jsonb_build_array(d.value) ELSE 'null'::jsonb END)
                FROM jsonb_each(delivery_specs->'slots'->'byDay') AS d))
  END)
WHERE delivery_specs IS NOT NULL
  AND delivery_specs ? 'slots'
  AND (NOT delivery_specs ? 'slotList' OR jsonb_typeof(delivery_specs->'slotList') = 'null')
  AND delivery_specs->'slots'->>'mode' IN ('everyday', 'perDay');
```

- **Équivalence** : `slotsFor` lit un `slot` nul comme `[]`, et un jour
  `perDay` nul comme `[]` (`?? []`). La liste dérivée rend donc, jour par
  jour, exactement ce que les lecteurs lisent aujourd'hui.
- **Ne touche pas** une adresse qui a déjà sa liste (écrite depuis CA3b) : la
  liste fait foi, `slots` n'en est que le reflet.
- **Additive** : n'efface rien, `slots` reste en base. Retour arrière : rien à
  défaire pour l'ancien code, qui lit `slotList` en premier et trouve
  l'équivalent de ce qu'il lisait.
- **La migration refuse de se terminer s'il reste une adresse sans liste**
  (bloquant 1 de `vitruve`). Juste après l'`UPDATE`, dans le même fichier :

  ```sql
  DO $$
  DECLARE left_over integer;
  BEGIN
    SELECT count(*) INTO left_over FROM addresses
    WHERE jsonb_typeof(delivery_specs) = 'object'
      AND (NOT delivery_specs ? 'slotList' OR jsonb_typeof(delivery_specs->'slotList') <> 'object');
    IF left_over > 0 THEN
      RAISE EXCEPTION '% adresse(s) gardent des consignes sans liste de créneaux : forme inconnue, à corriger avant de déployer', left_over;
    END IF;
  END $$;
  ```

  Une forme que S1 ne sait pas convertir fait donc échouer le **déploiement**,
  avant qu'un seul lecteur ne la rencontre — au lieu de mettre en 500 tout le
  carnet de la société (lecture en `parse` strict,
  `prisma-company-address.repository.ts:102`, `prisma-company-address.reader.ts:122`)
  ou de faire perdre au livreur la note, le GPS et le temps sur place (lecture
  en `safeParse` qui retombe sur ses défauts : `prisma-delivery-orders.reader.ts:220`,
  `delivery-run-sheet.query.ts:133`, `prisma-delivery-defaults.reader.ts:45`,
  `prisma-delivery-address-points.reader.ts:107`). Des consignes qui valent le
  `null` JSON (41 en base locale) ne sont pas des objets : ni converties, ni
  comptées.

### S2 — Le code ne lit et n'écrit plus que `slotList`

- **Deux schémas, pas un** (bloquant 3) : la **lecture** des consignes rangées
  exige `slotList` ; la **charge d'écriture** (`deliveryAddressFieldsSchema`)
  l'accepte absente. Une charge sans liste (un onglet resté sur l'ancien
  front) garde la liste rangée ; sans liste rangée (adresse neuve), elle
  prend la liste vide `{ mode: "everyday", slots: [] }`. `slots` est accepté
  dans la charge et ignoré.
- **`null` ne retire plus la liste** (sérieux 6) : « aucun créneau » s'écrit
  `{ mode: "everyday", slots: [] }`, et c'est ce que S1 écrit pour un `slot`
  nul. S1 remplace aussi un `slotList: null` explicite par la liste dérivée
  de `slots` — même lecture aujourd'hui.
- `slotsFor` ne lit que `slotList` ; `legacySlotsOf` disparaît ;
  `withSlotList` ne dérive plus `slots`.
- **Les écrivains et constantes** (sérieux 5) : `b2b-ui/…/delivery-draft.model.ts:308`
  (écrit `slots: legacySlotsOf(…)`), `NO_SPECS` du dépôt et du lecteur du
  carnet, `prisma/seed-growth/phase-activation.ts:208`, le service du profil
  de la boutique (`profil.service.ts:193,207`), les semis `src/dev/seeding/*`.
  La vue des clients du comptoir suit (`counter-customer.ts:56` réutilise le
  schéma).
- **Les lecteurs** : boutique (`bookSlotsOfDay`, modèle « legacy » du profil),
  formulaire du back-office (`slotList.mode`), et les quatre lecteurs serveur
  cités en S1.
- **Les tests** : 58 fichiers `.ts` portent un littéral `slots: { mode`
  (compté le 2026-10-07) ; les e2e qui sèment en Prisma direct
  (`delivery-routing-scene.ts:161`, `delivery-run-sheet.e2e-spec.ts:115`)
  sèment `slotList`, et ceux qui vérifient `slots` (`addresses.e2e-spec.ts:244`,
  `order-window-mode.e2e-spec.ts:259`) vérifient `slotList`.

### Le retour arrière (sérieux 4)

- **S1 seul** : rien à défaire, l'ancien code lit `slotList` d'abord.
- **Après S2** : revenir au code précédent n'est gratuit que **jusqu'à la
  première écriture d'adresse** en production. Une adresse réécrite par S2 n'a
  plus `slots`, que l'ancien code exige en `parse` strict : son carnet passe
  en 500. Pour revenir en arrière après une écriture, il faudrait d'abord
  recalculer `slots` depuis `slotList` en SQL (l'inverse de S1, le premier
  créneau de chaque jour).

### Ce qui reste après

La clé `slots` dort dans les `jsonb` déjà écrits. Une écriture neuve
réécrit le `jsonb` d'un bloc et ne la porte plus. Purger les anciennes est un
geste en production, sur ordre de Hugo seulement.

## 3. Contrôle avant promotion (pour le runbook)

La migration se garde elle-même (le `RAISE` de S1). À lancer en production
**avant** le déploiement, pour savoir s'il passera :

```sql
SELECT delivery_specs->'slots'->>'mode' AS mode, count(*) FROM addresses
WHERE jsonb_typeof(delivery_specs) = 'object'
  AND (NOT delivery_specs ? 'slotList' OR jsonb_typeof(delivery_specs->'slotList') <> 'object')
GROUP BY 1;
```

Seuls `everyday` et `perDay` sont convertis : toute autre ligne fera échouer
la migration.

## 4. Décisions d'Hugo (2026-10-07)

- **Q1 — oui.** Requête du § 3 lancée en production le 2026-10-07 :
  `everyday | 8`. Huit adresses sans liste, toutes convertibles ; la
  migration passera.
- **Q2 — accepté.** Le retour arrière est gratuit jusqu'à la première
  écriture d'adresse, puis demande le SQL inverse.

## 5. Ce que `vitruve` a relevé (2026-10-07)

- **Bloquants, corrigés** : 1 (adresse non convertie → la migration échoue
  au lieu de mettre un carnet en 500), 2 (les quatre lecteurs `safeParse`
  nommés, protégés par le même garde), 3 (deux schémas, lecture et écriture).
- **Sérieux, corrigés** : 4 (retour arrière chiffré), 5 (écrivains,
  constantes, semis, e2e listés, 58 fichiers comptés), 6 (`null` ne retire
  plus, la liste vide le dit), 7 (`jsonb_typeof = 'object'` dans le garde et
  le contrôle).
- **Non vérifié, assumé** : le contenu réel de la production (d'où Q1) ; une
  clé `slots` figée dans un snapshot de commande en production (aucun lecteur
  ne la lit).

# TODO — droits d'écriture du back-office

**État : 🟢 le modèle tient, il reste des trous de couverture.** Ce document ne
redécrit pas le mur staff — il vit dans
[`../b2b/architecture-acces-staff.md`](../b2b/architecture-acces-staff.md). Il
tient la liste de ce qui reste à **décider ou à câbler**, ressource par
ressource, à mesure qu'on finalise les domaines.

Principe d'ensemble, posé le 2026-08-26 :

> **La lecture est ouverte à tout le staff ; c'est l'écriture qui se mérite.**
> Un rôle qui ne voit pas ne peut pas aider ; un rôle qui écrit sans mandat
> casse quelque chose que personne n'a demandé.

---

## 1. TVA — `pim_tax:write`, rôle Comptabilité

> ⚠️ **Noms corrigés le 2026-09-03.** Ce paragraphe parlait de `tax` et de
> `catalog`, qui n'existent plus : les ressources sont **préfixées par leur
> bloc** depuis le découpage (`pim_tax`, `pim_catalog`, `b2b_catalog`,
> `b2b_pricing`…). Le fond tenait toujours ; c'est le vocabulaire qui envoyait
> chercher dans `ROLE_GRANTS` des clés absentes.

**Demandé** : créer et modifier un taux de TVA exige `pim_tax:write`, porté par
la Comptabilité ; tout le monde peut lire.

**Déjà en place** — l'écriture, entièrement :

| Pièce                                                                                                           | Où                                              |
| --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Ressource `pim_tax`, détachée de `pim_catalog`                                                                  | `packages/contracts/src/staff-access.ts`        |
| `comptabilite` porte `pim_tax: "write"`                                                                         | `ROLE_GRANTS`                                   |
| `@AdminSurface("pim_tax")` sur le contrôleur ; l'action se déduit du verbe — `GET` → `read`, le reste → `write` | `src/pim/vat-rates/http/vat-rate.controller.ts` |
| L'écran cache la création et la colonne d'actions sans `pim_tax:write`                                          | `vat-rates-page.ts`, `vat-rate-table.ts`        |
| La route exige `pim_tax:read`, distincte du `pim_catalog:read` du PIM                                           | `pim.routes.ts`                                 |

**Ce qui reste** :

- [ ] **`support` ne peut pas lire les taux.** _(Encore vrai au 2026-09-03.)_ Il
      n'a ni `pim_catalog:read` (le garde du PIM) ni `pim_tax:read` (celui de
      l'écran) : la règle « tout le monde peut lire » est fausse pour lui
      aujourd'hui. Deux lignes dans `ROLE_GRANTS`, plus le test qui fige la
      règle.
- [ ] **L'écran doit DIRE le refus, pas l'escamoter.** Aujourd'hui, sans
      `pim_tax:write`, le bouton de création et la colonne d'actions **disparaissent** :
      l'écran ne ment pas, mais il n'explique rien — on croit à un écran incomplet,
      pas à un droit manquant. Cible : un **callout `info` collé sous l'en-tête**,
      « Seuls les rôles Comptabilité et Administrateur peuvent créer ou modifier
      un taux de TVA », et le bouton **présent mais désactivé**. Un geste visible
      et refusé apprend où demander l'accès ; un geste absent n'apprend rien.
      Le motif vaudra pour les autres domaines de ce document.
- [ ] **Décider si « tout le monde lit » est une règle ou une liste.** Aujourd'hui
      chaque rôle énumère ses `read`, donc chaque nouvelle ressource se referme
      par défaut sur les rôles existants — silencieusement. Si la lecture est
      vraiment ouverte, elle doit s'écrire une fois (un plancher `read` commun),
      pas se recopier cinq fois.

**Différé, assumé** :

- La granularité `pim_tax` → `vat_rates` n'a pas lieu d'être **tant que la TVA
  est la seule taxe du référentiel**. `pim_tax` et `vat_rates` désignent aujourd'hui
  exactement le même ensemble d'objets, et un nom plus fin ne protégerait rien
  de plus. Le jour où une seconde taxe entre, c'est ce jour-là que la ressource
  se scinde — pas avant. (Cf. le renommage `tax_rate` → `vat_rate` des faits du
  journal, motivé par le même raisonnement.)

---

## 2. Les autres domaines

À remplir au fil de la finalisation, même forme : ce qui est demandé, ce qui
existe déjà, ce qui reste.

- [ ] Catalogue vendu (`b2b_catalog`) et référentiel (`pim_catalog`) — deux
      ressources depuis le découpage, et c'est tout l'intérêt : le commercial
      valide ce qui entre en vente sans toucher au référentiel.
- [ ] Emplacements — **`b2b_settings`**, vérifié le 2026-09-03 sur
      `admin-pickup-addresses.controller.ts` (la ligne disait `catalog`, « à
      confirmer » : c'est confirmé, et ce n'était pas ça).
- [ ] Commandes (`b2b_orders`)
- [ ] Comptes clients (`b2b_companies`)
- [ ] Réglages (`b2b_settings` / `pim_settings`)
- [ ] Tarification (`b2b_pricing`) — absente de cette liste alors qu'elle porte
      des `write` de deux rôles.

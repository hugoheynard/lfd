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

## 1. TVA — `tax:write`, rôle Comptabilité

**Demandé** : créer et modifier un taux de TVA exige `tax:write`, porté par la
Comptabilité ; tout le monde peut lire.

**Déjà en place** — l'écriture, entièrement :

| Pièce                                                                                                       | Où                                             |
| ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Ressource `tax`, détachée de `catalog`                                                                      | `packages/contracts/src/staff-access.ts`       |
| `comptabilite` porte `tax: "write"` (son seul `write` hors commandes)                                       | `ROLE_GRANTS`                                  |
| `@AdminSurface("tax")` sur le contrôleur ; l'action se déduit du verbe — `GET` → `read`, le reste → `write` | `src/pim/commerce/http/vat-rate.controller.ts` |
| L'écran cache la création et la colonne d'actions sans `tax:write`                                          | `vat-rates-page.ts`, `vat-rate-table.ts`       |
| La route exige `tax:read`, distincte du `catalog:read` du PIM                                               | `pim.routes.ts`                                |

**Ce qui reste** :

- [ ] **`support` ne peut pas lire les taux.** Il n'a ni `catalog:read` (le
      garde du PIM) ni `tax:read` (celui de l'écran) : la règle « tout le monde
      peut lire » est fausse pour lui aujourd'hui. Deux lignes dans
      `ROLE_GRANTS`, plus le test qui fige la règle.
- [ ] **Décider si « tout le monde lit » est une règle ou une liste.** Aujourd'hui
      chaque rôle énumère ses `read`, donc chaque nouvelle ressource se referme
      par défaut sur les rôles existants — silencieusement. Si la lecture est
      vraiment ouverte, elle doit s'écrire une fois (un plancher `read` commun),
      pas se recopier cinq fois.

**Différé, assumé** :

- La granularité `tax` → `vat_rates` n'a pas lieu d'être **tant que la TVA est
  la seule taxe du référentiel**. `tax` et `vat_rates` désignent aujourd'hui
  exactement le même ensemble d'objets, et un nom plus fin ne protégerait rien
  de plus. Le jour où une seconde taxe entre, c'est ce jour-là que la ressource
  se scinde — pas avant. (Cf. le renommage `tax_rate` → `vat_rate` des faits du
  journal, motivé par le même raisonnement.)

---

## 2. Les autres domaines

À remplir au fil de la finalisation, même forme : ce qui est demandé, ce qui
existe déjà, ce qui reste.

- [ ] Catalogue (`catalog`)
- [ ] Emplacements (`catalog` aujourd'hui — à confirmer)
- [ ] Commandes (`orders`)
- [ ] Comptes clients (`companies`)
- [ ] Réglages (`settings`)

# lfc-suite-shell

Hôte de la **suite d'outils internes** LFC : un seul login, un menu d'apps, et
chaque app **hébergée en iframe** (elle tourne telle quelle, standalone ===
embarqué).

**→ Architecture complète (pourquoi l'iframe, auth, sync d'URL, schémas) :
[`ARCHITECTURE.md`](./ARCHITECTURE.md).**

## Dev

```bash
pnpm suite:dev      # démarre le shell (7300) + PIM (7315) ensemble
```

Ouvrir `http://localhost:7300`. Un « app injoignable » au 1er chargement se règle
par un **F5** (l'app finissait de builder). Après un changement de config
(`angular.json`), vider `.angular` et vérifier dans un **onglet frais**.

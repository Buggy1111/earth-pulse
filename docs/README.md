# 📚 Earth Pulse — dokumentace

Kompletní dokumentace projektu. Hlavní [README](../README.md) je stručný
rozcestník (anglicky, pro open-source publikum); tady jsou detaily (česky).

| Dokument | O čem to je |
| --- | --- |
| [**FUNKCE.md**](FUNKCE.md) | Co všechno aplikace umí — kompletní katalog funkcí po režimech (Země / Měsíc / Sluneční soustava) a vrstvách. |
| [**ARCHITEKTURA.md**](ARCHITEKTURA.md) | Jak je to postavené — struktura kódu, datový tok, render smyčka, eco mód, sdílení pohledu v URL, build a testy. |
| [**DATOVE-ZDROJE.md**](DATOVE-ZDROJE.md) | Každý živý feed: URL, interval obnovy, formát, atribuce, proč to jde z prohlížeče bez backendu. |
| [**CHANGELOG.md**](CHANGELOG.md) | Historie vývoje podle git commitů — od v0.1 (živá Země) po dnešek (detailní Měsíc). |
| [**adr-001-globe-feature-modules.md**](adr-001-globe-feature-modules.md) | Architektonické rozhodnutí: proč je 3D scéna rozdělená na feature moduly. |

## Co je Earth Pulse v jedné větě
Real-time 3D glóbus, který v prohlížeči (bez backendu, bez API klíčů, bez
trackingu) ukazuje živou Zemi — zemětřesení do minuty, ~148 skutečných
satelitů s orbitami, ISS, polární záři, světla měst podél skutečného
terminátoru — a navíc umí přepnout na obíhání Měsíce a na celou sluneční
soustavu se zrychlením času.

## Stav
- **Verze:** 0.3.0
- **Stack:** React 19 + TypeScript + Vite + Tailwind v4 + globe.gl (three.js) + satellite.js
- **Testy:** 58 (vitest), čisté `tsc` i `eslint`
- **Licence:** viz [LICENSE](../LICENSE)

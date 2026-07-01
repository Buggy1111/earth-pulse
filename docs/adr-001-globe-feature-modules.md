# ADR-001: GlobeView rozpad na feature moduly (max 400 řádků/soubor)

**Datum:** 12. 6. 2026 · **Stav:** přijato

## Kontext
`GlobeView.tsx` narostl na 1344 řádků (God komponenta: obloha, povrch, quaky,
orbit engine, Měsíc, sluneční soustava, kamerové módy, pointer handling).
`Hud.tsx` 595, `App.tsx` 451, `lib.test.ts` 590. Cíl: žádný soubor přes 400
řádků, beze změny chování.

## Varianty
1. **Feature moduly = plain funkce s explicitním kontextem a cleanupem** —
   komponenta zůstane kompoziční kořen, každý modul `setupX(globe, deps) → dispose`.
2. Custom hooky per vrstva (useSky, useSurface…) — skryje deps, ale hooky
   s THREE objekty svádí k re-runs a skrytým závislostem.
3. Třídy/OOP scene graph — víc obřadnosti bez přínosu pro solo projekt.

## Volba: (1)
- 1:1 mapování na dosavadní `useEffect` bloky → mechanická migrace, nulová
  změna chování (ověřeno e2e smoke všech subsystémů).
- Explicitní deps (refy předané parametrem) = vidíš, co modul čte/píše.
- Volatilní hranice jsou právě vrstvy (quaky se mění nezávisle na soustavě).

## Struktura
```
components/
  GlobeView.tsx       kompoziční kořen: props → refs → effects (≤400)
  globe/helpers.ts    textury, tooltip, sdílené typy a konstanty
  globe/sky.ts        Sun uniform + sprite, Měsíc + Apollo, applySky
  globe/surface.ts    day/night textury, mraky, tile engine, hranice+labely, sopky
  globe/quakesLayer.ts glow sprity + ringy
  globe/orbitEngine.ts objects layer, per-frame smyčka, trails+šipky
  globe/solar.ts      stavba soustavy, updateSolar, focus kamery
  globe/pointer.ts    drag/klik raycasty, pin target, pov reporting
  globe/cameraModes.ts tour playlist, moon mode kamera
  hud/{types,panels,controls,SettingsPanel}
uiHooks.ts            useEcoMode/useTimeline/useSolarTime/useGeolocate
lib/*.test.ts         testy rozdělené po doménách (astro/satellites/feeds/ui-utils)
```

## Důsledky
- `cb.current = {...props}` v jednom efektu nahrazuje deset ručních ref-syncs;
  callbacky pro ne-React svět jdou výhradně přes `cb.current.*`.
- Sdílený mutable stav mezi moduly jde výhradně přes refy vytvořené
  v GlobeView (pin target, trails, solar anim) — jediný vlastník životního cyklu.
- Cena: o soubor víc na feature; zisk: každý soubor přečteš na jeden zátah
  a vrstvu lze smazat bez strachu.

## Dodatek — stav k 1. 7. 2026
Limit ~400 řádků se v praxi drží jako **vodítko, ne tvrdé pravidlo**: hrstka
kompozičních kořenů a soudržných modulů (`GlobeView.tsx`, `App.tsx`,
`ArSky.tsx`, `orbitEngine.ts`, `solar.ts`) běží vědomě na ~400–460 řádcích —
dělit je dál by soudržnost zhoršilo. Vše ostatní pod 400 zůstává.

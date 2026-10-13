# Issue #57: Android návrat na Zemi

## Co lze říct z kódu

- Aplikace je PWA v prohlížeči, bez nativního Android projektu v tomto repozitáři.
- Země → Sluneční soustava používá jeden renderer; solární skupina se při odchodu skryje a pomocné vrstvy se uklidí.
- Sky AR má vlastní WebGL renderer. Aktuální `main` už při jeho otevření uvolňuje renderer Země a po zavření jej vytváří znovu (PR #51); zároveň už řeší úklid kamery, workeru, pozdního načtení modelu a tlačítko pro zavření. Tyto opravy nelze vydávat za novou opravu issue #57.
- React ErrorBoundary zobrazí kartu „Lost signal“ s tlačítkem Reload. Sám ji automaticky nemačká. Samovolný návrat na Zemi proto zatím nelze označit za potvrzený React error, restart procesu ani OOM.

## Jak zachytit opakování na telefonu

1. Otevřít verzi s touto diagnostikou na telefonu a zapsat model telefonu, verzi Androidu, prohlížeč a způsob spuštění (prohlížeč / nainstalovaná PWA).
2. Zkusit 5× Země → Sluneční soustava → Země, potom 5× Země → Sky AR → Start → zavřít, pak rychlé střídání a návrat z pozadí. Zapsat přesné kroky a čas. Při chybě vyfotit **celou hlášku** před obnovením.
3. V Chrome DevTools přes `chrome://inspect/#devices` připojit telefon, zapnout Preserve log a zachytit Console. Po obnovení zadat `window.__earthPulseDiagnostics()` a uložit výstup. Události se drží jen v `localStorage` telefonu (posledních 40, bez polohy a odesílání na server).
4. Pokud se ztratí celé okno/renderer, současně zachytit Android logcat: `adb logcat -c`, zopakovat chybu a pak `adb logcat -d -v time > earth-pulse-logcat.txt`. Před sdílením zkontrolovat osobní údaje v logu.

## Vyhodnocení

- `react-error-boundary` + stejný `boot` bez nového načtení: React chyba; hláška bude v záznamu.
- Nový `boot` po `pagehide`: standardní reload/navigace; hledat chybu načítání zdrojů a service workeru.
- Nový `boot` bez `pagehide`, případně `webgl-context-lost`: pravděpodobný pád rendereru/GPU; potvrdit logcatem (`Out of memory`, `RenderProcessGone`, `SIGSEGV` apod.).
- Bez nového `boot`, pouze `view=earth`: změna stavu aplikace; hledat cestu navigace.

Bez původní hlášky nebo záznamu z telefonu zůstává mechanismus obou restartů neprokázaný. Automatizované testy v desktopovém Chromium s emulovaným telefonem neověřují skutečný mobilní GPU ani kameru.

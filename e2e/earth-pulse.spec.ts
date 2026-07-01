import { expect, test, type Page } from '@playwright/test'

/** Wait for the globe handle the app exposes for headless tests, and collect
 * any uncaught errors so a "renders but throws" regression fails loudly.
 * Load failures of THIRD-PARTY feeds are ignored: the app degrades gracefully
 * when e.g. wheretheiss.at has an outage, and that outage is not our bug —
 * it used to fail the whole suite. Own-origin errors still count. */
async function bootGlobe(page: Page): Promise<string[]> {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e.message)))
  page.on('console', (m) => {
    if (m.type() !== 'error') return
    const url = m.location()?.url ?? ''
    const text = m.text()
    const externalResource =
      /Failed to load resource|net::ERR/.test(text) && url !== '' && !url.includes('localhost')
    const externalSocket = /WebSocket connection to 'wss:\/\/(?!localhost)/.test(text)
    if (externalResource || externalSocket) return
    errors.push(text)
  })
  await page.goto('/')
  await page.waitForFunction(() => Boolean((window as Record<string, unknown>).__earthPulseGlobe), null, {
    timeout: 30_000,
  })
  return errors
}

function sceneInstancedCounts(page: Page): Promise<number[]> {
  return page.evaluate(() => {
    const g = (window as Record<string, unknown>).__earthPulseGlobe as {
      scene(): { traverse(cb: (o: unknown) => void): void }
    }
    const counts: number[] = []
    g.scene().traverse((o) => {
      const m = o as { isInstancedMesh?: boolean; count?: number }
      if (m.isInstancedMesh) counts.push(m.count ?? 0)
    })
    return counts
  })
}

test('boots the globe with no console errors and no Starlink swarm by default', async ({ page }) => {
  const errors = await bootGlobe(page)
  expect(await sceneInstancedCounts(page)).toEqual([]) // opt-in: nothing instanced yet
  expect(errors).toEqual([])
})

test('enabling the Starlink layer builds a ~10k InstancedMesh with positioned instances', async ({
  page,
}) => {
  // cold start (first Vite compile of the full module graph + SwiftShader context)
  // plus fetching the 1.8 MB TLE snapshot and building 10k instances can exceed the
  // default 60 s on a cold run; give this one test headroom (warm runs take ~35 s).
  test.setTimeout(120_000)
  await bootGlobe(page)

  // open the customize panel, then flip the Starlink layer on
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => /customize/i.test(b.textContent || ''))
    btn?.click()
  })
  await page.waitForTimeout(300)
  await page.evaluate(() => {
    const label = [...document.querySelectorAll('label')].find((l) => /starlink/i.test(l.textContent || ''))
    const input = label?.querySelector('input')
    ;(input ?? label)?.click()
  })

  // the worker fetches + parses 10k TLEs, builds the mesh (instances start
  // hidden), then the first SGP4 tick positions them — wait for the positions,
  // not just the mesh, or we'd sample it mid-build
  await page.waitForFunction(
    () => {
      const g = (window as Record<string, unknown>).__earthPulseGlobe as {
        scene(): { traverse(cb: (o: unknown) => void): void }
      }
      let positioned = 0
      g.scene().traverse((o) => {
        const m = o as {
          isInstancedMesh?: boolean
          count?: number
          instanceMatrix?: { array: ArrayLike<number> }
        }
        if (!m.isInstancedMesh || !m.instanceMatrix) return
        const el = m.instanceMatrix.array
        for (let i = 0; i < (m.count ?? 0); i++) {
          if (Math.hypot(el[i * 16], el[i * 16 + 1], el[i * 16 + 2]) > 1e-4) positioned++
        }
      })
      return positioned > 1000
    },
    null,
    { timeout: 30_000 },
  )

  const result = await page.evaluate(() => {
    const g = (window as Record<string, unknown>).__earthPulseGlobe as {
      scene(): { traverse(cb: (o: unknown) => void): void }
    }
    let mesh: { count: number; visible: boolean; instanceMatrix: { array: ArrayLike<number> } } | null = null
    g.scene().traverse((o) => {
      const m = o as typeof mesh & { isInstancedMesh?: boolean }
      if (m?.isInstancedMesh) mesh = m
    })
    if (!mesh) return { count: 0, positioned: 0 }
    const el = mesh.instanceMatrix.array
    let positioned = 0
    for (let i = 0; i < mesh.count; i++) {
      const sx = Math.hypot(el[i * 16], el[i * 16 + 1], el[i * 16 + 2])
      if (sx > 1e-4) positioned++
    }
    return { count: mesh.count, visible: mesh.visible, positioned }
  })

  expect(result.count).toBeGreaterThan(5000) // the whole active constellation
  expect(result.visible).toBe(true)
  // the worker positioned the swarm from live SGP4 — most instances are placed
  expect(result.positioned).toBeGreaterThan(result.count * 0.9)
})

// the exact flow Michal reported crashing on his phone: tap the "latest" quake
// row → the camera must fly to the epicentre and the detail card must open,
// with no uncaught errors along the way
test.describe('quake click', () => {
  test.use({ viewport: { width: 1920, height: 1080 } }) // roomy HUD: corner panels, no drawer

  test('clicking the latest quake flies the camera there and opens the detail card', async ({
    page,
  }) => {
    const errors = await bootGlobe(page)
    const latest = page.locator('button:has-text("latest:")').first()
    await latest.waitFor({ timeout: 20_000 }) // USGS feed landed
    const before = await page.evaluate(() => {
      const g = (window as Record<string, unknown>).__earthPulseGlobe as {
        pointOfView(): { lat: number; lng: number; altitude: number }
      }
      return g.pointOfView()
    })
    await latest.click()
    await page.waitForTimeout(2_500) // the 1.4 s camera flight + settle
    const after = await page.evaluate(() => {
      const g = (window as Record<string, unknown>).__earthPulseGlobe as {
        pointOfView(): { lat: number; lng: number; altitude: number }
      }
      return g.pointOfView()
    })
    // the flight targets altitude 1.0 over the epicentre — the pose must have
    // moved and zoomed in from the home view
    const moved =
      Math.abs(after.lat - before.lat) > 0.5 ||
      Math.abs(after.lng - before.lng) > 0.5 ||
      Math.abs(after.altitude - before.altitude) > 0.2
    expect(moved).toBe(true)
    expect(after.altitude).toBeLessThan(1.4)
    // the detail card is open (its depth/time/coords readout is unique to it)
    await expect(page.locator('text=/depth \\d+ km/').first()).toBeVisible()
    expect(errors).toEqual([])
  })
})

test('solar mode places the deep-space probes from their baked trajectories', async ({ page }) => {
  const errors = await bootGlobe(page)
  // enter solar mode (keyboard 3 → goSolar); the probe layer then fetches
  // probes.json and builds a clickable craft (userData.probeId) per trajectory
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: '3' })))
  await page.waitForFunction(
    () => {
      const g = (window as Record<string, unknown>).__earthPulseGlobe as {
        scene(): { traverse(cb: (o: unknown) => void): void }
      }
      let probes = 0
      g.scene().traverse((o) => {
        if ((o as { userData?: { probeId?: string } }).userData?.probeId) probes++
      })
      return probes >= 5
    },
    null,
    { timeout: 30_000 },
  )
  // the solar navigator lists the probes (click a name to fly out to the craft)
  await page.waitForFunction(() => /Voyager/.test(document.body.innerText), null, { timeout: 15_000 })
  // and the real ~8.9k-star sky builds as a Points cloud (shader compiles cleanly)
  await page.waitForFunction(
    () => {
      const g = (window as Record<string, unknown>).__earthPulseGlobe as {
        scene(): { traverse(cb: (o: unknown) => void): void }
      }
      let stars = 0
      g.scene().traverse((o) => {
        const p = o as { isPoints?: boolean; geometry?: { attributes?: { position?: { count?: number } } } }
        if (p.isPoints) stars = Math.max(stars, p.geometry?.attributes?.position?.count ?? 0)
      })
      return stars > 5000
    },
    null,
    { timeout: 15_000 },
  )
  // the procedural 3D star (clicking a star flies to it) shares one GL context:
  // reveal the reusable focus sphere and render a frame so its shader actually
  // compiles in headless — a GLSL slip would surface as a console error below
  const litStar = await page.evaluate(() => {
    const g = (window as Record<string, unknown>).__earthPulseGlobe as {
      scene(): { traverse(cb: (o: unknown) => void): void }
      renderer(): { render(s: unknown, c: unknown): void }
      camera(): unknown
    }
    let mesh: { visible: boolean; material: { uniforms: { uTime: { value: number } } } } | null = null
    g.scene().traverse((o) => {
      const m = o as { isMesh?: boolean; material?: { uniforms?: { uValley?: unknown } } }
      if (m.isMesh && m.material?.uniforms?.uValley) mesh = o as typeof mesh
    })
    if (!mesh) return false
    mesh.visible = true
    mesh.material.uniforms.uTime.value = 1
    g.renderer().render(g.scene(), g.camera())
    mesh.visible = false
    return true
  })
  expect(litStar).toBe(true)
  expect(errors).toEqual([])
})

// Sky AR is phone/tablet only (touch-primary), so emulate a touch device —
// otherwise the launch button is correctly hidden and there's nothing to open.
test.describe('mobile', () => {
  test.use({ hasTouch: true, isMobile: true })

  test('the Sky AR overlay opens with its controls and the camera element', async ({ page }) => {
    await bootGlobe(page)
    await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find((b) => /sky AR/i.test(b.textContent || ''))
      btn?.click()
    })
    // the overlay is lazy-loaded (its own chunk) — wait for it to mount rather
    // than a fixed delay, then assert its controls + camera element are present
    await page.waitForFunction(
      () => Boolean(document.querySelector('video')) && /location|start/i.test(document.body.innerText),
      null,
      { timeout: 15_000 },
    )
    const state = await page.evaluate(() => ({
      hasClose: [...document.querySelectorAll('button')].some((b) => /close/i.test(b.textContent || '')),
      hasGate: /location|start/i.test(document.body.innerText),
      hasVideo: Boolean(document.querySelector('video')),
    }))
    expect(state.hasClose).toBe(true)
    expect(state.hasGate).toBe(true)
    expect(state.hasVideo).toBe(true)
  })
})

import { expect, test, type Page } from '@playwright/test'

/** Wait for the globe handle the app exposes for headless tests, and collect
 * any uncaught errors so a "renders but throws" regression fails loudly. */
async function bootGlobe(page: Page): Promise<string[]> {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e.message)))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
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

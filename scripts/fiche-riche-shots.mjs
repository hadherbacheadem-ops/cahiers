// Captures of the rich-fiche prototype (dev server on 5173): both themes, desktop and iPhone 14.
// Usage: node scripts/fiche-riche-shots.mjs   (npm run dev must be running)
import { mkdirSync } from 'node:fs'
import { chromium, webkit, devices } from '@playwright/test'

const OUT = 'docs/mobile/fiche-riche'
mkdirSync(OUT, { recursive: true })
const URL = 'http://localhost:5173/fiche-riche'

async function shoot(browserType, contextOptions, name) {
  const browser = await browserType.launch()
  const ctx = await browser.newContext(contextOptions)
  const page = await ctx.newPage()
  const errors = []
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
  page.on('pageerror', (e) => errors.push(String(e)))
  await page.goto(URL)
  const frame = page.frameLocator('iframe')
  await frame.locator('h1').waitFor()
  await page.waitForTimeout(600)
  // Entrance animations follow the scroll: walk down the page so every block has appeared, then back up.
  const hidden = await frame.locator('.rv:not(.in)').count()
  for (let y = 0; y < 9000; y += 500) {
    await page.evaluate((top) => window.scrollTo(0, top), y)
    await page.waitForTimeout(120)
  }
  await page.waitForTimeout(900)
  await page.evaluate(() => window.scrollTo(0, 0))
  const left = await frame.locator('.rv:not(.in)').count()
  console.log(`${name}: hidden at load ${hidden}, after scroll ${left}`)
  for (const theme of ['dark', 'light']) {
    await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme)
    await page.waitForTimeout(500)
    await page.screenshot({ path: `${OUT}/${name}-${theme}.png`, fullPage: true })
  }
  // Interactions: slider moves Em, a demo opens, height follows.
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'))
  const before = await page.locator('iframe').evaluate((f) => f.getBoundingClientRect().height)
  if (name === 'desktop') {
    await frame.locator('.card').nth(1).hover()
    await page.waitForTimeout(400)
    const t = await frame.locator('.card').nth(1).evaluate((el) => getComputedStyle(el).transform)
    console.log('hover transform:', t)
  }
  await frame.locator('#e').fill('0.2')
  const kind = await frame.locator('#kind').textContent()
  await frame.locator('details.demo summary').first().click()
  await page.waitForTimeout(400)
  const after = await page.locator('iframe').evaluate((f) => f.getBoundingClientRect().height)
  console.log(`${name}: kind="${kind}" iframe ${Math.round(before)} -> ${Math.round(after)} px, errors: ${JSON.stringify(errors)}`)
  await page.screenshot({ path: `${OUT}/${name}-dark-open.png`, fullPage: true })
  await browser.close()
}

await shoot(chromium, { viewport: { width: 1280, height: 900 } }, 'desktop')
await shoot(webkit, { ...devices['iPhone 14'] }, 'iphone14')

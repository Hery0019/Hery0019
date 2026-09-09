// Renders the GitHub contribution calendar as text and writes it into README.md
// between the contributions markers.
//
// Why text: the images in this README were disappearing for readers behind
// GitHub's Johannesburg cache node, which drops requests at random while the
// page HTML itself loads fine. A code block cannot fail to load — if the page
// renders, the grid renders.
//
// The calendar comes from the public profile fragment, the same source the
// snake generator used, so it follows the "include private contributions"
// setting on the profile: turn that on and private work appears here too.

const USER = process.argv[2] ?? 'Hery0019'
const README = process.argv[3] ?? 'README.md'

const START = '<!-- contributions:start -->'
const END = '<!-- contributions:end -->'

// Light to dark. A shading ramp reads on a light page and a dark one alike,
// unlike a colour, and every one of these lives in the standard monospace fonts.
const RAMP = ['·', '░', '▒', '▓', '█']

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAY_LABELS = ['   ', 'Mon', '   ', 'Wed', '   ', 'Fri', '   ']

async function fetchCalendar(user) {
  const res = await fetch(`https://github.com/users/${user}/contributions`, {
    headers: { 'User-Agent': 'contribution-grid-script', Accept: 'text/html' },
  })
  if (!res.ok) throw new Error(`profile fragment returned ${res.status}`)
  return res.text()
}

// The fragment is a table of seven rows, one per weekday, each holding one cell
// per week. Parsing row by row keeps the weekday grouping without any date maths.
function parseRows(html) {
  const rows = []
  for (const tr of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const cells = [...tr[1].matchAll(/data-date="(\d{4}-\d{2}-\d{2})"[^>]*data-level="(\d)"/g)]
      .map((m) => ({ date: m[1], level: Number(m[2]) }))
    if (cells.length) rows.push(cells)
  }
  if (rows.length !== 7) throw new Error(`expected 7 weekday rows, found ${rows.length}`)
  return rows
}

// Each day's count only exists in its tooltip; summing them is the only way to
// the yearly total without an authenticated GraphQL call.
function parseTotal(html) {
  let total = 0
  for (const m of html.matchAll(/>(\d+) contributions? on /g)) total += Number(m[1])
  return total
}

// A month is labelled above the first week that starts inside it, and only when
// there is room for the label since the previous one.
function monthHeader(rows) {
  const weeks = rows[0].length
  const out = Array(weeks).fill(' ')
  let last = -99
  for (let w = 0; w < weeks; w++) {
    const first = rows.find((r) => r[w])?.[w]
    if (!first) continue
    const month = Number(first.date.slice(5, 7)) - 1
    const day = Number(first.date.slice(8, 10))
    const label = MONTHS[month]
    // Skip a label that would run off the end rather than print half of it.
    if (day <= 7 && w - last >= 4 && w + label.length <= weeks) {
      for (let i = 0; i < label.length; i++) out[w + i] = label[i]
      last = w
    }
  }
  return out.join('').replace(/\s+$/, '')
}

function render(rows, total) {
  const pad = ' '.repeat(DAY_LABELS[0].length + 1)
  const lines = [pad + monthHeader(rows)]
  rows.forEach((cells, i) => {
    lines.push(`${DAY_LABELS[i]} ` + cells.map((c) => RAMP[c.level]).join(''))
  })
  const first = rows.flat().map((c) => c.date).sort()[0]
  const last = rows.flat().map((c) => c.date).sort().at(-1)
  lines.push('')
  lines.push(`${pad}${total} contributions   ${first} → ${last}   ${RAMP.join(' ')}  less → more`)
  return lines.join('\n')
}

const html = await fetchCalendar(USER)
const grid = render(parseRows(html), parseTotal(html))

const { readFileSync, writeFileSync } = await import('node:fs')
const readme = readFileSync(README, 'utf8')
const from = readme.indexOf(START)
const to = readme.indexOf(END)
if (from < 0 || to < 0) throw new Error(`markers ${START} / ${END} not found in ${README}`)

const next = readme.slice(0, from + START.length) + '\n\n```text\n' + grid + '\n```\n\n' + readme.slice(to)
if (next === readme) {
  console.log('grid unchanged')
} else {
  writeFileSync(README, next)
  console.log('grid updated')
}

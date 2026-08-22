import 'dotenv/config'
import readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'

// node src/scripts/pick.js            add a note interactively
// node src/scripts/pick.js list       show what is on the desk
// node src/scripts/pick.js remove ID  take one down
const BASE = process.env.API_BASE || `http://localhost:${process.env.PORT || 5050}/api`
const TOKEN = process.env.ADMIN_TOKEN

if (!TOKEN) {
  console.error('ADMIN_TOKEN is missing from server/.env')
  process.exit(1)
}

const headers = { 'Content-Type': 'application/json', 'x-admin-token': TOKEN }
const command = process.argv[2]

async function list() {
  const res = await fetch(`${BASE}/reco`)
  const data = await res.json()
  if (!data.picks?.length) return console.log('Nothing on the desk yet.')
  for (const p of data.picks) {
    console.log(`\n${p.symbol}  ${p.company}  [${p.stance}]`)
    console.log(`  ${p.thesis}`)
    if (p.risk) console.log(`  risk: ${p.risk}`)
    console.log(`  id: ${p.id}`)
  }
}

async function remove(id) {
  if (!id) return console.error('Pass the id: node src/scripts/pick.js remove <id>')
  const res = await fetch(`${BASE}/reco/picks/${id}`, { method: 'DELETE', headers })
  console.log(res.ok ? 'Removed.' : `Failed: ${(await res.json()).error}`)
}

async function add() {
  const rl = readline.createInterface({ input, output })
  const ask = async (q, required = true) => {
    while (true) {
      const answer = (await rl.question(q)).trim()
      if (answer || !required) return answer
      console.log('  Required.')
    }
  }

  const body = {
    symbol: await ask('Symbol (e.g. TITAN): '),
    company: await ask('Company name: '),
    sector: await ask('Sector (optional): ', false) || undefined,
    stance: (await ask('Stance [watching|studying|avoiding] (default watching): ', false)) || 'watching',
    thesis: await ask('Why is this interesting? (at least 30 characters)\n> '),
    risk: (await ask('What would prove it wrong? (optional)\n> ', false)) || undefined,
  }
  const price = (await ask('Price when added (optional): ', false))
  if (price) body.addedPrice = Number(price)
  const source = (await ask('Source URL (optional): ', false))
  if (source) body.sourceUrl = source
  rl.close()

  const res = await fetch(`${BASE}/reco/picks`, { method: 'POST', headers, body: JSON.stringify(body) })
  const data = await res.json()
  console.log(res.ok ? `\nAdded ${data.pick.symbol}. It is live on /reco now.` : `\nFailed: ${data.error}`)
}

if (command === 'list') await list()
else if (command === 'remove') await remove(process.argv[3])
else await add()

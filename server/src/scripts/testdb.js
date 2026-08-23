import readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import mongoose from 'mongoose'

// node src/scripts/testdb.js
// Prompts for a connection string, reports pass or fail, and never echoes the
// string back or writes it anywhere.
const rl = readline.createInterface({ input, output })
const uri = (await rl.question('Paste the Atlas connection string: ')).trim()
rl.close()

if (!uri) {
  console.error('Nothing entered.')
  process.exit(1)
}

// Cheap shape checks first. These catch most failures without a network call.
const problems = []
if (!uri.startsWith('mongodb+srv://') && !uri.startsWith('mongodb://')) problems.push('Does not start with mongodb+srv://')
if (/<[^>]*>/.test(uri)) problems.push('Still contains a <placeholder>. Replace it, angle brackets included.')
if (!/mongodb\+srv:\/\/[^:]+:[^@]+@/.test(uri)) problems.push('No username:password before the @')
if (!/@[^/]+\/[A-Za-z0-9_-]+/.test(uri)) problems.push('No database name after the host. Add /investomillionaire before the ?')

const pass = uri.replace(/^mongodb\+srv:\/\/[^:]+:/, '').replace(/@.*$/, '')
if (/[@:/?#[\]%]/.test(pass)) {
  problems.push('The password contains a character that must be percent-encoded (@ : / ? # [ ] %)')
}

if (problems.length) {
  console.log('\nProblems found before even connecting:')
  problems.forEach((p) => console.log('  -', p))
  console.log('\nFix these first.')
  process.exit(1)
}

console.log('\nShape looks right. Connecting...')
try {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 12000 })
  const admin = mongoose.connection.db.admin()
  await admin.ping()
  console.log(`CONNECTED. Database name: ${mongoose.connection.name}`)
  console.log('This string works. Paste it into Render as MONGODB_URI.')
  await mongoose.disconnect()
} catch (err) {
  const msg = err.message.split('\n')[0]
  console.log(`FAILED: ${msg}\n`)
  if (/bad auth|authentication failed/i.test(msg)) {
    console.log('Atlas rejected the username or password. Check, in order:')
    console.log('  1. Database Access: does a user with that exact username exist?')
    console.log('  2. Reset its password (Edit > Edit Password > Autogenerate) and copy it fresh.')
    console.log('  3. Confirm the user role is "Read and write to any database".')
    console.log('  4. Make sure the user is in the SAME Atlas project as this cluster.')
  } else if (/ENOTFOUND|querySrv/i.test(msg)) {
    console.log('The cluster hostname is wrong. Copy the string again from Connect > Drivers.')
  } else if (/timed out|ETIMEDOUT/i.test(msg)) {
    console.log('Network Access is blocking you. Add 0.0.0.0/0 under Network Access in Atlas.')
  }
  process.exit(1)
}

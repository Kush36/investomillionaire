import mongoose from 'mongoose'

const progressSchema = new mongoose.Schema(
  {
    track: { type: String, enum: ['fundamental', 'technical'], required: true },
    level: { type: Number, required: true },
    bestScore: { type: Number, default: 0 },
    attempts: { type: Number, default: 0 },
    passedAt: Date,
  },
  { _id: false }
)

/**
 * How many companies one person may keep on their list.
 *
 * Fifty, because the dashboard renders the list whole in one payload and every entry
 * is a company somebody means to actually read a report on. A number large enough to
 * stop being a list is the same as no cap, and an uncapped array on a user document
 * is an unbounded write anyone with an account can perform.
 */
export const WATCHLIST_CAP = 50

// A person's own list of companies to analyse.
//
// It lives on the user rather than in its own collection because it is small, capped,
// never queried across users, and always read whole by a request that has already
// loaded this document for auth. A separate collection would buy an index nobody
// would read and a second round trip on every dashboard render.
const watchlistSchema = new mongoose.Schema(
  {
    // The ISIN is the key, never the ticker. A symbol freed by a delisting can be
    // reassigned to a different company, at which point a list keyed on symbol is
    // quietly about companies nobody chose. An ISIN is issued once and never moves.
    isin: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      match: /^[A-Z]{2}[A-Z0-9]{9}\d$/,
    },
    // The name and symbol as the NSE equity list had them when the entry was added.
    // Denormalised on purpose: the list has to render when nsearchives is unreachable,
    // and this is the only surviving record of what the person believed they added if
    // the symbol is later reassigned.
    symbol: { type: String, required: true, uppercase: true, trim: true, maxlength: 20 },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    addedAt: { type: Date, default: Date.now },
  },
  { _id: false }
)

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 40 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    emailVerified: { type: Boolean, default: false },
    // Encrypted at rest with AES-256-GCM. It is never returned by any public
    // endpoint, and publicProfile() deliberately omits it.
    mobileEnc: { type: String, select: false },
    // Blind index so a number can be found without decrypting the column.
    mobileFingerprint: { type: String, index: true, select: false },
    mobileLast4: { type: String, select: false },
    xp: { type: Number, default: 0 },
    streak: { type: Number, default: 0 },
    lastActiveOn: String, // YYYY-MM-DD in IST, used to compute the streak
    badges: { type: [String], default: [] },
    lessonsRead: { type: [String], default: [] },
    progress: { type: [progressSchema], default: [] },
    // Deliberately absent from publicProfile(): what a person is researching is not
    // part of the profile the rest of the app passes around, and it has its own
    // endpoint that answers for the signed-in user and nobody else.
    watchlist: { type: [watchlistSchema], default: [] },
  },
  { timestamps: true }
)

userSchema.methods.publicProfile = function () {
  return {
    id: this._id,
    name: this.name,
    email: this.email,
    emailVerified: this.emailVerified,
    xp: this.xp,
    streak: this.streak,
    badges: this.badges,
    lessonsRead: this.lessonsRead,
    progress: this.progress,
    createdAt: this.createdAt,
  }
}

export const User = mongoose.model('User', userSchema)

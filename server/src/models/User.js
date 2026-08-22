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

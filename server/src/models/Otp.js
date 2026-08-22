import mongoose from 'mongoose'

const otpSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true, index: true },
    purpose: { type: String, enum: ['signup', 'reset'], required: true },
    // Only the hash is stored. A database leak does not hand anyone a working code.
    codeHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    attempts: { type: Number, default: 0 },
    consumedAt: Date,
    // Signup details are parked here until the code is confirmed, so an unverified
    // address never creates a row in the users collection.
    payload: {
      name: String,
      passwordHash: String,
      mobileEnc: String,
      mobileFingerprint: String,
      mobileLast4: String,
    },
  },
  { timestamps: true }
)

// Mongo sweeps expired codes on its own.
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

export const Otp = mongoose.model('Otp', otpSchema)

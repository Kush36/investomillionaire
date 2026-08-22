import mongoose from 'mongoose'

const attemptSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    track: { type: String, enum: ['fundamental', 'technical'], required: true },
    level: { type: Number, required: true },
    score: Number,
    total: Number,
    percent: Number,
    passed: Boolean,
    xpEarned: Number,
    durationMs: Number,
  },
  { timestamps: true }
)

export const Attempt = mongoose.model('Attempt', attemptSchema)

import mongoose from 'mongoose'

// Ideas added by the site owner. Every one carries a written thesis and is
// rendered as a study note, never as a call to buy.
const pickSchema = new mongoose.Schema(
  {
    symbol: { type: String, required: true, uppercase: true, trim: true, maxlength: 20 },
    company: { type: String, required: true, trim: true, maxlength: 120 },
    stance: { type: String, enum: ['watching', 'studying', 'avoiding'], default: 'watching' },
    thesis: { type: String, required: true, trim: true, maxlength: 1200 },
    risk: { type: String, trim: true, maxlength: 600 },
    sector: { type: String, trim: true, maxlength: 60 },
    addedPrice: Number,
    sourceUrl: { type: String, trim: true, maxlength: 400 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
)

export const Pick = mongoose.model('Pick', pickSchema)

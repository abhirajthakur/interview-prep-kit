import { Schema, model, type InferSchemaType, type HydratedDocument } from "mongoose";
import { kitSchema as kitShape } from "../../pipeline/kit.schema.js";

export const KIT_STATUSES = ["pending", "generating", "ready", "failed"] as const;
export type KitStatus = (typeof KIT_STATUSES)[number];

// Mirrors pipeline/kit.schema.ts's zod shape as a Mongoose subdocument. Kept in sync by hand;
// kitShape (zod) is still what validates a freshly generated kit before it is ever saved here.
const requirementSchema = new Schema(
  { id: String, text: String, kind: String, priority: String },
  { _id: false },
);

const questionSchema = new Schema(
  {
    id: String,
    requirement_ids: [String],
    category: String,
    prompt: String,
    answer_outline: String,
    difficulty: Number,
    origin: { type: String, enum: ["generated", "manual"], default: "generated" },
    edited: { type: Boolean, default: false },
    pinned: { type: Boolean, default: false },
  },
  { _id: false },
);

const flashcardSchema = new Schema(
  {
    id: String,
    front: String,
    back: String,
    requirement_ids: [String],
    origin: { type: String, enum: ["generated", "manual"], default: "generated" },
    edited: { type: Boolean, default: false },
    pinned: { type: Boolean, default: false },
  },
  { _id: false },
);

const scheduleDaySchema = new Schema(
  { day: Number, focus: String, question_ids: [String], minutes: Number },
  { _id: false },
);

const progressEventSchema = new Schema(
  { step: String, status: String, detail: String, at: { type: Date, default: () => new Date() } },
  { _id: false },
);

const kitSchema = new Schema(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    status: { type: String, enum: KIT_STATUSES, default: "pending", required: true },
    error: { code: String, message: String },
    progress: { type: [progressEventSchema], default: [] },
    /** hash(ownerId, jd, companyUrl, days); prevents a duplicate submission from starting a second run. */
    dedupeKey: { type: String, required: true, index: true },
    /** Bumped on every save. A regeneration that started against a stale version is rejected. */
    version: { type: Number, default: 0 },

    source: {
      company: String,
      company_url: String,
      role: String,
      location: String,
      jd_chars: Number,
      researched_at: String,
      pages_used: [String],
    },
    company_brief: { summary: String, what_they_do: String, sources: [String] },
    role: {
      title: String,
      seniority: String,
      responsibilities: [String],
      requirements: { type: [requirementSchema], default: [] },
    },
    questions: { type: [questionSchema], default: [] },
    flashcards: { type: [flashcardSchema], default: [] },
    schedule: { days_available: Number, days: { type: [scheduleDaySchema], default: [] } },
    coverage: {
      uncovered_requirement_ids: { type: [String], default: [] },
      passes: Number,
      history: { type: [{ pass: Number, uncovered_requirement_ids: [String] }], default: [] },
    },
    warnings: { type: [String], default: [] },
    research: {
      skipped_sources: { type: [{ url: String, reason: String }], default: [] },
      hiring_page_found: Boolean,
      public_discussion_found: Boolean,
      jd_thin: Boolean,
      hiring_process: {
        found: Boolean,
        stages: { type: [{ name: String, description: String }], default: [] },
        sources: [String],
      },
      discussion: { type: [{ url: String, title: String, text: String }], default: [] },
    },
  },
  { timestamps: true },
);

kitSchema.index({ ownerId: 1, createdAt: -1 });

export type KitDoc = HydratedDocument<InferSchemaType<typeof kitSchema>>;
export const KitModel = model("Kit", kitSchema);

// Referenced so a change to the pipeline's zod shape is a visible reminder to update the Mongoose shape above.
export type _KeepInSync = typeof kitShape;

import { createHash } from "node:crypto";
import { KitModel, type KitDoc } from "../db/models/kit.model.js";
import { MAX_DAYS } from "../pipeline/build-kit.js";
import { badRequest, notFound } from "../utils/api-error.js";
import { runKitGeneration } from "./kits.runner.js";

export type CreateKitResult = { kit: KitDoc; started: boolean };

export async function createKit(params: {
  ownerId: string;
  jd: string;
  companyUrl: string;
  days: number;
}): Promise<CreateKitResult> {
  if (params.jd.trim() === "") throw badRequest("jd must not be empty.");
  if (!Number.isInteger(params.days) || params.days < 1 || params.days > MAX_DAYS) {
    throw badRequest(`days must be a whole number from 1 to ${MAX_DAYS}.`);
  }

  const companyUrl = params.companyUrl.trim();
  const dedupeKey = createHash("sha256")
    .update(JSON.stringify([params.ownerId, params.jd, companyUrl, params.days]))
    .digest("hex");

  const existing = await KitModel.findOne({
    ownerId: params.ownerId,
    dedupeKey,
    status: { $in: ["pending", "generating", "ready"] },
  }).sort({ createdAt: -1 });
  if (existing) return { kit: existing, started: false };

  const kit = await KitModel.create({
    ownerId: params.ownerId,
    status: "pending",
    dedupeKey,
    input: { jd: params.jd, company_url: companyUrl, days: params.days },
    schedule: { days_available: params.days, days: [] },
  });

  setImmediate(() => void runKitGeneration(kit.id as string));
  return { kit, started: true };
}

export async function getKit(id: string, ownerId: string): Promise<KitDoc> {
  const kit = await KitModel.findOne({ _id: id, ownerId });
  if (!kit) throw notFound("Kit not found");
  return kit;
}

export async function listKits(ownerId: string): Promise<KitDoc[]> {
  return KitModel.find({ ownerId }).sort({ createdAt: -1 });
}

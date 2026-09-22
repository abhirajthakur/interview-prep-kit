import type { Request, Response } from "express";
import { unauthorized } from "../utils/api-error.js";
import type { RegenerateSection } from "./kits.schemas.js";
import { createKit, getKit, listKits } from "./kits.service.js";
import { regenerateSection } from "./regenerate.service.js";
import { sendSuccess } from "../utils/api-response.js";

function ownerId(req: Request): string {
  if (!req.user) {
    throw unauthorized("Sign in required.");
  }
  return req.user.id;
}

export async function create(req: Request, res: Response) {
  const { jd, company_url, days } = req.body as { jd: string; company_url: string; days: number };
  const { kit, started } = await createKit({
    ownerId: ownerId(req),
    jd,
    companyUrl: company_url,
    days,
  });
  sendSuccess(res, started ? 202 : 200, {
    success: true,
    data: { id: kit.id, status: kit.status },
  });
}

export async function list(req: Request, res: Response) {
  const kits = await listKits(ownerId(req));
  sendSuccess(res, 200, { success: true, data: kits });
}

export async function get(req: Request, res: Response) {
  const kit = await getKit(req.params["id"] as string, ownerId(req));
  sendSuccess(res, 200, { success: true, data: kit });
}

export async function regenerate(req: Request, res: Response) {
  const { section, version, days } = req.body as {
    section: RegenerateSection;
    version: number;
    days?: number;
  };
  const kit = await regenerateSection({
    kitId: req.params["id"] as string,
    ownerId: ownerId(req),
    section,
    expectedVersion: version,
    days,
  });
  sendSuccess(res, 200, { success: true, data: kit });
}

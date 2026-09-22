import { KitModel } from "../db/models/kit.model.js";
import { logger } from "../lib/logger.js";
import { buildKit, ProgressEvent } from "../pipeline/build-kit.js";
import { describeError } from "../pipeline/errors.js";
import { getPipelineServices } from "../lib/pipeline.js";

// Runs the full pipeline for a pending kit and writes status/progress/results back to the document
export async function runKitGeneration(kitId: string) {
  const { llm, fetcher } = getPipelineServices();
  await KitModel.updateOne({ _id: kitId }, { $set: { status: "generating" } });

  const kit = await KitModel.findById(kitId);
  if (!kit) {
    return; // deleted before generation started
  }

  // Writes are fire-and-forget so they never slow buildKit down, but they must still land in
  // emission order. A promise chain serialises them without blocking on each individual write.
  let progressChain: Promise<unknown> = Promise.resolve();
  const pushProgress = (event: ProgressEvent) => {
    progressChain = progressChain
      .then(() =>
        KitModel.updateOne(
          { _id: kitId },
          { $push: { progress: { step: event.step, status: event.status, detail: event.detail } } },
        ),
      )
      .catch((e: unknown) =>
        logger.warn("failed to write kit progress", { kitId, error: String(e) }),
      );
  };

  try {
    const result = await buildKit(
      {
        jd: kit.input?.jd!,
        companyUrl: kit.input?.company_url!,
        days: kit.schedule?.days_available!,
      },
      { llm, fetcher, onProgress: pushProgress },
    );

    await progressChain; // guarantee every event is persisted before status flips to "ready"

    await KitModel.updateOne(
      { _id: kitId },
      { $set: { status: "ready", ...result }, $inc: { version: 1 } },
    );
  } catch (e) {
    await progressChain;

    await KitModel.updateOne(
      { _id: kitId },
      { $set: { status: "failed", error: describeError(e) }, $inc: { version: 1 } },
    );
    logger.error("kit generation failed", { kitId, error: describeError(e) });
  }
}

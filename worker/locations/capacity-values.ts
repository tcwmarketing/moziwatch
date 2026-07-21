export type RidbCapacityPayload = {
  RECDATA?: unknown[];
  METADATA?: { RESULTS?: { TOTAL_COUNT?: number } };
};

export function ridbCampsiteCount(payload: RidbCapacityPayload) {
  const total = Number(payload.METADATA?.RESULTS?.TOTAL_COUNT);
  if (!Number.isInteger(total) || total < 0 || total > 100_000)
    throw new Error(
      "RIDB campsite response did not include a valid total count",
    );
  return total || null;
}

export const FORECAST_SCHEDULING_THRESHOLDS = {
  dailyOfficialCampsites: 50,
  dailySavedUsers: 3,
  dailyDetailViews30d: 10,
  recentReportDays: 30,
  requestedDailyDays: 7,
} as const;

export type ForecastCadence = "daily" | "weekly" | "paused";

export type ForecastCadenceInput = {
  active: boolean;
  operatingStatus: string;
  hasHabitatProfile: boolean;
  officialCampsites: number | null;
  recentReport: boolean;
  savedUsers: number;
  detailViews30d: number;
  requestedRecently: boolean;
  manualOverride?: ForecastCadence | null;
};

export function decideForecastCadence(input: ForecastCadenceInput) {
  if (!input.active || ["closed", "review"].includes(input.operatingStatus))
    return {
      cadence: "paused" as const,
      priorityScore: 0,
      reasonCodes: ["not-operating"],
    };
  if (!input.hasHabitatProfile)
    return {
      cadence: "paused" as const,
      priorityScore: 0,
      reasonCodes: ["habitat-profile-required"],
    };
  if (input.manualOverride)
    return {
      cadence: input.manualOverride,
      priorityScore: input.manualOverride === "daily" ? 100 : 1,
      reasonCodes: ["manual-override"],
    };
  const reasons: string[] = [];
  let priorityScore = 0;
  if (
    (input.officialCampsites || 0) >=
    FORECAST_SCHEDULING_THRESHOLDS.dailyOfficialCampsites
  ) {
    reasons.push("notable-capacity");
    priorityScore += 30;
  }
  if (input.recentReport) {
    reasons.push("recent-report");
    priorityScore += 30;
  }
  if (input.savedUsers >= FORECAST_SCHEDULING_THRESHOLDS.dailySavedUsers) {
    reasons.push("frequently-saved");
    priorityScore += 20;
  }
  if (
    input.detailViews30d >= FORECAST_SCHEDULING_THRESHOLDS.dailyDetailViews30d
  ) {
    reasons.push("frequently-viewed");
    priorityScore += 15;
  }
  if (input.requestedRecently) {
    reasons.push("recently-requested");
    priorityScore += 25;
  }
  return {
    cadence: reasons.length ? ("daily" as const) : ("weekly" as const),
    priorityScore: reasons.length ? priorityScore : 1,
    reasonCodes: reasons.length ? reasons : ["established-low-interest"],
  };
}

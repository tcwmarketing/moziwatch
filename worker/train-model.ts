import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parse } from "csv-parse/sync";
import {
  FORECAST_FEATURES,
  type ForecastFeature,
  type LogisticForecastModelArtifact,
} from "@/config/forecast";
import { sigmoid } from "./model";

type TrainingRow = {
  date: Date;
  target: number;
  features: Record<ForecastFeature, number>;
};
const inputPath = process.argv[2];
const outputPath = process.argv[3] || "./config/models/current.json";
if (!inputPath)
  throw new Error("Usage: npm run model:train -- training.csv [output.json]");

const raw = parse(await readFile(resolve(inputPath), "utf8"), {
  columns: true,
  skip_empty_lines: true,
  trim: true,
}) as Array<Record<string, string>>;
const rows: TrainingRow[] = raw
  .map((row, index) => {
    const date = new Date(row.date),
      target = Number(row.target);
    if (!Number.isFinite(date.getTime()) || ![0, 1].includes(target))
      throw new Error(`Invalid date or target on training row ${index + 2}`);
    const features = Object.fromEntries(
      FORECAST_FEATURES.map((feature) => [feature, Number(row[feature])]),
    ) as Record<ForecastFeature, number>;
    const bad = FORECAST_FEATURES.find(
      (feature) => !Number.isFinite(features[feature]),
    );
    if (bad) throw new Error(`Missing ${bad} on training row ${index + 2}`);
    return { date, target, features };
  })
  .sort((a, b) => a.date.getTime() - b.date.getTime());

if (rows.length < 100)
  throw new Error(
    "At least 100 chronologically ordered observations are required",
  );
const split = Math.floor(rows.length * 0.8);
const train = rows.slice(0, split),
  holdout = rows.slice(split);
if (
  new Set(train.map((row) => row.target)).size < 2 ||
  new Set(holdout.map((row) => row.target)).size < 2
)
  throw new Error(
    "Training and temporal holdout sets must each contain both target classes",
  );

const normalization = Object.fromEntries(
  FORECAST_FEATURES.map((feature) => {
    const mean =
      train.reduce((sum, row) => sum + row.features[feature], 0) / train.length;
    const variance =
      train.reduce((sum, row) => sum + (row.features[feature] - mean) ** 2, 0) /
      train.length;
    return [feature, { mean, standardDeviation: Math.sqrt(variance) || 1 }];
  }),
) as LogisticForecastModelArtifact["normalization"];

const standardized = (row: TrainingRow) =>
  FORECAST_FEATURES.map(
    (feature) =>
      (row.features[feature] - normalization[feature].mean) /
      normalization[feature].standardDeviation,
  );
let intercept = 0;
const coefficients = new Array(FORECAST_FEATURES.length).fill(0) as number[];
const learningRate = 0.03,
  l2 = 0.001;
for (let epoch = 0; epoch < 2500; epoch++) {
  let interceptGradient = 0;
  const gradients = coefficients.map(() => 0);
  for (const row of train) {
    const values = standardized(row);
    const prediction = sigmoid(
      intercept +
        values.reduce((sum, value, i) => sum + value * coefficients[i], 0),
    );
    const error = prediction - row.target;
    interceptGradient += error;
    values.forEach((value, i) => {
      gradients[i] += error * value;
    });
  }
  intercept -= (learningRate * interceptGradient) / train.length;
  coefficients.forEach((value, i) => {
    coefficients[i] -=
      learningRate * (gradients[i] / train.length + l2 * value);
  });
}

const predictions = holdout.map((row) => {
  const values = standardized(row);
  return {
    target: row.target,
    prediction: sigmoid(
      intercept +
        values.reduce((sum, value, i) => sum + value * coefficients[i], 0),
    ),
  };
});
const brier =
  predictions.reduce(
    (sum, item) => sum + (item.prediction - item.target) ** 2,
    0,
  ) / predictions.length;
function auc(items: typeof predictions) {
  const positive = items.filter((item) => item.target === 1),
    negative = items.filter((item) => item.target === 0);
  let wins = 0;
  for (const p of positive)
    for (const n of negative)
      wins +=
        p.prediction > n.prediction
          ? 1
          : p.prediction === n.prediction
            ? 0.5
            : 0;
  return wins / (positive.length * negative.length);
}

const trainedAt = new Date();
const artifact: LogisticForecastModelArtifact = {
  kind: "logistic-regression",
  status: "trained",
  version: `logit-${trainedAt
    .toISOString()
    .replace(/[-:.TZ]/g, "")
    .slice(0, 14)}`,
  trainedAt: trainedAt.toISOString(),
  usesUserReports: true,
  temporalHoldout: {
    start: holdout[0].date.toISOString(),
    end: holdout.at(-1)!.date.toISOString(),
    auc: auc(predictions),
    brier,
  },
  intercept,
  coefficients: Object.fromEntries(
    FORECAST_FEATURES.map((feature, index) => [feature, coefficients[index]]),
  ) as Record<ForecastFeature, number>,
  normalization,
  notes:
    "Coefficients were fit from the supplied observations with an 80/20 chronological split. They are not a scientific validation claim.",
};
await writeFile(
  resolve(outputPath),
  `${JSON.stringify(artifact, null, 2)}\n`,
  "utf8",
);
console.log(
  `Wrote ${artifact.version}. Temporal holdout AUC ${artifact.temporalHoldout.auc?.toFixed(3)}, Brier ${brier.toFixed(3)}.`,
);

import type { ModelBreakdown } from "@opencode-dashboard/shared";
import type {
  CostByModelEntry,
  ModelTokenShareEntry,
} from "@/components/dashboard/model-breakdown-panels";

export function buildModelBreakdownData(models: ModelBreakdown[]): {
  sortedModels: ModelBreakdown[];
  costByModel: CostByModelEntry[];
  modelTokenMix: ModelTokenShareEntry[];
} {
  const sortedModels = models.toSorted(
    (left: ModelBreakdown, right: ModelBreakdown) => right.cost - left.cost,
  );

  const topModels = sortedModels.slice(0, 6);

  const costByModel = topModels.map((model: ModelBreakdown) => ({
    label: `${model.providerId} / ${model.modelId}`,
    providerId: model.providerId,
    modelId: model.modelId,
    cost: Number(model.cost.toFixed(2)),
    tokens: model.tokens,
  }));

  const modelTokenMix = topModels.map((model: ModelBreakdown) => {
    const cache = model.breakdown.cacheRead + model.breakdown.cacheWrite;
    const total = model.breakdown.input + model.breakdown.output + cache;

    return {
      label: `${model.providerId} / ${model.modelId}`,
      providerId: model.providerId,
      modelId: model.modelId,
      inputShare: total > 0 ? (model.breakdown.input / total) * 100 : 0,
      outputShare: total > 0 ? (model.breakdown.output / total) * 100 : 0,
      cacheShare: total > 0 ? (cache / total) * 100 : 0,
    };
  });

  return {
    sortedModels,
    costByModel,
    modelTokenMix,
  };
}

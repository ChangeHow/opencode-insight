import type { ModelBreakdown } from "@opencode-dashboard/shared";
import type {
  CostByModelEntry,
  ModelTokenShareEntry,
} from "@/components/dashboard/model-breakdown-panels";
import { getModelDisplayName } from "@/lib/model-display";

export function buildModelBreakdownData(models: ModelBreakdown[]): {
  costByModel: CostByModelEntry[];
  modelTokenShare: ModelTokenShareEntry[];
} {
  const sortedModels = models.toSorted(
    (left: ModelBreakdown, right: ModelBreakdown) => right.cost - left.cost,
  );

  const topModels = sortedModels.slice(0, 6);
  const topTokenModels = models
    .toSorted((left: ModelBreakdown, right: ModelBreakdown) => right.tokens - left.tokens)
    .slice(0, 6);
  const totalTokens = models.reduce((sum, model) => sum + model.tokens, 0);

  const costByModel = topModels.map((model: ModelBreakdown) => ({
    label: `${model.providerId} / ${getModelDisplayName(model.modelId, model.providerId)}`,
    providerId: model.providerId,
    modelId: model.modelId,
    cost: Number(model.cost.toFixed(2)),
    tokens: model.tokens,
  }));

  const modelTokenShare = topTokenModels.map((model: ModelBreakdown) => ({
    label: `${model.providerId} / ${getModelDisplayName(model.modelId, model.providerId)}`,
    providerId: model.providerId,
    modelId: model.modelId,
    tokens: model.tokens,
    inputTokens: model.breakdown.input,
    outputTokens: model.breakdown.output,
    cacheTokens: model.breakdown.cacheRead + model.breakdown.cacheWrite,
    share: totalTokens > 0 ? (model.tokens / totalTokens) * 100 : 0,
  }));

  return {
    costByModel,
    modelTokenShare,
  };
}

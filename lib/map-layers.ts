type StyleLayerSummary = {
  id: string;
  type: string;
  "source-layer"?: string;
};

export function findWaterMaskPlacement<T extends StyleLayerSummary>(
  layers: T[] | undefined,
) {
  const index = layers?.findIndex((layer) => {
    if (layer.type !== "fill") return false;
    const sourceLayer = layer["source-layer"]?.toLowerCase();
    return (
      sourceLayer === "water" ||
      /(?:^|[-_])(water|ocean|lake)(?:$|[-_])/.test(layer.id.toLowerCase())
    );
  });

  if (layers === undefined || index === undefined || index < 0)
    return undefined;

  return {
    layer: layers[index],
    beforeId: layers[index + 1]?.id,
  };
}

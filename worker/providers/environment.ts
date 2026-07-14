export type EnvironmentalValues = {
  wetlandProximity: number | null;
  landCover: number | null;
};
export interface EnvironmentalProvider {
  readonly name: string;
  values(latitude: number, longitude: number): Promise<EnvironmentalValues>;
}

// Phase 1 deliberately reports unavailable values instead of manufacturing
// them. A trained artifact may use these features only after a licensed source
// adapter has been configured.
export class UnavailableEnvironmentalProvider implements EnvironmentalProvider {
  readonly name = "unavailable";
  async values(latitude: number, longitude: number) {
    void latitude;
    void longitude;
    return { wetlandProximity: null, landCover: null };
  }
}

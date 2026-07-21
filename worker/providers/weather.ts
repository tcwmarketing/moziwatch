import type { CampgroundWeatherOutlook } from "@/config/forecast";

export type WeatherCell = {
  key: string;
  latitude: number;
  longitude: number;
  elevation: number | null;
  variables: Record<string, number | null>;
  raw: Record<string, unknown>;
};

export interface WeatherProvider {
  readonly name: string;
  fetchCurrentDay(
    cells: Array<{ key: string; latitude: number; longitude: number }>,
    date: string,
  ): Promise<WeatherCell[]>;
  fetchCampgroundOutlook(
    campgrounds: Array<{
      id: string;
      latitude: number;
      longitude: number;
    }>,
    date: string,
  ): Promise<
    Array<{
      campgroundId: string;
      outlook: CampgroundWeatherOutlook[];
      elevation: number | null;
      raw: Record<string, unknown>;
    }>
  >;
}

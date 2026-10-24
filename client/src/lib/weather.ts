export interface PracticeWeather {
  temperatureC: number;
  relativeHumidityPercent: number;
  windSpeedKmh: number;
  precipitationMm?: number;
  windDirectionDegrees?: number;
  fetchedAt: string;
  source: "open-meteo";
}

interface OpenMeteoResponse {
  current?: {
    time?: string;
    temperature_2m?: number;
    relative_humidity_2m?: number;
    wind_speed_10m?: number;
    precipitation?: number;
    wind_direction_10m?: number;
  };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function getWindDirectionLabel(degrees: number): string {
  const directions = ["북", "북동", "동", "남동", "남", "남서", "서", "북서"];
  return directions[Math.round((((degrees % 360) + 360) % 360) / 45) % directions.length];
}

export async function fetchCurrentWeather(latitude: number, longitude: number): Promise<PracticeWeather | undefined> {
  if (!isFiniteNumber(latitude) || !isFiniteNumber(longitude)) return undefined;

  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current: "temperature_2m,relative_humidity_2m,wind_speed_10m,precipitation,wind_direction_10m",
    temperature_unit: "celsius",
    wind_speed_unit: "kmh",
    timezone: "auto",
  });
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return undefined;
    const payload = await response.json() as OpenMeteoResponse;
    const current = payload.current;
    if (
      !current ||
      !isFiniteNumber(current.temperature_2m) ||
      !isFiniteNumber(current.relative_humidity_2m) ||
      !isFiniteNumber(current.wind_speed_10m)
    ) return undefined;
    return {
      temperatureC: current.temperature_2m,
      relativeHumidityPercent: current.relative_humidity_2m,
      windSpeedKmh: current.wind_speed_10m,
      precipitationMm: isFiniteNumber(current.precipitation) ? current.precipitation : undefined,
      windDirectionDegrees: isFiniteNumber(current.wind_direction_10m) ? current.wind_direction_10m : undefined,
      fetchedAt: new Date().toISOString(),
      source: "open-meteo",
    };
  } catch {
    return undefined;
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

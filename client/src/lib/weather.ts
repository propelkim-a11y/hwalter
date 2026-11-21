export interface PracticeWeather {
  temperatureC: number;
  apparentTemperatureC?: number;
  relativeHumidityPercent: number;
  windSpeedKmh: number;
  precipitationProbabilityPercent?: number;
  precipitationType?: "snow" | "rain";
  windDirectionDegrees?: number;
  fetchedAt: string;
  source: "open-meteo" | "openweathermap";
}

interface OpenMeteoResponse {
  current?: {
    time?: string;
    temperature_2m?: number;
    apparent_temperature?: number;
    relative_humidity_2m?: number;
    wind_speed_10m?: number;
    precipitation_probability?: number;
    weather_code?: number;
    wind_direction_10m?: number;
  };
}

interface OpenWeatherMapResponse {
  main?: { temp?: number; feels_like?: number; humidity?: number };
  wind?: { speed?: number; deg?: number };
  weather?: Array<{ id?: number; main?: string }>;
  dt?: number;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function getOpenMeteoPrecipitationType(weatherCode: unknown): PracticeWeather["precipitationType"] {
  if (!isFiniteNumber(weatherCode)) return undefined;
  if ([71, 73, 75, 77, 85, 86].includes(weatherCode)) return "snow";
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99].includes(weatherCode)) return "rain";
  return undefined;
}

function getOpenWeatherMapPrecipitationType(payload: OpenWeatherMapResponse): PracticeWeather["precipitationType"] {
  const condition = payload.weather?.[0];
  const id = condition?.id;
  const main = condition?.main?.toLowerCase();
  if ((isFiniteNumber(id) && id >= 600 && id <= 622) || main === "snow") return "snow";
  if ((isFiniteNumber(id) && id >= 200 && id <= 599) || main === "rain" || main === "drizzle" || main === "thunderstorm") return "rain";
  return undefined;
}

function providerTimestamp(value: unknown): string {
  const raw = String(value ?? "");
  // Open-Meteo는 timezone=UTC 요청에도 offset 없는 ISO 시각을 반환할 수 있다.
  // 브라우저의 로컬 시간대로 해석되지 않도록 UTC를 명시한다.
  const normalized = typeof value === "number" || !raw || /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw) ? raw : `${raw}Z`;
  const date = typeof value === "number" ? new Date(value * 1000) : new Date(normalized);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function isPracticeWeather(value: unknown): value is PracticeWeather {
  if (!value || typeof value !== "object") return false;
  const weather = value as Partial<PracticeWeather>;
  return isFiniteNumber(weather.temperatureC)
    && isFiniteNumber(weather.relativeHumidityPercent)
    && isFiniteNumber(weather.windSpeedKmh)
    && (weather.source === "open-meteo" || weather.source === "openweathermap")
    && typeof weather.fetchedAt === "string";
}

function getOpenWeatherMapApiKey(): string | undefined {
  const key = import.meta.env.VITE_OPENWEATHERMAP_API_KEY;
  return typeof key === "string" && key.trim() ? key.trim() : undefined;
}

async function fetchServerWeather(latitude: number, longitude: number): Promise<PracticeWeather | undefined> {
  const params = new URLSearchParams({ lat: String(latitude), lng: String(longitude), _t: String(Date.now()) });
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`/api/weather?${params.toString()}`, {
      signal: controller.signal,
      cache: "no-store",
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return undefined;
    const payload = await response.json() as unknown;
    return isPracticeWeather(payload) ? payload : undefined;
  } catch {
    return undefined;
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

async function fetchOpenWeatherMap(latitude: number, longitude: number): Promise<PracticeWeather | undefined> {
  const apiKey = getOpenWeatherMapApiKey();
  if (!apiKey) return undefined;
  const params = new URLSearchParams({ lat: String(latitude), lon: String(longitude), appid: apiKey, units: "metric", lang: "kr", _t: String(Date.now()) });
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`https://api.openweathermap.org/data/2.5/weather?${params.toString()}`, {
      signal: controller.signal,
      cache: "no-store",
      credentials: "omit",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return undefined;
    const payload = await response.json() as OpenWeatherMapResponse;
    const temperatureC = payload.main?.temp;
    const relativeHumidityPercent = payload.main?.humidity;
    const windSpeedMps = payload.wind?.speed;
    if (!isFiniteNumber(temperatureC) || !isFiniteNumber(relativeHumidityPercent) || !isFiniteNumber(windSpeedMps)) return undefined;
    return {
      temperatureC,
      apparentTemperatureC: isFiniteNumber(payload.main?.feels_like) ? payload.main.feels_like : undefined,
      relativeHumidityPercent,
      windSpeedKmh: windSpeedMps * 3.6,
      precipitationType: getOpenWeatherMapPrecipitationType(payload),
      windDirectionDegrees: isFiniteNumber(payload.wind?.deg) ? payload.wind.deg : undefined,
      fetchedAt: providerTimestamp(payload.dt),
      source: "openweathermap",
    };
  } catch {
    return undefined;
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

export function getWindDirectionLabel(degrees: number): string {
  const directions = ["북", "북동", "동", "남동", "남", "남서", "서", "북서"];
  return directions[Math.round((((degrees % 360) + 360) % 360) / 45) % directions.length];
}

export async function fetchCurrentWeather(latitude: number, longitude: number): Promise<PracticeWeather | undefined> {
  if (!isFiniteNumber(latitude) || !isFiniteNumber(longitude)) return undefined;

  // 모바일 브라우저에서는 동일 출처 서버 프록시를 먼저 사용해 외부 API 연결 제한을 우회한다.
  const serverWeather = await fetchServerWeather(latitude, longitude);
  if (serverWeather) return serverWeather;

  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current: "temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,precipitation_probability,weather_code,wind_direction_10m",
    temperature_unit: "celsius",
    wind_speed_unit: "kmh",
    timezone: "UTC",
  });
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), 15000);
  try {
    const requestUrl = `https://api.open-meteo.com/v1/forecast?${params.toString()}&_t=${Date.now()}`;
    const response = await fetch(requestUrl, {
      signal: controller.signal,
      cache: "no-store",
      credentials: "omit",
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return fetchOpenWeatherMap(latitude, longitude);
    const payload = await response.json() as OpenMeteoResponse;
    const current = payload.current;
    if (!current || !isFiniteNumber(current.temperature_2m) || !isFiniteNumber(current.relative_humidity_2m) || !isFiniteNumber(current.wind_speed_10m)) {
      return fetchOpenWeatherMap(latitude, longitude);
    }
    return {
      temperatureC: current.temperature_2m,
      apparentTemperatureC: isFiniteNumber(current.apparent_temperature) ? current.apparent_temperature : undefined,
      relativeHumidityPercent: current.relative_humidity_2m,
      windSpeedKmh: current.wind_speed_10m,
      precipitationProbabilityPercent: isFiniteNumber(current.precipitation_probability) ? current.precipitation_probability : undefined,
      precipitationType: getOpenMeteoPrecipitationType(current.weather_code),
      windDirectionDegrees: isFiniteNumber(current.wind_direction_10m) ? current.wind_direction_10m : undefined,
      fetchedAt: providerTimestamp(current.time),
      source: "open-meteo",
    };
  } catch {
    return fetchOpenWeatherMap(latitude, longitude);
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

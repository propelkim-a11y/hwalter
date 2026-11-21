import express from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function isFiniteCoordinate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function providerTimestamp(value: unknown): string {
  const raw = String(value ?? "");
  // Open-Meteo의 timezone=UTC 응답은 offset 없는 ISO 시각일 수 있으므로 UTC를 명시한다.
  const normalized = typeof value === "number" || !raw || /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw) ? raw : `${raw}Z`;
  const date = typeof value === "number" ? new Date(value * 1000) : new Date(normalized);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function getOpenMeteoPrecipitationType(weatherCode: unknown): "snow" | "rain" | undefined {
  if (!isFiniteCoordinate(weatherCode)) return undefined;
  if ([71, 73, 75, 77, 85, 86].includes(weatherCode)) return "snow";
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99].includes(weatherCode)) return "rain";
  return undefined;
}

function getOpenWeatherMapPrecipitationType(payload: { weather?: Array<{ id?: number; main?: string }> }): "snow" | "rain" | undefined {
  const condition = payload.weather?.[0];
  const id = condition?.id;
  const main = condition?.main?.toLowerCase();
  if ((isFiniteCoordinate(id) && id >= 600 && id <= 622) || main === "snow") return "snow";
  if ((isFiniteCoordinate(id) && id >= 200 && id <= 599) || main === "rain" || main === "drizzle" || main === "thunderstorm") return "rain";
  return undefined;
}

async function fetchWeatherJson(url: string, timeoutMs = 12000): Promise<Response | undefined> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: controller.signal,
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}

async function getServerWeather(latitude: number, longitude: number) {
  const openMeteoParams = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current: "temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,precipitation_probability,weather_code,wind_direction_10m",
    temperature_unit: "celsius",
    wind_speed_unit: "kmh",
    timezone: "UTC",
    _t: String(Date.now()),
  });
  const openMeteoResponse = await fetchWeatherJson(`https://api.open-meteo.com/v1/forecast?${openMeteoParams.toString()}`);
  if (openMeteoResponse?.ok) {
    const payload = await openMeteoResponse.json() as {
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
    };
    const current = payload.current;
    if (
      current &&
      isFiniteCoordinate(current.temperature_2m) &&
      isFiniteCoordinate(current.relative_humidity_2m) &&
      isFiniteCoordinate(current.wind_speed_10m)
    ) {
      return {
        temperatureC: current.temperature_2m,
        apparentTemperatureC: isFiniteCoordinate(current.apparent_temperature) ? current.apparent_temperature : undefined,
        relativeHumidityPercent: current.relative_humidity_2m,
        windSpeedKmh: current.wind_speed_10m,
        precipitationProbabilityPercent: isFiniteCoordinate(current.precipitation_probability)
          ? current.precipitation_probability
          : undefined,
        precipitationType: getOpenMeteoPrecipitationType(current.weather_code),
        windDirectionDegrees: isFiniteCoordinate(current.wind_direction_10m) ? current.wind_direction_10m : undefined,
        fetchedAt: providerTimestamp(current.time),
        source: "open-meteo" as const,
      };
    }
  }

  const apiKey = process.env.OPENWEATHERMAP_API_KEY;
  if (!apiKey) return undefined;
  const openWeatherParams = new URLSearchParams({
    lat: String(latitude),
    lon: String(longitude),
    appid: apiKey,
    units: "metric",
    lang: "kr",
    _t: String(Date.now()),
  });
  const openWeatherResponse = await fetchWeatherJson(`https://api.openweathermap.org/data/2.5/weather?${openWeatherParams.toString()}`);
  if (!openWeatherResponse?.ok) return undefined;
  const payload = await openWeatherResponse.json() as {
    main?: { temp?: number; feels_like?: number; humidity?: number };
    wind?: { speed?: number; deg?: number };
    weather?: Array<{ id?: number; main?: string }>;
    dt?: number;
  };
  const temperatureC = payload.main?.temp;
  const relativeHumidityPercent = payload.main?.humidity;
  const windSpeedMps = payload.wind?.speed;
  if (!isFiniteCoordinate(temperatureC) || !isFiniteCoordinate(relativeHumidityPercent) || !isFiniteCoordinate(windSpeedMps)) {
    return undefined;
  }
  return {
    temperatureC,
    apparentTemperatureC: isFiniteCoordinate(payload.main?.feels_like) ? payload.main.feels_like : undefined,
    relativeHumidityPercent,
    windSpeedKmh: windSpeedMps * 3.6,
    precipitationType: getOpenWeatherMapPrecipitationType(payload),
    windDirectionDegrees: isFiniteCoordinate(payload.wind?.deg) ? payload.wind.deg : undefined,
    fetchedAt: providerTimestamp(payload.dt),
    source: "openweathermap" as const,
  };
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  app.get("/api/weather", async (req, res) => {
    const latitude = Number(req.query.lat);
    const longitude = Number(req.query.lng);
    if (!isFiniteCoordinate(latitude) || !isFiniteCoordinate(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      res.status(400).json({ error: "Invalid coordinates" });
      return;
    }
    const weather = await getServerWeather(latitude, longitude);
    res.setHeader("Cache-Control", "no-store, max-age=0");
    if (!weather) {
      res.status(502).json({ error: "Weather providers unavailable" });
      return;
    }
    res.json(weather);
  });

  // Serve static files from dist/public in production
  const staticPath =
    process.env.NODE_ENV === "production"
      ? path.resolve(__dirname, "public")
      : path.resolve(__dirname, "..", "dist", "public");

  app.use(express.static(staticPath));

  // Handle client-side routing - serve index.html for all routes
  app.get("*", (_req, res) => {
    res.sendFile(path.join(staticPath, "index.html"));
  });

  const port = process.env.PORT || 3000;

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);

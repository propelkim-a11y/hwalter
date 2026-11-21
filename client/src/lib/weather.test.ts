import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchCurrentWeather, getWindDirectionLabel } from "./weather";

describe("fetchCurrentWeather", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("동일 출처 서버 프록시에서 현재 날씨를 읽는다", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      temperatureC: 19.4,
      apparentTemperatureC: 18.1,
      relativeHumidityPercent: 58,
      windSpeedKmh: 8.7,
      precipitationProbabilityPercent: 72,
      windDirectionDegrees: 45,
      fetchedAt: "2026-10-21T18:00:00.000Z",
      source: "open-meteo",
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    const weather = await fetchCurrentWeather(36.35, 127.38);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toContain("/api/weather?lat=36.35&lng=127.38");
    expect(fetchMock.mock.calls[0][0]).toMatch(/&_t=\d+$/);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ cache: "no-store", credentials: "same-origin" });
    expect(weather).toMatchObject({
      temperatureC: 19.4,
      apparentTemperatureC: 18.1,
      relativeHumidityPercent: 58,
      windSpeedKmh: 8.7,
      precipitationProbabilityPercent: 72,
      windDirectionDegrees: 45,
      source: "open-meteo",
    });
  });

  it("프록시와 외부 기상 API가 모두 실패하면 undefined를 반환한다", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 503 }));
    await expect(fetchCurrentWeather(36.35, 127.38)).resolves.toBeUndefined();
  });

  it("Open-Meteo 직접 fallback은 조회 시각이 아닌 제공자 기준 시각을 사용한다", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        current: {
          time: "2026-11-20T01:00",
          temperature_2m: 18,
          apparent_temperature: 16.5,
          relative_humidity_2m: 55,
          wind_speed_10m: 7,
          precipitation_probability: 10,
          weather_code: 71,
          wind_direction_10m: 90,
        },
      }), { status: 200, headers: { "Content-Type": "application/json" } }));

    await expect(fetchCurrentWeather(36.35, 127.38)).resolves.toMatchObject({
      fetchedAt: "2026-11-20T01:00:00.000Z",
      source: "open-meteo",
      precipitationType: "snow",
      apparentTemperatureC: 16.5,
    });
    expect(fetchMock.mock.calls[1][0]).toContain("timezone=UTC");
  });

  it("Open-Meteo가 실패하면 설정된 OpenWeatherMap을 예비로 호출한다", async () => {
    vi.stubEnv("VITE_OPENWEATHERMAP_API_KEY", "test-openweathermap-key");
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValueOnce(new Response("", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        main: { temp: 21.5, feels_like: 20.2, humidity: 62 },
        wind: { speed: 2.5, deg: 180 },
        weather: [{ id: 601, main: "Snow" }],
        dt: 1792605600,
      }), { status: 200, headers: { "Content-Type": "application/json" } }));

    await expect(fetchCurrentWeather(36.35, 127.38)).resolves.toMatchObject({
      temperatureC: 21.5,
      relativeHumidityPercent: 62,
      windSpeedKmh: 9,
      windDirectionDegrees: 180,
      precipitationType: "snow",
      apparentTemperatureC: 20.2,
      source: "openweathermap",
      fetchedAt: new Date(1792605600 * 1000).toISOString(),
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[2][0]).toContain("api.openweathermap.org");
    expect(fetchMock.mock.calls[2][0]).toContain("appid=test-openweathermap-key");
  });

  it("풍향 각도를 한국어 8방위로 변환한다", () => {
    expect(getWindDirectionLabel(0)).toBe("북");
    expect(getWindDirectionLabel(45)).toBe("북동");
    expect(getWindDirectionLabel(270)).toBe("서");
  });

  it("좌표가 없거나 유효하지 않으면 요청하지 않는다", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    await expect(fetchCurrentWeather(Number.NaN, 127.38)).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

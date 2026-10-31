import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchCurrentWeather, getWindDirectionLabel } from "./weather";

describe("fetchCurrentWeather", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("GPS 좌표로 현재 기온·습도·풍속을 읽는다", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      current: {
        time: "2026-10-21T18:00",
        temperature_2m: 19.4,
        relative_humidity_2m: 58,
        wind_speed_10m: 8.7,
        precipitation: 0.4,
        wind_direction_10m: 45,
      },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    const weather = await fetchCurrentWeather(36.35, 127.38);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toContain("latitude=36.35");
    expect(fetchMock.mock.calls[0][0]).toContain("current=temperature_2m%2Crelative_humidity_2m%2Cwind_speed_10m%2Cprecipitation%2Cwind_direction_10m");
    expect(weather).toMatchObject({
      temperatureC: 19.4,
      relativeHumidityPercent: 58,
      windSpeedKmh: 8.7,
      precipitationMm: 0.4,
      windDirectionDegrees: 45,
      source: "open-meteo",
    });
    expect(weather?.fetchedAt).toEqual(expect.any(String));
  });

  it("기상 API가 실패하면 기록 저장을 막지 않도록 undefined를 반환한다", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("", { status: 503 }));

    await expect(fetchCurrentWeather(36.35, 127.38)).resolves.toBeUndefined();
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

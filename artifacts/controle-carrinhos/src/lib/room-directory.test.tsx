import { act, renderHook } from "@testing-library/react";
import React, { type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CampusDataProvider, useCampusData } from "./campus-data";
import { RoomDirectoryProvider, useRoomDirectory } from "./room-directory";
import { initialCampusRooms } from "./room-directory-seed";

describe("Room directory factory reset", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.unstubAllEnvs();
  });

  const wrapper = ({ children }: { children: ReactNode }) => (
    <CampusDataProvider>
      <RoomDirectoryProvider>{children}</RoomDirectoryProvider>
    </CampusDataProvider>
  );

  it("does not recreate sample rooms after a factory reset or app reload", () => {
    const { result, unmount } = renderHook(
      () => ({ campus: useCampusData(), directory: useRoomDirectory() }),
      { wrapper },
    );

    act(() => {
      expect(result.current.directory.addRoom({
        number: "08",
        floor: "1º andar",
        segment: "Fundamental 2",
        morningClasses: ["8º ano C · Artes"],
        afternoonClasses: ["6º ano A · Português"],
      })).toBe(true);
      result.current.campus.addWifiPoint({
        name: "AP de teste",
        point: "AP-TEST",
        type: "Ponto fixo",
        location: "Bloco de teste",
        rack: "Rack de teste",
        status: "Disponível",
      });
      result.current.campus.toggleRoomWifi("Sala 08");
    });
    expect(result.current.directory.rooms).toHaveLength(1);
    expect(result.current.campus.wifiPoints).toHaveLength(1);
    expect(result.current.campus.wifiRooms).toHaveLength(1);

    act(() => result.current.campus.resetData("factory"));
    expect(result.current.directory.rooms).toHaveLength(0);
    expect(result.current.campus.wifiPoints).toHaveLength(0);
    expect(result.current.campus.wifiRooms).toHaveLength(0);
    expect(window.localStorage.getItem("controle-carrinhos-rooms")).toBeNull();
    expect(window.localStorage.getItem("controle-carrinhos-wifi-points")).toBe("[]");
    expect(window.localStorage.getItem("controle-carrinhos-wifi-rooms")).toBe("[]");

    unmount();
    const reloaded = renderHook(
      () => ({ campus: useCampusData(), directory: useRoomDirectory() }),
      { wrapper },
    );
    expect(reloaded.result.current.directory.rooms).toHaveLength(0);
    expect(reloaded.result.current.campus.wifiPoints).toHaveLength(0);
    expect(reloaded.result.current.campus.wifiRooms).toHaveLength(0);
  });

  it("loads the configured 46-room campus seed once and classifies mixed-grade rooms by class", () => {
    vi.stubEnv("VITE_ENABLE_CAMPUS_SEED", "true");
    const { result } = renderHook(() => useRoomDirectory(), { wrapper });

    expect(initialCampusRooms).toHaveLength(46);
    expect(result.current.rooms).toHaveLength(46);
    expect(result.current.rooms[0]).toMatchObject({
      number: "01",
      floor: "Subsolo",
      morningClasses: ["2° MA"],
      afternoonClasses: ["2° TA"],
    });
    expect(result.current.rooms.at(-1)).toMatchObject({
      number: "46",
      floor: "3º piso",
      morningClasses: ["3° EM MA"],
      afternoonClasses: ["8° TA"],
    });
    expect(result.current.roomOptionsForSegment("Educação Infantil")).toContain("Sala 05");
    expect(result.current.roomOptionsForSegment("Fundamental 2")).toContain("Sala 29");
    expect(result.current.roomOptionsForSegment("Ensino Médio")).toContain("Sala 29");
    expect(window.localStorage.getItem("controle-carrinhos-rooms")).not.toBeNull();
  });

  it("replaces only the known five-room demo catalog with the configured campus layout", () => {
    vi.stubEnv("VITE_ENABLE_CAMPUS_SEED", "true");
    window.localStorage.setItem("controle-carrinhos-rooms", JSON.stringify([
      { id: "room-08", number: "08", floor: "1º andar", segment: "Fundamental 2", morningClasses: [], afternoonClasses: [] },
      { id: "room-14", number: "14", floor: "1º andar", segment: "Fundamental 2", morningClasses: [], afternoonClasses: [] },
      { id: "room-18", number: "18", floor: "2º andar", segment: "Fundamental 2", morningClasses: [], afternoonClasses: [] },
      { id: "room-02", number: "02", floor: "1º andar", segment: "Fundamental 2", morningClasses: [], afternoonClasses: [] },
      { id: "room-21", number: "21", floor: "3º andar", segment: "Fundamental 2", morningClasses: [], afternoonClasses: [] },
    ]));

    const { result } = renderHook(() => useRoomDirectory(), { wrapper });

    expect(result.current.rooms).toHaveLength(46);
    expect(result.current.rooms.map((room) => room.number)).toContain("46");
  });
});

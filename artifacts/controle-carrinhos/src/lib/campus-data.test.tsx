import { beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import React from 'react';
import type { ReactNode } from 'react';
import {
  CampusDataProvider,
  canCancelReservation,
  defaultCartSchedules,
  initialAdminAccounts,
  initialCarts,
  useCampusData,
} from './campus-data';
import type { Cart } from './campus-data';

describe('Campus data core logic', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  const wrapper = ({ children }: { children: ReactNode }) => (
    <CampusDataProvider>{children}</CampusDataProvider>
  );
  const addTestCart = (result: { current: ReturnType<typeof useCampusData> }) => {
    const cart: Omit<Cart, 'id'> = {
      name: 'Carrinho B',
      code: 'B',
      prefix: 'B',
      total: 30,
      available: 30,
      location: 'Sala TI',
      status: 'Disponível',
      lastCheck: '2026-01-01',
      accent: '#000000',
      unavailable: false,
      unavailableUnits: [],
      reservedUnits: ['B28', 'B29', 'B30'],
      reserveCapacity: 30,
    };
    act(() => result.current.addCart(cart));
  };

  it('starts with only the default administrator account', () => {
    const { result } = renderHook(() => useCampusData(), { wrapper });

    const admin = initialAdminAccounts[0];

    expect(admin.password).toBe('admin123');
    expect(result.current.operatorAccounts).toHaveLength(0);
    expect(result.current.teacherAccounts).toHaveLength(0);
    expect(result.current.reservations).toHaveLength(0);
    expect(result.current.carts).toHaveLength(initialCarts.length);
    expect(result.current.authenticateAdmin(admin.name, admin.password)?.id).toBe(admin.id);
    expect(result.current.authenticateOperator('TI', '123456')).toBeNull();
  });

  it('adds a new unit to a cart and persists its availability', () => {
    const { result } = renderHook(() => useCampusData(), { wrapper });
    window.localStorage.setItem('controle-carrinhos-super-admin', 'true');
    const original = result.current.carts.find((cart) => cart.id === 'a');
    expect(original).toBeDefined();

    act(() => {
      expect(result.current.addCartUnit('a')).toBe('A61');
    });

    const updated = result.current.carts.find((cart) => cart.id === 'a');
    expect(updated?.total).toBe(61);
    expect(updated?.available).toBe((original?.available ?? 0) + 1);
    const storedCart = JSON.parse(window.localStorage.getItem('controle-carrinhos-carts') ?? '[]')
      .find((cart: { id: string }) => cart.id === 'a');
    expect(storedCart.total).toBe(61);
  });

  it('creates, updates and deletes reservations while preserving overlap validation', () => {
    const { result } = renderHook(() => useCampusData(), { wrapper });
    addTestCart(result);
    const base = { date: '2026-10-01' };
    const created = {
      teacher: 'Professor Teste',
      segment: 'Fundamental 2' as const,
      subject: 'Física',
      className: '9º ano A · Física',
      room: 'Sala 10',
      period: 'Manhã' as const,
      date: base.date,
      start: '08:00',
      end: '08:45',
      cart: 'Carrinho B',
      kind: 'Aula' as const,
      quantity: 25,
      reservedChromebooks: ['B1', 'B2'],
    };

    let createdId = 0;
    act(() => {
      expect(result.current.saveReservation(created)).toBe(true);
    });
    createdId = result.current.reservations.find((item) => item.teacher === created.teacher)?.id ?? 0;

    act(() => {
      expect(
        result.current.saveReservation(
          { ...created, room: 'Sala 20', teacher: 'Professor Alterado', quantity: 30 },
          createdId,
        ),
      ).toBe(true);
    });

    expect(result.current.reservations.find((item) => item.id === createdId)?.teacher).toBe('Professor Alterado');

    act(() => {
      expect(
        result.current.saveReservation({
          ...created,
          teacher: 'Outro',
          room: 'Sala 99',
          date: base.date,
          start: '08:15',
          end: '09:00',
          cart: 'Carrinho B',
          quantity: 10,
          reservedChromebooks: ['B3'],
        }),
      ).toBe(false);
    });

    act(() => {
      result.current.deleteReservation(createdId);
    });

    expect(result.current.reservations.some((item) => item.id === createdId)).toBe(false);
  });

  it('keeps schedules empty until an administrator configures a cart', () => {
    const { result } = renderHook(() => useCampusData(), { wrapper });

    expect(result.current.carts).toHaveLength(initialCarts.length);
    expect(result.current.cartSchedules["Carrinho A"]).toEqual(defaultCartSchedules["Carrinho A"]);
    expect(result.current.cartSchedules["Carrinho A"]).not.toEqual(result.current.cartSchedules["Carrinho B"]);
    expect(() => result.current.updateCartSchedules('Carrinho A', { Manhã: [], Tarde: [] })).not.toThrow();
  });

  it('does not authenticate nonexistent teacher accounts', () => {
    const { result } = renderHook(() => useCampusData(), { wrapper });

    expect(result.current.teacherAccounts).toHaveLength(0);
    expect(result.current.authenticateTeacher('Marina Lopes', '1234')).toBeNull();
  });

  it('blocks the Carrinho A transition slot unless the setting explicitly allows it', () => {
    const { result } = renderHook(() => useCampusData(), { wrapper });
    const base = { date: '2026-10-01' };

    expect(result.current.saveReservation({
      teacher: 'Professor Transição',
      segment: 'Fundamental 2',
      subject: 'Robótica',
      className: '8º ano C',
      room: 'Sala 30',
      period: 'Manhã',
      date: base.date,
      start: '11:50',
      end: '12:35',
      cart: 'Carrinho A',
      kind: 'Aula',
      quantity: 20,
    })).toBe(false);
  });

  it('does not allow an aula on an unavailable cart', () => {
    const { result } = renderHook(() => useCampusData(), { wrapper });
    const base = { date: '2026-10-01' };

    act(() => result.current.toggleCartUnavailable('b'));
    expect(result.current.saveReservation({
      teacher: 'Professor Carrinho Indisponível',
      segment: 'Fundamental 1',
      subject: 'História',
      className: '5º ano A',
      room: 'Sala 12',
      period: 'Tarde',
      date: base.date,
      start: '15:00',
      end: '15:45',
      cart: 'Carrinho B',
      kind: 'Aula',
      quantity: 20,
    })).toBe(false);
  });

  it('persists the activate/deactivate cart action and restores the catalog on factory reset', () => {
    const { result } = renderHook(() => useCampusData(), { wrapper });

    act(() => result.current.toggleCartUnavailable("a"));
    expect(result.current.carts.find((cart) => cart.id === "a")?.unavailable).toBe(true);
    expect(JSON.parse(window.localStorage.getItem("controle-carrinhos-carts") ?? "[]")
      .find((cart: { id: string }) => cart.id === "a").unavailable).toBe(true);

    act(() => result.current.resetData("factory"));

    expect(result.current.carts).toHaveLength(initialCarts.length);
    expect(result.current.carts.find((cart) => cart.id === "a")?.unavailable).toBe(false);
    expect(result.current.cartSchedules["Carrinho A"]).toEqual(defaultCartSchedules["Carrinho A"]);
    expect(result.current.reservations).toHaveLength(0);
    expect(result.current.operatorAccounts).toHaveLength(0);
    expect(result.current.teacherAccounts).toHaveLength(0);
    expect(result.current.wifiPoints).toHaveLength(0);
  });

  it('allows teachers to cancel future classes and classes within ten minutes of starting only', () => {
    const reservation = {
      date: '2026-09-25',
      start: '07:00',
      end: '07:45',
    };

    expect(canCancelReservation(reservation, new Date('2026-09-24T23:59:00'))).toBe(true);
    expect(canCancelReservation(reservation, new Date('2026-09-25T07:10:00'))).toBe(true);
    expect(canCancelReservation(reservation, new Date('2026-09-25T07:10:01'))).toBe(false);
    expect(canCancelReservation(reservation, new Date('2026-09-25T08:00:00'))).toBe(false);
  });

  it('automatically assigns available units to a reserve request', () => {
    const { result } = renderHook(() => useCampusData(), { wrapper });
    const base = { date: '2026-10-01' };
    const before = result.current.reservations.length;

    act(() => {
      expect(result.current.saveReservation({
        teacher: 'Professor Reserva',
        segment: 'Fundamental 2',
        subject: 'Tecnologia',
        className: '7º ano B',
        room: 'Sala 16',
        period: 'Tarde',
        date: base.date,
        start: '16:00',
        end: '16:45',
        cart: 'Carrinho B',
        kind: 'Reserva',
        quantity: 3,
      })).toBe(true);
    });

    const created = result.current.reservations.find((item) => item.teacher === 'Professor Reserva');
    expect(result.current.reservations).toHaveLength(before + 1);
    expect(created?.reservedChromebooks).toHaveLength(3);
    expect(new Set(created?.reservedChromebooks).size).toBe(3);
  });

  it('counts the reserve block dynamically and keeps Carrinho A behind B/C with confirmation', () => {
    const { result } = renderHook(() => useCampusData(), { wrapper });
    expect(result.current.reserveAvailable).toBe(18);

    act(() => result.current.toggleCartUnitReserved('b', 'B1'));
    expect(result.current.reserveAvailable).toBe(19);

    window.confirm = () => false;
    act(() => result.current.toggleCartUnitReserved('a', 'A1'));
    expect(result.current.carts.find((cart) => cart.id === 'a')?.reservedUnits).not.toContain('A1');

    window.confirm = () => true;
    act(() => result.current.toggleCartUnitReserved('a', 'A1'));
    expect(result.current.carts.find((cart) => cart.id === 'a')?.reservedUnits).toContain('A1');
    expect(result.current.reserveAvailable).toBe(20);
  });

  it('restores all or selected reserved units to their original carts', () => {
    const { result } = renderHook(() => useCampusData(), { wrapper });

    expect(result.current.carts.find((cart) => cart.id === 'b')?.reservedUnits).toHaveLength(9);
    expect(result.current.carts.find((cart) => cart.id === 'c')?.reservedUnits).toHaveLength(9);

    act(() => result.current.restoreReservedUnits(['B49', 'C46']));

    expect(result.current.carts.find((cart) => cart.id === 'b')?.reservedUnits).not.toContain('B49');
    expect(result.current.carts.find((cart) => cart.id === 'c')?.reservedUnits).not.toContain('C46');
    expect(result.current.carts.find((cart) => cart.id === 'b')?.reservedUnits).toHaveLength(8);

    act(() => result.current.restoreReservedUnits());

    expect(result.current.carts.every((cart) => cart.reservedUnits.length === 0)).toBe(true);
  });
});

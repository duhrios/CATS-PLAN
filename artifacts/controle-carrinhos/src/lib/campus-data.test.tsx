import { beforeEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import {
  CampusDataProvider,
  initialAdminAccounts,
  initialCarts,
  initialOperatorAccounts,
  initialReservations,
  initialTeacherAccounts,
  useCampusData,
} from './campus-data';

describe('Campus data core logic', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  const wrapper = ({ children }: { children: ReactNode }) => (
    <CampusDataProvider>{children}</CampusDataProvider>
  );

  it('authenticates the default admin and operator accounts', () => {
    const { result } = renderHook(() => useCampusData(), { wrapper });

    const admin = initialAdminAccounts[0];
    const operator = initialOperatorAccounts[0];

    expect(admin.password).toBe('admin123');
    expect(operator.password).toBe('123456');
    expect(result.current.authenticateAdmin(admin.name, admin.password)?.id).toBe(admin.id);
    expect(result.current.authenticateOperator(operator.name, operator.password)?.id).toBe(operator.id);
  });

  it('creates, updates and deletes reservations while preserving overlap validation', () => {
    const { result } = renderHook(() => useCampusData(), { wrapper });
    const base = initialReservations[0];
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
      createdId = result.current.reservations[0].id;
    });

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

  it('keeps the default cart schedule template and allows local edits', () => {
    const { result } = renderHook(() => useCampusData(), { wrapper });

    expect(result.current.carts).toHaveLength(initialCarts.length);
    expect(result.current.cartSchedules['Carrinho A']['Manhã'][0].start).toBe('07:00');
    expect(result.current.cartSchedules['Carrinho A']['Manhã'][0].end).toBe('07:45');

    act(() => {
      result.current.updateCartSchedules('Carrinho A', {
        ...result.current.cartSchedules['Carrinho A'],
        Manhã: [
          ...result.current.cartSchedules['Carrinho A']['Manhã'],
          { id: 'custom-slot', start: '18:00', end: '18:45' },
        ],
      });
    });

    expect(result.current.cartSchedules['Carrinho A']['Manhã'].at(-1)?.id).toBe('custom-slot');
  });

  it('registers teacher accounts with the default first-access flow', () => {
    const { result } = renderHook(() => useCampusData(), { wrapper });

    expect(result.current.teacherAccounts).toHaveLength(initialTeacherAccounts.length);
    expect(result.current.authenticateTeacher('Marina Lopes', '1234')).toBe('first-access');
    expect(result.current.authenticateTeacher('Rafael Nunes', '1234')?.id).toBe('teacher-rafael');
    expect(result.current.completeTeacherRegistration('teacher-marina', 'Marina Lopes', 'novaSenha123')).toBeTruthy();
  });
});

import { describe, it, expect } from 'vitest';
import { getOptionSeriesKey, evaluateOptionTaxEffect, OptionPositionState } from '../optionMatrix';
import { createMockTransaction } from '../../../test/helpers';

describe('Option Matrix engine tests', () => {
  const initialOptionState: OptionPositionState = {
    seriesKey: 'OPT_XYZ_CALL_100.00_2024-06-21_M100',
    underlyingSymbol: 'XYZ',
    putOrCall: 'CALL',
    strike: 100,
    expiryDate: '2024-06-21',
    multiplier: 100,
    longContracts: '0',
    totalLongAcbCad: '0.00',
    longAcbPerContractCad: '0.00',
    shortContracts: '0',
    totalUnearnedPremiumCad: '0.00',
    unearnedPremiumPerContractCad: '0.00',
  };

  it('should generate a unique identical property series key', () => {
    const key = getOptionSeriesKey('XYZ', 'CALL', 100.5, '2024-06-21', 100);
    expect(key).toBe('OPT_XYZ_CALL_100.50_2024-06-21_M100');
  });

  it('should handle BUY_TO_OPEN_OPT and update long contracts state', () => {
    const tx = createMockTransaction({
      transactionType: 'BUY_TO_OPEN_OPT',
      quantity: '2',
      amountCad: '1000', // $1,000 premium paid
      commissionCad: '10',
    });

    const { effect, updatedState } = evaluateOptionTaxEffect(tx, initialOptionState);
    expect(updatedState.longContracts).toBe('2');
    expect(updatedState.totalLongAcbCad).toBe('1010.00'); // premium + commission
    expect(updatedState.longAcbPerContractCad).toBe('505.00');
    expect(effect.isOptionDisposition).toBe(false);
  });

  it('should handle SELL_TO_CLOSE_OPT and realize capital gain/loss', () => {
    const stateWithPosition: OptionPositionState = {
      ...initialOptionState,
      longContracts: '2',
      totalLongAcbCad: '1010.00',
      longAcbPerContractCad: '505.00',
    };

    const tx = createMockTransaction({
      transactionType: 'SELL_TO_CLOSE_OPT',
      quantity: '1',
      amountCad: '600', // Proceeds of sale
      commissionCad: '10',
    });

    const { effect, updatedState } = evaluateOptionTaxEffect(tx, stateWithPosition);
    expect(updatedState.longContracts).toBe('1');
    expect(updatedState.totalLongAcbCad).toBe('505.00');
    expect(effect.isOptionDisposition).toBe(true);
    // Realized gain = Net proceeds (600 - 10 = 590) - acb removed (505) = 85.00
    expect(effect.optionGainLossCad).toBe('85.00');
  });

  it('should handle EXERCISE_LONG_CALL by rolling premium into acquired shares cost', () => {
    const stateWithPosition: OptionPositionState = {
      ...initialOptionState,
      longContracts: '1',
      totalLongAcbCad: '500.00',
      longAcbPerContractCad: '500.00',
    };

    const tx = createMockTransaction({
      transactionType: 'EXERCISE_LONG_CALL',
      quantity: '1',
      price: '100', // Strike is 100, acquired shares outlay is 1 contract * 100 strike * 100 multiplier = 10000
      commissionCad: '15',
    });

    const { effect, updatedState } = evaluateOptionTaxEffect(tx, stateWithPosition);
    expect(updatedState.longContracts).toBe('0');
    expect(effect.isShareTransaction).toBe(true);
    expect(effect.shareDeltaQty).toBe('100');
    // Share cost = Strike outlay (10000) + premium (500) + comm (15) = 10515
    expect(effect.shareCostCad).toBe('10515.00');
    expect(effect.isOptionDisposition).toBe(false); // rolled into shares cost base
  });

  it('should handle ASSIGNED_SHORT_PUT by reducing acquired shares cost by unearned premium', () => {
    const stateWithPosition: OptionPositionState = {
      ...initialOptionState,
      shortContracts: '1',
      totalUnearnedPremiumCad: '400.00',
      unearnedPremiumPerContractCad: '400.00',
    };

    const tx = createMockTransaction({
      transactionType: 'ASSIGNED_SHORT_PUT',
      quantity: '1',
      price: '100', // Strike is 100, acquired shares outlay is 10000
      commissionCad: '15',
    });

    const { effect, updatedState } = evaluateOptionTaxEffect(tx, stateWithPosition);
    expect(updatedState.shortContracts).toBe('0');
    expect(effect.isShareTransaction).toBe(true);
    // Share cost = Strike outlay (10000) - premium (400) + comm (15) = 9615
    expect(effect.shareCostCad).toBe('9615.00');
  });
});

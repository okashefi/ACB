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

  it('should handle ASSIGNED_SHORT_CALL by increasing share proceeds by unearned premium', () => {
    const stateWithPosition: OptionPositionState = {
      ...initialOptionState,
      shortContracts: '1',
      totalUnearnedPremiumCad: '400.00',
      unearnedPremiumPerContractCad: '400.00',
    };

    const tx = createMockTransaction({
      transactionType: 'ASSIGNED_SHORT_CALL',
      quantity: '1',
      price: '100', // Strike is 100
      commissionCad: '20',
    });

    const { effect, updatedState } = evaluateOptionTaxEffect(tx, stateWithPosition);
    expect(updatedState.shortContracts).toBe('0');
    expect(effect.isShareTransaction).toBe(true);
    // Proceeds = Strike proceeds (10000) + premium (400) - comm (20) = 10380
    expect(effect.shareProceedsCad).toBe('10380.00');
    expect(effect.shareDeltaQty).toBe('-100'); // shares called away
  });

  it('should handle EXERCISE_LONG_PUT by reducing share proceeds by option premium paid', () => {
    const stateWithPosition: OptionPositionState = {
      ...initialOptionState,
      strike: 120,
      longContracts: '1',
      totalLongAcbCad: '600.00',
      longAcbPerContractCad: '600.00',
    };

    const tx = createMockTransaction({
      transactionType: 'EXERCISE_LONG_PUT',
      quantity: '1',
      price: '120', // Strike is 120 (12000 gross proceeds)
      commissionCad: '25',
    });

    const { effect, updatedState } = evaluateOptionTaxEffect(tx, stateWithPosition);
    expect(updatedState.longContracts).toBe('0');
    expect(effect.isShareTransaction).toBe(true);
    // Net proceeds = Strike proceeds (12000) - premium (600) - comm (25) = 11375
    expect(effect.shareProceedsCad).toBe('11375.00');
    expect(effect.shareDeltaQty).toBe('-100');
  });

  it('should handle OPT_EXPIRY_LONG by realizing a capital loss equal to option premium paid', () => {
    const stateWithPosition: OptionPositionState = {
      ...initialOptionState,
      longContracts: '1',
      totalLongAcbCad: '300.00',
      longAcbPerContractCad: '300.00',
    };

    const tx = createMockTransaction({
      transactionType: 'OPT_EXPIRY_LONG',
      quantity: '1',
    });

    const { effect, updatedState } = evaluateOptionTaxEffect(tx, stateWithPosition);
    expect(updatedState.longContracts).toBe('0');
    expect(effect.isOptionDisposition).toBe(true);
    expect(effect.optionGainLossCad).toBe('-300.00');
  });

  it('should handle OPT_EXPIRY_SHORT by realizing a capital gain equal to unearned premium', () => {
    const stateWithPosition: OptionPositionState = {
      ...initialOptionState,
      shortContracts: '2',
      totalUnearnedPremiumCad: '800.00',
      unearnedPremiumPerContractCad: '400.00',
    };

    const tx = createMockTransaction({
      transactionType: 'OPT_EXPIRY_SHORT',
      quantity: '1', // only 1 expires
    });

    const { effect, updatedState } = evaluateOptionTaxEffect(tx, stateWithPosition);
    expect(updatedState.shortContracts).toBe('1');
    expect(effect.isOptionDisposition).toBe(true);
    expect(effect.optionGainLossCad).toBe('400.00');
    expect(updatedState.totalUnearnedPremiumCad).toBe('400.00');
  });

  it('should handle non-standard option multiplier (e.g. multiplier = 10)', () => {
    const stateWithPosition: OptionPositionState = {
      ...initialOptionState,
      multiplier: 10,
      longContracts: '1',
      totalLongAcbCad: '50.00',
      longAcbPerContractCad: '50.00',
    };

    const tx = createMockTransaction({
      transactionType: 'EXERCISE_LONG_CALL',
      quantity: '1',
      price: '100', // Strike is 100
      commissionCad: '5',
    });

    const { effect } = evaluateOptionTaxEffect(tx, stateWithPosition);
    expect(effect.isShareTransaction).toBe(true);
    expect(effect.shareDeltaQty).toBe('10'); // 1 contract * 10 multiplier = 10 shares
    // Share cost = Strike outlay (100 * 1 * 10 = 1000) + premium (50) + comm (5) = 1055
    expect(effect.shareCostCad).toBe('1055.00');
  });

  it('should handle BUY_TO_CLOSE_OPT and realize capital gain/loss on closing short options', () => {
    const stateWithPosition: OptionPositionState = {
      ...initialOptionState,
      shortContracts: '2',
      totalUnearnedPremiumCad: '800.00',
      unearnedPremiumPerContractCad: '400.00',
    };

    const tx = createMockTransaction({
      transactionType: 'BUY_TO_CLOSE_OPT',
      quantity: '1',
      price: '300', // cost to close is 300
      commissionCad: '20',
    });

    const { effect, updatedState } = evaluateOptionTaxEffect(tx, stateWithPosition);
    expect(updatedState.shortContracts).toBe('1');
    expect(effect.isOptionDisposition).toBe(true);
    // gain = unearned premium closed (400) - cost to close (300) - comm (20) = 80
    expect(effect.optionGainLossCad).toBe('80.00');
    expect(updatedState.totalUnearnedPremiumCad).toBe('400.00');
  });
});

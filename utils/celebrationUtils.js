import { clampValue } from './mathUtils';

export const shouldTriggerCompletionCelebration = ({
  isHydrated,
  wasComplete,
  isComplete,
  actionDateKey,
  selectedDateKey,
}) =>
  Boolean(
    isHydrated &&
      !wasComplete &&
      isComplete &&
      actionDateKey &&
      actionDateKey === selectedDateKey
  );

export const willProgressReachCompletion = ({
  currentValue,
  limitValue,
  direction,
  amount,
}) => {
  if (
    !Number.isFinite(currentValue) ||
    !Number.isFinite(limitValue) ||
    !Number.isFinite(amount) ||
    limitValue <= 0 ||
    amount <= 0 ||
    (direction !== 1 && direction !== -1) ||
    currentValue >= limitValue
  ) {
    return false;
  }

  const nextValue = clampValue(currentValue + direction * amount, 0, limitValue);
  return nextValue === limitValue;
};

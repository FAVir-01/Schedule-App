const finiteOrZero = (value) => (Number.isFinite(value) ? value : 0);

// Mantém a posição visual atual quando uma nova ordenação interrompe outra.
// A posição apresentada é o layout anterior somado ao translateY ainda ativo.
export const getInterruptedTaskReorderOffset = ({
  previousY,
  currentOffset,
  nextY,
}) =>
  finiteOrZero(previousY) +
  finiteOrZero(currentOffset) -
  finiteOrZero(nextY);

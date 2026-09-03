export const MAX_REFLECTION_NOTE_LENGTH = 10000;

// O reconhecimento nativo pode devolver CRLF (Android) ou CR (imagens
// antigas). Mantemos as quebras de linha, mas usamos um formato único para o
// rascunho continuar previsível e editável.
export const normalizeRecognizedText = (value) =>
  `${value ?? ''}`.replace(/\r\n?/g, '\n').trim();

// A nota só muda depois da confirmação explícita. Quando ela já contém texto,
// o trecho digitalizado entra como um novo parágrafo — nunca substitui o que o
// usuário escreveu.
export const appendRecognizedText = (currentNote, recognizedText) => {
  const current = `${currentNote ?? ''}`.trimEnd();
  const recognized = normalizeRecognizedText(recognizedText);

  if (!recognized) {
    return current;
  }
  return current ? `${current}\n\n${recognized}` : recognized;
};

export function getApproximateTokens(text: string) {
  if (!text) {
    return 0;
  }
  // VERY rough estimate of tokens lol
  return Math.ceil(text.length / 4);
}

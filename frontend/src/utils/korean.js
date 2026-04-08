// Korean (두벌식) → English QWERTY mapping
const KO_TO_EN = {
    // consonants
    ㅂ: "q", ㅈ: "w", ㄷ: "e", ㄱ: "r", ㅅ: "t",
    ㅛ: "y", ㅕ: "u", ㅑ: "i", ㅐ: "o", ㅔ: "p",
    ㅁ: "a", ㄴ: "s", ㅇ: "d", ㄹ: "f", ㅎ: "g",
    ㅗ: "h", ㅓ: "j", ㅏ: "k", ㅣ: "l",
    ㅋ: "z", ㅌ: "x", ㅊ: "c", ㅍ: "v", ㅠ: "b",
    ㅜ: "n", ㅡ: "m",
    // shift consonants
    ㅃ: "Q", ㅉ: "W", ㄸ: "E", ㄲ: "R", ㅆ: "T",
    ㅒ: "O", ㅖ: "P",
};

/**
 * Convert any Korean characters in a string to their QWERTY equivalents.
 * Non-Korean characters pass through unchanged.
 */
export function koToEn(str) {
    return Array.from(str)
        .map((ch) => KO_TO_EN[ch] ?? ch)
        .join("");
}

import "@testing-library/jest-dom/vitest";

// jsdom's Blob implementation is missing `.text()` (a standard method every
// real browser has supported since ~2018 — this is a test-environment gap,
// not something application code should work around). Polyfilled here via
// FileReader (which jsdom does implement correctly) so
// src/hooks/useAiVoice.ts's `blob.text()` call — reading a backend error
// response's JSON body, which axios delivers as a Blob when
// `responseType: "blob"` — works the same in tests as it does in a real
// browser.
if (typeof Blob !== "undefined" && !Blob.prototype.text) {
  Blob.prototype.text = function (this: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsText(this);
    });
  };
}

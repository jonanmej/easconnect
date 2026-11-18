import { describe, it, expect } from "vitest";
import { parseDecimal } from "../parse-decimal";

describe("parseDecimal", () => {
  it("acepta coma decimal", () => expect(parseDecimal("12,5")).toBe(12.5));
  it("acepta punto decimal", () => expect(parseDecimal("12.5")).toBe(12.5));
  it("acepta miles con punto y decimal con coma", () => expect(parseDecimal("1.234,5")).toBe(1234.5));
  it("acepta miles con coma y decimal con punto", () => expect(parseDecimal("1,234.5")).toBe(1234.5));
  it("acepta enteros y espacios", () => expect(parseDecimal(" 40 ")).toBe(40));
  it("vacío es null", () => {
    expect(parseDecimal("")).toBeNull();
    expect(parseDecimal("   ")).toBeNull();
    expect(parseDecimal(null)).toBeNull();
  });
  it("texto inválido es null", () => {
    expect(parseDecimal("abc")).toBeNull();
    expect(parseDecimal("12a")).toBeNull();
    expect(parseDecimal("1,2,3")).toBeNull();
    expect(parseDecimal("12,")).toBeNull();
    expect(parseDecimal("1.23,4.5")).toBeNull();
    expect(parseDecimal("12.34,5")).toBeNull();
  });
});

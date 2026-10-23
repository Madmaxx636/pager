import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// React needs every screen to run the same hooks on every render. A hook placed after an early "return" runs only on some renders, and when a chat
// or a list briefly disappears mid-update React throws "rendered fewer hooks than expected" (error 300) and the whole screen goes blank.
// This reads the screens' source and fails if a hook comes after an early return in the same component.
const hook = /^ {2}(const \[?[\w, ]+\]? = )?use[A-Z]\w*[<(]/;
const early = /^ {2}if \(.*\) (return\b|\{ return\b)/;

function problems(file: string, text: string): string[] {
  const lines = text.split("\n"), out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/^(export )?(default )?function [A-Z]\w*\(/.test(lines[i])) continue;
    let j = i + 1; while (j < lines.length && !lines[j].startsWith("}")) j++;
    let seen = 0;
    for (let k = i; k < j; k++) {
      if (!seen && early.test(lines[k])) seen = k + 1;
      else if (seen && hook.test(lines[k])) out.push(`${file}:${k + 1} has a hook after the early return on line ${seen}`);
    }
    i = j;
  }
  return out;
}

describe("hooks stay above early returns", () => {
  it("in every screen", () => {
    const dir = join(__dirname, "ui");
    const found = readdirSync(dir).filter((f) => f.endsWith(".tsx")).flatMap((f) => problems(`ui/${f}`, readFileSync(join(dir, f), "utf8")));
    expect(found).toEqual([]);
  });
  it("notices the mistake when it is made", () => {
    const bad = "function Screen() {\n  const a = useX();\n  if (!a) return null;\n  const [b, setB] = useState<number>(0);\n  return b;\n}\n";
    expect(problems("t.tsx", bad)).toHaveLength(1);
  });
});

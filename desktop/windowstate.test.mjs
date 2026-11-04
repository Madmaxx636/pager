import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const { startBounds } = createRequire(import.meta.url)("./windowstate.js");

const screen1 = { x: 0, y: 0, width: 1920, height: 1040 };
const screen2 = { x: 1920, y: 0, width: 1920, height: 1040 };

test("no saved window: the default size", () => assert.deepEqual(startBounds(undefined, [screen1]), { width: 1180, height: 760 }));
test("a saved window on a connected screen is kept", () => assert.deepEqual(startBounds({ x: 100, y: 80, width: 1000, height: 700 }, [screen1]), { x: 100, y: 80, width: 1000, height: 700 }));
test("the position Windows reports for a minimised window is ignored, the size kept", () => assert.deepEqual(startBounds({ x: -32000, y: -32000, width: 1000, height: 700 }, [screen1]), { width: 1000, height: 700 }));
test("a window left on a screen that is gone opens on the remaining one", () => assert.deepEqual(startBounds({ x: 2100, y: 50, width: 1000, height: 700 }, [screen1]), { width: 1000, height: 700 }));
test("the same window is kept while that screen is connected", () => assert.deepEqual(startBounds({ x: 2100, y: 50, width: 1000, height: 700 }, [screen1, screen2]), { x: 2100, y: 50, width: 1000, height: 700 }));
test("a window whose title bar is above the screen is moved back", () => assert.deepEqual(startBounds({ x: 100, y: -400, width: 1000, height: 700 }, [screen1]), { width: 1000, height: 700 }));
test("a tiny or huge remembered size is brought into range", () => {
  assert.deepEqual(startBounds({ x: 0, y: 0, width: 50, height: 50 }, [screen1]), { x: 0, y: 0, width: 360, height: 500 });
  assert.equal(startBounds({ x: 0, y: 0, width: 99999, height: 700 }, [screen1]).width, 10000);
});
test("garbage in the saved file does not break it", () => assert.deepEqual(startBounds({ width: "wide", height: null }, [screen1]), { width: 1180, height: 760 }));

import { readFileSync } from "node:fs";
import { parseFont } from "../src/index.ts";

export const font = parseFont(
  readFileSync(new URL("./fixtures/YoungSerif-Regular.ttf", import.meta.url)),
);

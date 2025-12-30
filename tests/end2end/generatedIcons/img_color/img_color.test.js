
import { describe, test, expect, afterEach } from "@jest/globals";

import ewab from "../../../../src/ewab.js";

describe("runs", () => {
	test("run?", async () => {
		ewab();
		expect(true).toBeTruthy();
	});
});

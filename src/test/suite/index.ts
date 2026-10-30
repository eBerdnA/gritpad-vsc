import Mocha = require("mocha");
import * as path from "node:path";

export function run(): Promise<void> {
  const mocha = new Mocha({ ui: "tdd", color: true, timeout: 20000 });
  mocha.addFile(path.resolve(__dirname, "extension.test.js"));

  return new Promise((resolve, reject) => {
    mocha.run((failures) => {
      if (failures > 0) {
        reject(new Error(`${failures} Extension Host integration test(s) failed.`));
      } else {
        resolve();
      }
    });
  });
}

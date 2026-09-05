import { scan } from "../../src/runner.ts";
export default async function (): Promise<void> {
  await scan();
}

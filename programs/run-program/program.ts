import { runProgram } from "../../src/admin.ts";

export default function execute(programId?: string): Promise<void> {
  return runProgram(programId);
}

import { context } from "@the8020/context";

export default function echo(...inputs: unknown[]) {
  console.info("Job started", { username: context.username });
  const output = { inputs, username: context.username, nodeId: context.nodeId };
  console.info("Job finished");
  return output;
}

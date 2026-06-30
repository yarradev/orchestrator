import type { Dispatcher, DispatchRequest } from "../run.js";
import type { Verdict } from "../types.js";

// Scripted dispatcher for tests: returns a fixed Verdict, or computes one per request.
export class FakeDispatcher implements Dispatcher {
  private readonly calls: DispatchRequest[] = [];
  constructor(private readonly script: Verdict | ((req: DispatchRequest) => Verdict)) {}
  async dispatch(req: DispatchRequest): Promise<Verdict> {
    this.calls.push(req);
    return typeof this.script === "function" ? this.script(req) : this.script;
  }
  get requests(): readonly DispatchRequest[] {
    return this.calls;
  }
}

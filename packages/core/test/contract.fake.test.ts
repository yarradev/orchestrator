import { runBoardBackendContract } from "../src/testing/contract.js";
import { InMemoryBoardBackend } from "../src/testing/fake-backend.js";
import { makeCanonicalCard } from "../src/card.js";

runBoardBackendContract({
  name: "InMemoryBoardBackend",
  make: () => new InMemoryBoardBackend(["spec", "dev", "test", "done"], ["done"]),
  seed: (b, card) => (b as InMemoryBoardBackend).seed(card),
  card: (over) => makeCanonicalCard(over),
});

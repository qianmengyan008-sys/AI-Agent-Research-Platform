export function evaluateIteration(
  record: unknown,
  expectedCommit: string,
): {
  conclusion: string;
  deployment_eligible: boolean;
  online_accepted: boolean;
  mentor_test_ready: false;
  formal_ready: false;
  blocked: string[];
};

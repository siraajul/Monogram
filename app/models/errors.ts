import type { OptionSetIssue } from "@personalizer/contract";

export class NotFoundError extends Error {
  constructor(what: string) {
    super(`${what} not found`);
    this.name = "NotFoundError";
  }
}

/** Thrown by publish when the option set fails `validateOptionSet`. `issues` is safe to show the merchant. */
export class PublishValidationError extends Error {
  constructor(public readonly issues: OptionSetIssue[]) {
    super(`Option set cannot be published: ${issues.map((i) => i.message).join(" ")}`);
    this.name = "PublishValidationError";
  }
}

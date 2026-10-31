import "server-only";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public retryable = false,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const missingProject = () =>
  new ApiError(
    404,
    "PROJECT_NOT_FOUND",
    "This production could not be found in this browser.",
  );
export const revisionConflict = () =>
  new ApiError(
    409,
    "REVISION_CONFLICT",
    "This production has changed. Refresh it before adopting your changes.",
  );

// Thrown when a device lookup fails. Lets `ensureDevice` distinguish
// expected lookup failures (user-visible warning) from programming errors
// (logged only).
export class NotFoundError extends Error {
  public override name = 'NotFoundError'
}

import { type AxiosError, isAxiosError } from 'axios'
import type APICallContextData from '../lib/APICallContextData'
import type { ErrorData } from '../types'

/* eslint-disable @typescript-eslint/no-explicit-any */
type APICallContextClass = new (...args: any[]) => APICallContextData
type APICallContextWithErrorMessageClass = new (
  ...args: any[]
) => APICallContextData & { errorMessage: string }
/* eslint-enable @typescript-eslint/no-explicit-any */

const getAPIErrorMessage = (error: AxiosError): string => {
  const { data } = error.response ?? {}
  if (typeof data !== 'undefined' && data) {
    const { error_message: message, detail_message: detailMessage } =
      data as ErrorData
    const errorMessage: string = detailMessage ?? message ?? ''
    if (errorMessage) {
      return errorMessage
    }
  }
  return error.message
}

export const getErrorMessage = (error: unknown): string => {
  let errorMessage = String(error)
  if (isAxiosError(error)) {
    errorMessage = getAPIErrorMessage(error)
  } else if (error instanceof Error) {
    errorMessage = error.message
  }
  return errorMessage
}

const withErrorMessage = <T extends APICallContextClass>(
  base: T,
  error: AxiosError,
): APICallContextWithErrorMessageClass =>
  class extends base {
    public readonly errorMessage: string = getAPIErrorMessage(error)
  }

export default withErrorMessage

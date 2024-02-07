import { type AxiosError, isAxiosError } from 'axios'
import type APICallContextData from '../lib/APICallContextData'
import type { ErrorData } from '../types'

export interface APICallContextDataWithErrorMessage extends APICallContextData {
  readonly errorMessage: string
}

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
  switch (true) {
    case isAxiosError(error):
      return getAPIErrorMessage(error)
    case error instanceof Error:
      return error.message
    default:
      return String(error)
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const withErrorMessage = <T extends new (...args: any[]) => APICallContextData>(
  base: T,
  error: AxiosError,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): new (...args: any[]) => APICallContextDataWithErrorMessage =>
  class extends base {
    public readonly errorMessage: string = getAPIErrorMessage(error)
  }

export default withErrorMessage

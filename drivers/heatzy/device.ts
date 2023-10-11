import BaseHeatzyDevice from '../../bases/device'
import type { DevicePostData, Mode } from '../../types'

export = class HeatzyDevice extends BaseHeatzyDevice {
  protected buildPostDataMode(mode: Mode): DevicePostData {
    return {
      attrs: {
        mode: this.modeToNumber[mode],
      },
    }
  }

  protected async handleSuccess(
    success: boolean,
    postData: DevicePostData,
  ): Promise<void> {
    if (success) {
      await this.updateCapabilities(postData.attrs)
    }
  }
}

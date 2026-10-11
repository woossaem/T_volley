import AudioToolbox
import AVFoundation
import ExpoModulesCore

public class BluetoothVoiceRouteModule: Module {
  public func definition() -> ModuleDefinition {
    Name("BluetoothVoiceRoute")

    AsyncFunction("prepare") { () -> [String: Any] in
      BluetoothVoiceRouteModule.activateHeadsetInput()
    }
    .runOnQueue(.main)

    Function("release") {
      BluetoothVoiceRouteModule.clearPreferredInput()
    }
    .runOnQueue(.main)

    Function("requestAudioFocus") { () -> [String: Any] in
      ["granted": true]
    }

    Function("abandonAudioFocus") {
    }

    Function("playStartCue") {
      AudioServicesPlaySystemSound(1113)
    }
    .runOnQueue(.main)

    Function("playFailureCue") {
    }
  }

  /// PlayAndRecord + 블루투스 입력 옵션을 걸고, HFP/LE 헤드셋 마이크를 우선 입력으로 지정한다.
  static func activateHeadsetInput() -> [String: Any] {
    let session = AVAudioSession.sharedInstance()
    do {
      try session.setCategory(
        .playAndRecord,
        mode: .default,
        options: [.allowBluetooth, .allowBluetoothA2DP, .defaultToSpeaker]
      )
      try session.setActive(true)
    } catch {
      return ["bluetooth": false, "input": "microphone"]
    }

    let inputs = session.availableInputs ?? []
    let headset = inputs.first { port in
      port.portType == .bluetoothHFP || port.portType == .bluetoothLE
    }
    if let headset {
      do {
        try session.setPreferredInput(headset)
        return ["bluetooth": true, "input": headset.portName]
      } catch {
        return ["bluetooth": false, "input": session.currentRoute.inputs.first?.portName ?? "microphone"]
      }
    }
    return ["bluetooth": false, "input": session.currentRoute.inputs.first?.portName ?? "microphone"]
  }

  static func clearPreferredInput() {
    try? AVAudioSession.sharedInstance().setPreferredInput(nil)
  }
}

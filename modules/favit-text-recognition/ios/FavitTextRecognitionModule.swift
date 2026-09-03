import ExpoModulesCore
import Vision

public class FavitTextRecognitionModule: Module {
  public func definition() -> ModuleDefinition {
    Name("FavitTextRecognition")

    AsyncFunction("recognizeText") { (uri: String, language: String, promise: Promise) in
      guard let imageURL = URL(string: uri), imageURL.isFileURL else {
        promise.reject(
          "ERR_TEXT_IMAGE_UNAVAILABLE",
          "The selected image could not be opened."
        )
        return
      }

      DispatchQueue.global(qos: .userInitiated).async {
        let request = VNRecognizeTextRequest { request, error in
          if let error {
            promise.reject(error)
            return
          }

          let observations = request.results as? [VNRecognizedTextObservation] ?? []
          let text = observations.compactMap { observation in
            observation.topCandidates(1).first?.string
          }.joined(separator: "\n")
          promise.resolve(text)
        }

        request.recognitionLevel = .accurate
        request.usesLanguageCorrection = true
        request.recognitionLanguages = language == "pt"
          ? ["pt-BR", "en-US"]
          : ["en-US", "pt-BR"]

        do {
          try VNImageRequestHandler(url: imageURL, options: [:]).perform([request])
        } catch {
          promise.reject(error)
        }
      }
    }
  }
}

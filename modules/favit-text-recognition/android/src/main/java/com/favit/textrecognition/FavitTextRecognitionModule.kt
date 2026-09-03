package com.favit.textrecognition

import android.net.Uri
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class FavitTextRecognitionModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("FavitTextRecognition")

    AsyncFunction("recognizeText") { uri: String, _language: String, promise: Promise ->
      val context = appContext.reactContext
      if (context == null) {
        promise.reject(
          "ERR_TEXT_RECOGNITION_UNAVAILABLE",
          "Text recognition is unavailable.",
          null
        )
        return@AsyncFunction
      }

      val image = try {
        InputImage.fromFilePath(context, Uri.parse(uri))
      } catch (error: Exception) {
        promise.reject(
          "ERR_TEXT_IMAGE_UNAVAILABLE",
          "The selected image could not be opened.",
          error
        )
        return@AsyncFunction
      }

      val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
      recognizer.process(image)
        .addOnSuccessListener { result ->
          promise.resolve(result.text)
          recognizer.close()
        }
        .addOnFailureListener { error ->
          promise.reject(
            "ERR_TEXT_RECOGNITION_FAILED",
            "The image text could not be recognized.",
            error
          )
          recognizer.close()
        }
    }
  }
}
